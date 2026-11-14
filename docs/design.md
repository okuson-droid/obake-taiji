# お化け退治ボードゲーム 実装設計書

- 版：設計書 v0.2（2026-11-13）
- v0.2 の変更：Supabase の鍵を anon key から publishable key に変更し、準備手順を setup.md に分離した。Node.js を 24 系に固定した。
- 準拠ルール：rules.md v0.1
- 対象：GitHub Pages で公開し、ブラウザで遊べる版（ローカル対戦とオンライン対戦）
- 実装担当：Claude Code。設計判断の根拠は decisions.md を参照する。

## 1. 目的と範囲

1.1 rules.md v0.1 のルールを、1 台で交代して遊ぶローカル版と、Supabase を介して複数の端末で遊ぶオンライン版として実装する。

1.2 対象外とするもの：CPU 対戦相手、観戦、チャット、戦績の保存、ヴァリアント。見た目の作り込みも対象外である（decisions.md の U 項を参照）。

1.3 この設計書と rules.md が食い違う場合は rules.md を正とし、実装を止めて報告する。rules.md に定めがなく、合法手・得点・勝敗に影響する箇所を見つけた場合も、推測で補わずに報告する。

## 2. リポジトリの構成

リポジトリ名は `obake-taiji` とする。

```
obake-taiji/
  CLAUDE.md               Claude Code 向けの運用規約（付録 A）
  docs/
    rules.md              ルールの写し（正は claude.ai プロジェクト）
    design.md             この設計書の写し
  src/
    data/                 カード・盤面の静的データ
      board.ts            部屋・辺・スタート地点・開始時の向き
      cards.ts            移動カード 180 枚・お化けカード 30 枚
    game/                 ゲームロジック（純粋関数のみ）
      types.ts            型定義
      rng.ts              mulberry32 とシャッフル・ダイス
      board-ops.ts        方角の計算、隣接、辺の判定、連結判定
      engine.ts           createGame / getOptions / applyMove / isGameOver / finalScores
      executor.ts         効果キューの実行
      history.ts          replay / isCheckpoint / undoLast
      targets.ts          targetOf
      explain.ts          explain
      queries.ts          UI 向けの派生値
      visibility.ts       非公開情報の伏せ処理
    ui/                   React コンポーネント
      gestures.ts         合法手の種類と所作の対応表
    net/                  オンライン同期
      room.ts             Room インターフェースと RoomDoc 型
      supabase-room.ts    本番実装
      fake-room.ts        検査用の偽 DB（localStorage 共有）
    main.tsx
  tests/                  Vitest（単体・性質テスト）
  e2e/                    Playwright（自動対戦・同期検査）
  deploy/
    supabase.sql          テーブル・関数・RLS の定義（§7.4）
    README.md             Supabase と GitHub Pages の準備手順（§10.3）
  .github/workflows/
    ci.yml                型検査・テスト・ビルド・受け入れ検査
    deploy.yml            GitHub Pages への公開
```

依存の向き：`src/game/` は `src/data/` だけを import してよい。`src/ui/` と `src/net/` を import してはならない。`src/ui/` はゲームの状態を `src/game/` の関数呼び出しだけで変える。

## 3. データモデル

### 3.1 基本の型

```ts
type Col = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type Row = 1 | 2 | 3 | 4 | 5 | 6;
type Cell = `${Col}${Row}`;            // 例："C3"
type Dir = 'N' | 'E' | 'S' | 'W';       // 北・東・南・西
type EdgeId = `E:${Cell}` | `S:${Cell}`;
// "E:B3" は B3 と C3 の間の辺、"S:B3" は B3 と B4 の間の辺。
// E は列 A〜E・行 1〜6 の 30 本、S は列 A〜F・行 1〜5 の 30 本、計 60 本（rules §2.2）。
type Seat = 0 | 1 | 2 | 3;              // 内部は 0 始まり。表示は「席 1」〜「席 4」
```

方角の回転（rules §5.1）：時計回りは N→E→S→W→N である。「右」は時計回りに 1 つ、「左」は反時計回りに 1 つ、「後ろ」は 2 つ回す。北は行番号が減る方向、東は列が進む方向である。

### 3.2 カード

```ts
type HumanCardKind = 'front' | 'back' | 'right' | 'left' | 'N' | 'E' | 'S' | 'W';
type MoveCard =
  | { id: MoveCardId; type: 'human'; kind: HumanCardKind }
  | { id: MoveCardId; type: 'ghost'; dir: Dir }
  | { id: MoveCardId; type: 'barrier' };
type MoveCardId = `M${string}`;         // "M000"〜"M179"

type GhostCard = { id: GhostCardId; normal: number; golden: number };
type GhostCardId = `G${string}`;        // "G00"〜"G29"
```

カード ID の割り当て（rules §2.9・§2.10。プロトコルの一部であり変えない）：

- M000〜M119：人間移動。front・back・right・left・N・E・S・W の順に各 15 枚（M000〜M014 が front、M015〜M029 が back、…、M105〜M119 が W）
- M120〜M159：お化け移動。N・E・S・W の順に各 10 枚
- M160〜M179：通せん棒
- G00〜G09：お化け 1 匹、G10〜G19：お化け 2 匹、G20〜G26：お化け 3 匹、G27〜G29：ゴールデン 1 匹

表示名：front＝前、back＝後ろ、right＝右、left＝左、N＝北、E＝東、S＝南、W＝西。

### 3.3 GameState

```ts
type ChipKind = 'normal' | 'golden';
type Chip = { id: ChipId; kind: ChipKind; cell: Cell };
type ChipId = `c${number}`;             // 配置順に c1, c2, …

type PlayerState = {
  seat: Seat;
  start: Cell;                          // rules §2.6
  pos: Cell;
  facing: Dir;
  hand: MoveCardId[];                   // 引いた順
  held: { normal: number; golden: number };  // 獲得済みチップ
};

type GameConfig = { players: 2 | 3 | 4 };

type GameState = {
  rulesVersion: '0.1';
  config: GameConfig;
  seed: number;
  rng: number;                          // mulberry32 の内部状態（uint32）
  players: PlayerState[];
  wraith: Cell;
  chips: Chip[];                        // ボード上のチップ。配置順
  nextChipId: number;
  removedChips: { normal: number; golden: number };  // ゲームから除外した数
  barriers: EdgeId[];                   // 昇順に整列して保持
  moveDeck: MoveCardId[];               // 先頭が山札の一番上
  moveDiscard: MoveCardId[];            // 捨てた順
  ghostDeck: GhostCardId[];
  ghostDiscard: GhostCardId[];
  turn: Seat;                           // 手番プレイヤー
  turnNo: number;                       // 1 始まり
  contactThisTurn: boolean;             // rules §4.5・§7.4
  pending: Pending | null;              // null はゲーム終了時のみ
  effectQueue: Instr[];
  events: GameEvent[];                  // 直前の applyMove で起きた出来事
  result: GameResult | null;
};

type GameResult = {
  reason: 'score' | 'ghostDeck';        // rules §9.1 / §9.2
  winners: Seat[];                      // 2 人以上なら引き分け
  scores: number[];
};
```

`GameState` は JSON で直列化できる形に保つ（関数・Map・Set・undefined を入れない）。

### 3.4 選択待ち（Pending）

```ts
type Pending =
  | { kind: 'overlapChoice'; player: Seat; options: OptionId[] }   // rules §7.5
  | { kind: 'playCard';      player: Seat; options: OptionId[] }   // rules §4.3
  | { kind: 'ghostTarget';   player: Seat; card: MoveCardId; options: OptionId[] }  // §5.4
  | { kind: 'barrierTarget'; player: Seat; card: MoveCardId; options: OptionId[] }  // §5.5
  | { kind: 'penaltyChip';   player: Seat; options: OptionId[] };  // §7.2
```

### 3.5 効果キューの命令

効果はデータとして `effectQueue` に積み、`executor.ts` が先頭から実行する。選択が必要な命令に来たら `pending` を立てて止まる。

```ts
type Instr =
  | { op: 'startTurn' }                          // §7.5 の判定 → overlapChoice か playCard
  | { op: 'moveHuman'; seat: Seat; card: MoveCardId }
  | { op: 'moveGhost'; target: ChipId | 'wraith'; dir: Dir }
  | { op: 'placeBarrier'; edge: EdgeId }
  | { op: 'removeBarrier'; edge: EdgeId }
  | { op: 'contact'; seats: Seat[] }             // §7.2 の 1. を実行し penalty を積む
  | { op: 'penalty'; seat: Seat }                // チップ選択（必要なら pending）
  | { op: 'purgeOverlap' }                       // §7.5(b) の除外
  | { op: 'judge' }                              // §6
  | { op: 'refillIfEmpty' }                      // §4.6
  | { op: 'place' }                              // §8
  | { op: 'draw'; seat: Seat }                   // §4.7
  | { op: 'endTurn' };                           // §4.8 → startTurn を積む
```

1 手番の標準の命令列：カードを解決する命令 → `judge`（`contactThisTurn` なら飛ばす）→ `refillIfEmpty` → `draw` → `endTurn`。

### 3.6 出来事（GameEvent）

```ts
type GameEvent =
  | { type: 'cardPlayed'; seat: Seat; card: MoveCardId }
  | { type: 'humanMoved'; seat: Seat; from: Cell; to: Cell; facing: Dir; blocked: boolean }
  | { type: 'ghostMoved'; chip: ChipId; from: Cell; to: Cell; blocked: boolean }
  | { type: 'wraithMoved'; from: Cell; to: Cell; blocked: boolean }
  | { type: 'barrierPlaced'; edge: EdgeId }
  | { type: 'barrierRemoved'; edge: EdgeId }
  | { type: 'contact'; seats: Seat[] }
  | { type: 'returnedToStart'; seat: Seat; to: Cell }
  | { type: 'chipLost'; seat: Seat; kind: ChipKind | null }
  | { type: 'acquired'; seat: Seat; chips: ChipId[]; points: number }
  | { type: 'overlapPurged'; chips: ChipId[] }
  | { type: 'ghostCardsRevealed'; cards: GhostCardId[] }
  | { type: 'ghostPlaced'; chip: ChipId; kind: ChipKind; cell: Cell; dice: [number, number] }
  | { type: 'cardDrawn'; seat: Seat; card: MoveCardId | null }  // 他人向けには null に伏せる
  | { type: 'moveDeckReshuffled' }
  | { type: 'turnStarted'; seat: Seat; turnNo: number }
  | { type: 'gameEnded'; result: GameResult };
```

## 4. 公開 API

### 4.1 engine.ts

- `createGame(config: GameConfig, seed: number): GameState`：rules §3 の準備を行い、席 1 の最初の選択待ちで止まった状態を返す。
- `getOptions(state: GameState): OptionId[]`：`state.pending.options` を返す。ゲーム終了時は空配列。
- `applyMove(state: GameState, option: OptionId): GameState`：回答を適用し、次の選択待ちまで効果キューを進めた新しい状態を返す。引数の state は変更しない。合法でない option には例外を投げる。`events` は今回の適用で起きた出来事だけに置き換える。
- `isGameOver(state): boolean`、`finalScores(state): number[]`：席順の得点（通常 1 点、ゴールデン 3 点）。

### 4.2 history.ts

- `replay(checkpoint: GameState, moves: OptionId[]): GameState`：チェックポイントから選択肢 ID を順に適用する。
- `isCheckpoint(prev: GameState, next: GameState): boolean`：次のいずれかで真とする。乱数を消費した（`rng` が変わった）、非公開情報が公開された（移動カードを引いた）、怨霊との接触が発生した、選択待ちのプレイヤーが変わった、手番番号が変わった、ゲームが終了した。
- `undoLast(checkpoint: GameState, moves: OptionId[]): OptionId[] | null`：`moves` が空でなければ末尾を 1 つ除いた列を返す。空なら null（取り消せない）。

この設計では、人間移動カードの使用や対象の選択は、手番の終了（カードを引く）まで一気に進むか、怨霊との接触で止まるため、必ずチェックポイントになる。取り消せるのは、お化け移動カード・通せん棒カードを選んで対象を選ぶ前の段階と、§7.5 で「続行」を選んだ直後だけである。

### 4.3 targets.ts

```ts
type Target =
  | { type: 'handCard'; card: MoveCardId }
  | { type: 'chip'; chip: ChipId }
  | { type: 'wraith' }
  | { type: 'edge'; edge: EdgeId; mode: 'place' | 'remove' }
  | { type: 'heldChip'; kind: ChipKind }
  | { type: 'button'; action: 'overlapContinue' | 'overlapPurge' };
function targetOf(state: GameState, option: OptionId): Target;
```

### 4.4 explain.ts

`explain(state, viewer: Seat, element: Target): string | null` は、その要素を選べない理由の表示用の文を返す。選べる場合は null を返す。判定には使わない。例：

- 手番外：「席 2 の手番です」
- 連結条件に反する辺：「ここに置くと行き来できない部屋ができるため設置できません」

### 4.5 queries.ts

- `scoreOf(state, seat): number`
- `chipsAt(state, cell): Chip[]`
- `previewHumanMove(state, seat, card): { to: Cell; facing: Dir; blocked: boolean; contact: boolean }`（U-02 のプレビュー用）
- `canPlaceBarrier(state, edge): boolean`、`placeableEdges(state): EdgeId[]`
- `isWraithRoom(state, cell): boolean`
- `deckCounts(state): { move: number; moveDiscard: number; ghost: number }`

UI はこれらを呼び、移動先や可否をみずから再計算しない。

### 4.6 visibility.ts

- `maskEvents(events, viewer): GameEvent[]`：他人の `cardDrawn.card` を null にする。
- 他人の手札は枚数だけを UI に渡す。カード ID・種類を DOM に出さない。

## 5. 処理の詳細

5.1 準備（`createGame`）は §6.2 の乱数消費順に従う。準備の最後に `startTurn` を実行する。

5.2 `startTurn`：`turnStarted` を記録し、`contactThisTurn` を false にする。ボード上のチップが 1 枚以上で、そのすべてが怨霊と同じ部屋にあれば `overlapChoice`、そうでなければ `playCard` を立てる。

5.3 `play:<cardId>`：カードを手札から捨て札へ移し `cardPlayed` を記録する。人間移動なら `moveHuman` を積む。お化け移動なら `ghostTarget`、通せん棒なら `barrierTarget` を立てる。

5.4 `moveHuman`：rules §5.1 の手順で向きを変え、移動の可否を判定する。移動先に怨霊がいれば `contact` を積む（rules §5.3）。

5.5 `moveGhost`：チップは方角の隣へ動く。外周なら動かない。怨霊は外周またはスタート地点なら動かない（rules §7.3）。怨霊が動いた先にプレイヤーがいれば、その全員を対象に `contact` を積む。

5.6 `contact`：対象を席順（手番プレイヤーから）に並べ、各プレイヤーの駒をスタート地点・開始時の向きに戻し、`contactThisTurn` を true にする。各プレイヤーについて `penalty` を積む。

5.7 `penalty`：獲得チップが 0 枚なら `chipLost(kind: null)` を記録して終わる。1 種類しか持っていなければその種類を自動で失う（選択待ちを立てない）。両方を持っていれば `penaltyChip` を立てる。

5.8 `judge`：手番プレイヤーから席順に、駒のいる部屋が怨霊の部屋でなければ、その部屋のチップをすべて獲得する。獲得のたびに合計点を確かめ、10 点以上なら `result`（reason: 'score'）を設定し、キューを空にして終える（rules §6.5）。

5.9 `place`：お化けカードを 3 枚めくって捨て札に置き、`ghostCardsRevealed` を記録する。山札が 0 枚になったら最終得点で `result`（reason: 'ghostDeck'）を設定し、キューを空にして終える（rules §8.2・§9.2）。そうでなければ rules §8.3 の順でダイスを振ってチップを置く。

5.10 `draw`：移動カードの山札が空なら捨て札をシャッフルして山札にし、`moveDeckReshuffled` を記録してから 1 枚引く。

5.11 連結判定（rules §5.5）：通せん棒のない辺だけをたどる幅優先探索を A1 から行い、36 部屋すべてに届くことを確かめる。

5.12 合法手が空になる状態は起こらない設計である。人間移動カードは常に使え（壁でも向きは変わる）、お化け移動カードは常に怨霊を選べ、通せん棒カードは設置か撤去の少なくとも一方が可能である。性質テストでこれを確かめる。

## 6. 通信プロトコル（変更禁止事項）

### 6.1 選択肢 ID

- `play:<MoveCardId>`：手札のカードを使う。同じ種類のカードが複数あっても ID ごとに別の選択肢とする。
- `ghost:<ChipId>`、`ghost:wraith`：お化け移動の対象。壁に当たって動かない対象も選択肢に含める。
- `barrier:place:<EdgeId>`：連結条件を満たす空き辺のみ。
- `barrier:remove:<EdgeId>`：置かれている辺すべて。
- `lose:normal`、`lose:golden`：ペナルティで失うチップの種類。
- `overlap:continue`、`overlap:purge`：rules §7.5 の選択。

`options` の並びは、手札順、チップの配置順の後に `ghost:wraith`、辺 ID の昇順（place の後に remove）、`lose:normal`・`lose:golden`、`overlap:continue`・`overlap:purge` の順とする。

### 6.2 乱数の消費順

`rng.ts` は mulberry32 を実装し、`next(state): [value: number, nextState: number]` の形で状態を返す。

- シャッフル：Fisher–Yates。i を末尾から 1 まで下げ、`j = floor(next() * (i + 1))` として i と j を入れ替える。
- ダイス：`floor(next() * 6) + 1`。

`createGame` の消費順：

1. `rng = seed >>> 0`
2. 移動カード（M000〜M179 の順）をシャッフルする。
3. お化けカード（G00〜G29 の順）をシャッフルする。
4. 4 巡にわたり、席 1 から順に山札の一番上を 1 枚ずつ配る（乱数は消費しない）。
5. `place` を実行する。お化け 1 体ごとに、列のダイス、行のダイスの順に振る。

ゲーム中の消費は、`place`（ダイス）と移動カード山札の再シャッフルのみである。

## 7. オンライン同期

### 7.1 共有ドキュメント

1 ゲーム＝1 行（`rooms` テーブル）。`doc` 列の JSON は次の形とする。

```ts
type RoomDoc = {
  schema: 1;
  rulesVersion: '0.1';
  status: 'lobby' | 'playing' | 'ended';
  host: string;                          // 作成者の auth uid
  config: GameConfig;
  seed: number;
  seats: ({ uid: string; name: string } | null)[];  // 長さは config.players
  checkpoint: GameState | null;          // 直近のチェックポイント
  moves: OptionId[];                     // チェックポイント以降の選択肢 ID
};
```

`version` は `rooms.version` 列で管理する。

### 7.2 Room インターフェース（src/net/room.ts）

```ts
interface Room {
  subscribe(listener: (doc: RoomDoc | null, version: number) => void): () => void;
  write(doc: RoomDoc, expectedVersion: number): Promise<{ ok: true; version: number } | { ok: false }>;
  clear(): Promise<void>;
  transact(update: (doc: RoomDoc | null) => RoomDoc | null): Promise<RoomDoc | null>;
}
```

- `transact` は読み込み→更新→`write` を版の衝突時に最大 5 回やり直す。着席など、手番に関係しない書き込みに使う。
- 偽 DB（`fake-room.ts`）は localStorage のキー `obake-room:<code>` に `{ doc, version }` を保存し、`storage` イベントと同一タブ内のリスナーで通知する。Playwright では同じブラウザコンテキストの複数ページで共有する。
- 使用する実装は、URL の `?db=fake` または環境変数 `VITE_ROOM_BACKEND=fake` で偽 DB に切り替える。

### 7.3 進行の手順

1. 各ブラウザは `replay(doc.checkpoint, doc.moves)` で局面を得る。viewer は自分の席に固定する。
2. 書き込むのは `state.pending.player` の席に座っているプレイヤーだけである。
3. 選択 1 つごとに `next = applyMove(state, option)` を計算する。`isCheckpoint(state, next)` なら `checkpoint = next, moves = []`、そうでなければ `moves` の末尾に option を足し、`write(doc, version)` する。
4. 版が食い違って失敗した場合は、手元の変更を捨てて最新の doc で描画し直す。自動でやり直さない。
5. 取り消し（U-03）は `undoLast` の結果を `moves` として書く。
6. 終局したら `status = 'ended'` にする。

### 7.4 Supabase の定義（deploy/supabase.sql）

```sql
create table public.rooms (
  id text primary key,                 -- 部屋コード（英大文字と数字 6 桁）
  doc jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy rooms_select on public.rooms
  for select to authenticated using (true);

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (doc->>'host' = auth.uid()::text and version = 0);

-- 更新は関数経由に限る（update / delete のポリシーを作らない）。
create or replace function public.write_room(p_id text, p_expected integer, p_doc jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.rooms%rowtype;
  me text := auth.uid()::text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into cur from public.rooms where id = p_id for update;
  if not found or cur.version <> p_expected then
    return -1;
  end if;
  if cur.doc->>'status' <> 'lobby' then
    if not exists (
      select 1 from jsonb_array_elements(cur.doc->'seats') s
      where s->>'uid' = me
    ) then
      raise exception 'not seated';
    end if;
  end if;
  update public.rooms
     set doc = p_doc, version = cur.version + 1, updated_at = now()
   where id = p_id;
  return cur.version + 1;
end;
$$;

create or replace function public.clear_room(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rooms where id = p_id and doc->>'host' = auth.uid()::text;
$$;

grant execute on function public.write_room(text, integer, jsonb) to authenticated;
grant execute on function public.clear_room(text) to authenticated;

alter publication supabase_realtime add table public.rooms;
```

Realtime は `postgres_changes`（テーブル `rooms`、フィルタ `id=eq.<code>`）を購読する。認証は匿名ログイン（`signInAnonymously`）とし、セッションは supabase-js の既定どおり localStorage に保持する。これにより再読み込み後も同じ uid で席に戻れる。

### 7.5 ロビー

- 画面の経路はハッシュで表す。`#/`（トップ）、`#/local/<人数>`（ローカル対戦）、`#/room/<部屋コード>`（オンライン対戦）。
- トップ：「ローカルで遊ぶ」（人数 2〜4 を選ぶ）と「部屋を作る」（人数と名前を入れる）。オンラインの入口は D-08 に従い、Supabase の設定がなければ隠す。
- 部屋を作ると、部屋コードとシードを `crypto.getRandomValues` で生成し、`status: 'lobby'`、席 1 に作成者を座らせた doc を作る。招待用のリンク（`#/room/<コード>`）をコピーできるようにする。
- リンクを開いた人は名前を入れて `transact` で空席に座る。すでに自分の uid の席があればそこに戻る。
- 全席が埋まったら作成者が「開始」を押す。`checkpoint = createGame(config, seed)`、`moves = []`、`status = 'playing'` とする。

## 8. UI の最低限の要件（第 4 段階）

見た目は暫定である（decisions.md の U 項）。ui_design.md ができたらそれに従う。

- 盤面（SVG）：6×6 の部屋。列見出し A〜F、行見出し 1〜6、北が上。スタート地点の部屋に印をつける。
- 駒：席ごとの色の円と、向きを示す矢印。同じ部屋に複数いる場合は部屋の四隅にずらして置く。
- お化け：部屋ごとに通常とゴールデンを分けて数を表示する。怨霊は別の図形で表示する。
- 通せん棒：辺の上に太線で表示する。`barrierTarget` のときは、選べる辺に当たり判定（幅 16px 以上の透明な領域）を重ね、設置できる辺と撤去できる辺を色で区別する。
- 手札：自分の 4 枚をカードとして表示する。他人の手札は枚数だけを表示する。
- 情報欄：手番、各席の得点と獲得チップ（通常・ゴールデン）、移動カードとお化けカードの山札の残り枚数、直近の出来事のログ。
- ボタン：「選び直す」（取り消せるときのみ）、§7.5 の 2 択、ペナルティのチップ選択。
- 終局画面：結果（勝者または引き分け、得点）と「トップへ戻る」。
- ローカル対戦では、手番が替わるたびに「席 N の番です。タップして手札を表示」という目隠し画面を出し、手札が前の人に見えないようにする（U-05）。
- `gestures.ts` は `Target.type` ごとに所作を対応させる：handCard→カードのタップ、chip・wraith→盤上のタップ、edge→辺のタップ、heldChip→情報欄のチップのタップ、button→ボタン。
- 安全網：`targetOf` の対象が画面上に見つからない合法手は、画面下の「その他の操作」に一覧で出し、`window.__fallbackCount` を 1 増やす。受け入れ検査で 0 であることを確かめる。
- 各操作要素に `data-testid` と `data-option`（選択肢 ID）を付け、自動対戦が所作だけで打てるようにする。ただし他人の手札に関する属性は付けない。

## 9. テスト計画

### 9.1 単体テスト（tests/）

各テストの冒頭に `// rules v0.1 §x.y` の形で対応条項を書く。最低限、次を用意する。

- §2：カードの枚数と内訳（180 枚・30 枚、種類ごとの枚数）、辺が 60 本であること、開始位置と向き。
- §3：準備後の手札 4 枚・山札の枚数、怨霊が C3、お化けカードが 3 枚めくられていること、配置数がカードの合計と一致すること、同じシードで同じ局面になること。
- §4：手番の順、カード使用後に手札が 4 枚に戻ること、移動カード山札の再シャッフル。
- §5.1：8 種類の人間移動カードそれぞれの方角と向き、外周の壁での向きだけの変更、通せん棒での停止。
- §5.2：他の駒のいる部屋への移動。
- §5.4：選んだ 1 枚だけが動くこと、ゴールデンも動くこと、通せん棒を無視すること、壁で動かないこと。
- §5.5：設置、撤去、連結条件に反する辺が選択肢に出ないこと。
- §6：同室のチップの獲得、席順の判定と先に判定された人の総取り、怨霊の部屋のチップを取れないこと、得点計算。
- §6.5・§9.1：判定途中での 10 点到達による即時終了と、それ以降の判定を行わないこと。
- §7.2：人間が怨霊の部屋に入る接触、怨霊が駒の部屋に入る接触（複数人）、スタート地点と向きの復帰、チップの選択（両方所持時のみ選択待ち）、0 枚時、その手番の獲得判定なし。
- §7.3：怨霊がスタート地点に入らないこと。
- §7.5：条件成立時の 2 択、purge による除外と再配置。
- §8：ダイスの出目と部屋の対応、重ね置き、怨霊・駒のいる部屋への配置。
- §8.2・§9.2：10 回目にめくった時点での終了、配置しないこと、最高点の勝利、同点の引き分け。
- 履歴：`replay` の再現性、`isCheckpoint` の各条件、`undoLast`。
- 伏せ処理：`maskEvents` が他人の引いたカードを伏せること。

ロジックを変更するときは、対応するテストを先に更新する。

### 9.2 性質テスト（tests/）

2・3・4 人それぞれ 200 シードで、合法手から一様に選ぶ乱択プレイアウトを走らせ、次を確かめる。

- 終局までのすべての局面で `getOptions` が空でない。
- すべての合法手に `targetOf` の対象がある。
- チップの総数が保存される（ボード上＋獲得済み＋除外済み＝配置した総数）。
- 通せん棒の連結条件が常に成り立つ。怨霊がスタート地点にいない。
- 1 局が 5000 回の `applyMove` 以内に終局する。

終局しないシードがあれば、ルールやロジックを変えずに件数と手数の分布を報告する（decisions.md O-01）。

### 9.3 受け入れ検査（e2e/）

- ローカル対戦の自動対戦：2・3・4 人を各数局、`data-option` を持つ要素のタップだけで終局まで打つ。「選び直す」は選ばない。目隠し画面は解除してよい。
- 確認する項目：`window.__fallbackCount` が 0、幅 375px と 1280px で画面のはみ出しがない、viewer 以外の手札のカード ID（`M` で始まる 4 文字）が DOM に現れない、ページのエラーが 0 件。
- 同期検査（第 5 段階）：偽 DB で 2〜4 ページをつなぎ、各ページが自分の席の手番だけを打って終局する。全ページの最終局面（`GameState` の JSON）が一致することを確かめる。

## 10. 配布

10.1 `vite.config.ts` で `base: './'` とし、`vite-plugin-singlefile` で `dist/index.html` 1 枚にまとめる。

10.2 GitHub Actions：

- `ci.yml`（push と pull request）：`npm ci` → `npm run typecheck` → `npm test` → `npm run build` → Playwright（chromium）で `npm run e2e`。
- `deploy.yml`（`main` への push で CI 成功後）：リポジトリの Variables `SUPABASE_URL`・`SUPABASE_PUBLISHABLE_KEY` を `VITE_SUPABASE_URL`・`VITE_SUPABASE_PUBLISHABLE_KEY` として渡してビルドし、`actions/upload-pages-artifact` と `actions/deploy-pages` で公開する。

10.3 GitHub と Supabase の準備手順は `setup.md`（環境構築手順書）に定める。第 5 段階で、その写しを `deploy/README.md` として置く。Supabase の鍵は publishable key（`sb_publishable_`）を使い、レガシーの anon key は使わない（decisions.md D-09）。secret key はリポジトリにもビルドにも入れない。

## 11. 段階と完了条件

各段階は専用のブランチで行い、完了条件を満たしてから `main` に取り込む。1 ブランチに複数の段階を混ぜない。どの段階も、型検査・テスト・ビルドがすべて通ることを完了条件に含む。

1. 第 1 段階 `stage1-data`：リポジトリの立ち上げ（Vite・TypeScript strict・Vitest・CI・`CLAUDE.md`・`docs/`）、`src/data/`、`src/game/types.ts`・`rng.ts`・`board-ops.ts`。テスト：§2 のデータ、乱数の決定性、方角の回転と隣接、辺 ID の 60 本、連結判定。指示書は付録 B。
2. 第 2 段階 `stage2-core`：`createGame`・`getOptions`・`applyMove`・`executor`・`history`・`queries` の骨格。準備、手番、人間移動、獲得判定、配置、終了条件。この段階では、お化け移動カードと通せん棒カードは「使うと効果なしで手番が進む」仮実装とし、仮実装である旨をテスト名とコメントに書く。テスト：§3・§4・§5.1〜5.3・§6・§8・§9 と履歴。
3. 第 3 段階 `stage3-effects`：お化け移動、通せん棒、怨霊（接触・ペナルティ・移動制限・重なりの選択）。`targets`・`explain`・`visibility`。テスト：§5.4〜5.6・§7 と性質テスト。
4. 第 4 段階 `stage4-local-ui`：§8 の UI とローカル対戦。受け入れ検査（ローカルの自動対戦）。ここで 1 局を通して遊べることをユーザーが確認する。
5. 第 5 段階 `stage5-online`：`src/net/`、ロビー、`deploy/`、`deploy.yml`、同期検査。ユーザーが §10.3 の準備をした後に公開を確認する。

各段階の終わりに、遊べる状態または通るテストを示してユーザーの確認を得る。現在の段階を超えた実装を先取りしない。ただし、純粋関数・シード可能な乱数・直列化可能性・決定性は第 1 段階から守る。

## 付録 A. CLAUDE.md の初版

リポジトリ直下に次の内容で置く。運用が変わったら必ず更新する。

```markdown
# CLAUDE.md

お化け退治ボードゲームのブラウザ版。GitHub Pages で公開し、オンライン同期に Supabase を使う。

## 文書
- docs/rules.md：ルール（現在 v0.1）。条項番号でテストと対応づける。
- docs/design.md：実装設計書。構成・API・プロトコル・段階はここに従う。
- 設計文書の正は claude.ai プロジェクトにある。docs/ は写しであり、勝手に書き換えない。

## コマンド
- npm run dev：開発サーバー
- npm run typecheck：tsc --noEmit
- npm test：vitest run
- npm run build：dist/index.html を 1 枚で出力
- npm run e2e：Playwright の受け入れ検査

## 構成
- src/game：純粋関数のみ。src/ui・src/net を import しない。Math.random を使わない。
- src/data：カード・盤面の静的データ。
- src/ui：React。状態変更は src/game の関数呼び出しのみ。ルールを再実装しない。
- src/net：Room インターフェース、Supabase 実装、偽 DB。

## 守ること
- rules.md に定めがなく、合法手・得点・勝敗に影響する箇所は、推測で補わず作業を止めて報告する。
- 選択肢 ID・カード ID・乱数の消費順は通信プロトコルである（design.md §6）。変える場合は理由をここに残す。
- 他人の手札を画面と DOM に出さない。
- ロジックを変えるときは対応するテストを先に更新する。テストに rules の条項番号を書く。
- 型検査・テスト・ビルドが通らない状態で作業を完了扱いにしない。
- コードのコメントと文書は日本語の「である調」で書く。
- 新しいライブラリを入れる前に、理由を示して承認を得る。

## 配布
- main への push で GitHub Actions が CI を通した後に GitHub Pages へ公開する。
- Supabase の URL と publishable key はリポジトリの Variables から渡す。未設定ならオンライン対戦の入口を隠す。secret key は使わない。

## 既知の制約
- オンライン版の共有データには山札と手札が入るため、開発者ツールで覗ける（身内向けとして受け入れている）。
```

## 付録 B. 第 1 段階の指示書（Claude Code 向け）

- 準拠：rules.md v0.1、design.md v0.2
- 段階：第 1 段階（リポジトリの立ち上げとデータ層）
- ブランチ：`stage1-data`（初回のみ、`main` に空のコミットと README を置いてから分岐する）

作業内容：

1. Vite（React ＋ TypeScript）でプロジェクトを作る。Node.js は 24 系とし、`package.json` の `engines` と `.nvmrc`、CI の `actions/setup-node` を 24 にそろえる。`tsconfig` は `strict: true`、`noUncheckedIndexedAccess: true` とする。依存は react、react-dom、vite、@vitejs/plugin-react、vite-plugin-singlefile、typescript、vitest、@playwright/test に限る（supabase-js は第 5 段階で入れる）。
2. `package.json` に §10 と付録 A のスクリプトを用意する（e2e は空の検査 1 本でよい）。
3. 付録 A の `CLAUDE.md` を置く。`docs/rules.md` と `docs/design.md` に、ユーザーから渡された写しを置く。
4. `.github/workflows/ci.yml` を §10.2 のとおり作る。`deploy.yml` はまだ作らない。
5. `src/game/types.ts`：§3 の型をすべて定義する（Instr・GameEvent・Pending を含む）。
6. `src/data/board.ts`：36 部屋、60 本の辺（§3.1 の ID 規則）、スタート地点、開始時の向き、人数別の割り当て（rules §2.6）。
7. `src/data/cards.ts`：§3.2 の ID 割り当てどおりに移動カード 180 枚とお化けカード 30 枚を定義する。
8. `src/game/rng.ts`：mulberry32、Fisher–Yates シャッフル、ダイス（§6.2）。状態を引数で受け取り、新しい状態を返す純粋関数とする。
9. `src/game/board-ops.ts`：方角の回転（右・左・後ろ）、人間移動カードの方角の決定、隣の部屋（外周は null）、2 部屋の間の辺 ID、辺に通せん棒があるかの判定、連結判定（§5.11）。

追加するテスト：

- カードの総数と種類ごとの枚数（rules §2.9・§2.10）。
- 辺が 60 本で重複がないこと、各辺が隣接する 2 部屋に対応すること（rules §2.2）。
- スタート地点と開始時の向き、人数別の割り当て（rules §2.5・§2.6）。
- 同じシードの乱数列・シャッフル結果が一致し、異なるシードで異なること。ダイスが 1〜6 の範囲に収まること。
- 8 種類の人間移動カードについて、4 方向の向きそれぞれからの移動方角（rules §5.1）。
- 外周での隣の部屋が null になること。
- 連結判定：通せん棒なしで連結、角の部屋を囲む 2 本で非連結、1 本だけでは連結。

完了条件：

- `npm run typecheck`・`npm test`・`npm run build` がすべて通る。CI が通る。
- `src/game/` から `src/ui/`・`src/net/` への import がない。`Math.random` を使っていない。
- 作業後に、追加したファイルの一覧とテストの件数を報告する。rules.md で判断に迷った箇所があれば、実装せずに列挙して報告する。
