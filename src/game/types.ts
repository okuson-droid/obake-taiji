// ゲームロジックの型定義（design.md §3）。
// GameState は JSON で直列化できる形に保つ（関数・Map・Set・undefined を入れない）。

// ---- 基本の型（design.md §3.1） ----

export type Col = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Row = 1 | 2 | 3 | 4 | 5 | 6;
/** 部屋。例："C3"（rules v0.1 §2.1） */
export type Cell = `${Col}${Row}`;
/** 北・東・南・西 */
export type Dir = 'N' | 'E' | 'S' | 'W';
/**
 * 辺の ID（rules v0.1 §2.2）。
 * "E:B3" は B3 と C3 の間の辺、"S:B3" は B3 と B4 の間の辺である。
 * E は列 A〜E・行 1〜6 の 30 本、S は列 A〜F・行 1〜5 の 30 本、計 60 本である。
 * 型としては盤外を指す ID も表せるため、正しい辺の一覧は src/data/board.ts の EDGES を正とする。
 */
export type EdgeId = `E:${Cell}` | `S:${Cell}`;
/** 席。内部は 0 始まりで、表示は「席 1」〜「席 4」とする。 */
export type Seat = 0 | 1 | 2 | 3;

// ---- カード（design.md §3.2） ----

export type HumanCardKind = 'front' | 'back' | 'right' | 'left' | 'N' | 'E' | 'S' | 'W';
/** 移動カードの ID。"M000"〜"M179" */
export type MoveCardId = `M${string}`;
export type MoveCard =
  | { id: MoveCardId; type: 'human'; kind: HumanCardKind }
  | { id: MoveCardId; type: 'ghost'; dir: Dir }
  | { id: MoveCardId; type: 'barrier' };

/** お化けカードの ID。"G00"〜"G29" */
export type GhostCardId = `G${string}`;
export type GhostCard = { id: GhostCardId; normal: number; golden: number };

// ---- 選択肢 ID（design.md §6.1。通信プロトコルの一部である） ----

export type OptionId =
  | `play:${MoveCardId}`
  | `ghost:${ChipId}`
  | 'ghost:wraith'
  | `barrier:place:${EdgeId}`
  | `barrier:remove:${EdgeId}`
  | 'lose:normal'
  | 'lose:golden'
  | 'overlap:continue'
  | 'overlap:purge';

// ---- GameState（design.md §3.3） ----

export type ChipKind = 'normal' | 'golden';
/** お化けチップの ID。配置順に c1, c2, … */
export type ChipId = `c${number}`;
export type Chip = { id: ChipId; kind: ChipKind; cell: Cell };

export type PlayerState = {
  seat: Seat;
  /** 自分のスタート地点（rules v0.1 §2.6） */
  start: Cell;
  pos: Cell;
  facing: Dir;
  /** 手札。引いた順 */
  hand: MoveCardId[];
  /** 獲得済みチップ */
  held: { normal: number; golden: number };
};

export type GameConfig = { players: 2 | 3 | 4 };

export type GameResult = {
  /** rules v0.1 §9.1 / §9.2 */
  reason: 'score' | 'ghostDeck';
  /** 2 人以上なら引き分け */
  winners: Seat[];
  scores: number[];
};

export type GameState = {
  rulesVersion: '0.1';
  config: GameConfig;
  seed: number;
  /** mulberry32 の内部状態（uint32） */
  rng: number;
  players: PlayerState[];
  wraith: Cell;
  /** ボード上のチップ。配置順 */
  chips: Chip[];
  nextChipId: number;
  /** ゲームから除外した数 */
  removedChips: { normal: number; golden: number };
  /** 昇順に整列して保持する */
  barriers: EdgeId[];
  /** 先頭が山札の一番上 */
  moveDeck: MoveCardId[];
  /** 捨てた順 */
  moveDiscard: MoveCardId[];
  ghostDeck: GhostCardId[];
  ghostDiscard: GhostCardId[];
  /** 手番プレイヤー */
  turn: Seat;
  /** 1 始まり */
  turnNo: number;
  /** rules v0.1 §4.5・§7.4 */
  contactThisTurn: boolean;
  /** null はゲーム終了時のみ */
  pending: Pending | null;
  effectQueue: Instr[];
  /** 直前の applyMove で起きた出来事 */
  events: GameEvent[];
  result: GameResult | null;
};

// ---- 選択待ち（design.md §3.4） ----

export type Pending =
  /** rules v0.1 §7.5 */
  | { kind: 'overlapChoice'; player: Seat; options: OptionId[] }
  /** rules v0.1 §4.3 */
  | { kind: 'playCard'; player: Seat; options: OptionId[] }
  /** rules v0.1 §5.4 */
  | { kind: 'ghostTarget'; player: Seat; card: MoveCardId; options: OptionId[] }
  /** rules v0.1 §5.5 */
  | { kind: 'barrierTarget'; player: Seat; card: MoveCardId; options: OptionId[] }
  /** rules v0.1 §7.2 */
  | { kind: 'penaltyChip'; player: Seat; options: OptionId[] };

// ---- 効果キューの命令（design.md §3.5） ----

export type Instr =
  /** §7.5 の判定 → overlapChoice か playCard */
  | { op: 'startTurn' }
  | { op: 'moveHuman'; seat: Seat; card: MoveCardId }
  | { op: 'moveGhost'; target: ChipId | 'wraith'; dir: Dir }
  | { op: 'placeBarrier'; edge: EdgeId }
  | { op: 'removeBarrier'; edge: EdgeId }
  /** §7.2 の 1. を実行し penalty を積む */
  | { op: 'contact'; seats: Seat[] }
  /** チップ選択（必要なら pending） */
  | { op: 'penalty'; seat: Seat }
  /** §7.5(b) の除外 */
  | { op: 'purgeOverlap' }
  /** §6 */
  | { op: 'judge' }
  /** §4.6 */
  | { op: 'refillIfEmpty' }
  /** §8 */
  | { op: 'place' }
  /** §4.7 */
  | { op: 'draw'; seat: Seat }
  /** §4.8 → startTurn を積む */
  | { op: 'endTurn' };

// ---- 出来事（design.md §3.6） ----

export type GameEvent =
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
  /** 他人向けには card を null に伏せる */
  | { type: 'cardDrawn'; seat: Seat; card: MoveCardId | null }
  | { type: 'moveDeckReshuffled' }
  | { type: 'turnStarted'; seat: Seat; turnNo: number }
  | { type: 'gameEnded'; result: GameResult };
