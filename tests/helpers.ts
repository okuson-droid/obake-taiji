// テスト用の補助関数。特定の局面を作るために GameState を直接組み立てる。
// ゲームロジック（src/game）からは使わない。
import { MOVE_CARDS } from '../src/data/cards.ts';
import { applyMove, createGame } from '../src/game/engine.ts';
import { askPlayCard } from '../src/game/executor.ts';
import { next as nextRandom, seedToState } from '../src/game/rng.ts';
import type {
  Cell,
  Chip,
  ChipKind,
  Dir,
  GameState,
  HumanCardKind,
  MoveCardId,
  OptionId,
  PlayerState,
  Seat,
} from '../src/game/types.ts';

/** 種類ごとのカード ID を、使った分だけ先へ進めながら払い出す。 */
export const cardIds = () => {
  const used = new Set<MoveCardId>();
  const take = (pred: (c: (typeof MOVE_CARDS)[number]) => boolean): MoveCardId => {
    const c = MOVE_CARDS.find((x) => pred(x) && !used.has(x.id));
    if (c === undefined) throw new Error('カードが足りない');
    used.add(c.id);
    return c.id;
  };
  return {
    human: (kind: HumanCardKind) => take((c) => c.type === 'human' && c.kind === kind),
    ghost: (dir: Dir) => take((c) => c.type === 'ghost' && c.dir === dir),
    barrier: () => take((c) => c.type === 'barrier'),
  };
};

export type PlayerSetup = Partial<Pick<PlayerState, 'pos' | 'facing' | 'hand'>> & {
  held?: Partial<PlayerState['held']>;
};

export type Arrangement = {
  players?: 2 | 3 | 4;
  seed?: number;
  turn?: Seat;
  wraith?: Cell;
  /** ボード上のチップ。ID は c1 から順に振り直す。 */
  chips?: { kind?: ChipKind; cell: Cell }[];
  seats?: Partial<Record<Seat, PlayerSetup>>;
  ghostDeck?: GameState['ghostDeck'];
  moveDeck?: MoveCardId[];
  moveDiscard?: MoveCardId[];
  barriers?: GameState['barriers'];
};

/**
 * createGame の結果をもとに、指定した局面を組み立てる。
 * 手番プレイヤーの playCard の選択待ちで止まった状態を返す。
 * 手札に指定したカードは、山札・捨て札・他人の手札から取り除いて重複を避ける。
 * 手札は指定したカードを先頭に置き、4 枚に満たない分を山札の先頭から補う。
 */
export const arrange = (a: Arrangement): GameState => {
  const s = structuredClone(createGame({ players: a.players ?? 2 }, a.seed ?? 1));
  s.events = [];
  s.effectQueue = [];
  if (a.turn !== undefined) s.turn = a.turn;
  if (a.wraith !== undefined) s.wraith = a.wraith;
  if (a.ghostDeck !== undefined) s.ghostDeck = a.ghostDeck;
  if (a.barriers !== undefined) s.barriers = [...a.barriers].sort();
  if (a.chips !== undefined) {
    s.chips = a.chips.map((c, i): Chip => ({ id: `c${i + 1}`, kind: c.kind ?? 'normal', cell: c.cell }));
    s.nextChipId = a.chips.length + 1;
  }
  const claimed = new Set<MoveCardId>();
  for (const [seatKey, setup] of Object.entries(a.seats ?? {})) {
    const p = s.players[Number(seatKey)];
    if (p === undefined || setup === undefined) throw new Error(`席 ${seatKey} は存在しない`);
    if (setup.pos !== undefined) p.pos = setup.pos;
    if (setup.facing !== undefined) p.facing = setup.facing;
    if (setup.hand !== undefined) {
      p.hand = [...setup.hand];
      for (const id of setup.hand) claimed.add(id);
    }
    if (setup.held !== undefined) p.held = { normal: 0, golden: 0, ...setup.held };
  }
  if (claimed.size > 0) {
    s.moveDeck = s.moveDeck.filter((id) => !claimed.has(id));
    s.moveDiscard = s.moveDiscard.filter((id) => !claimed.has(id));
    for (const [seatKey, p] of s.players.entries()) {
      // 指定しなかった手札からは、指定したカードを取り除く。
      if (a.seats?.[seatKey as Seat]?.hand === undefined) p.hand = p.hand.filter((id) => !claimed.has(id));
    }
  }
  // 手札が 4 枚に満たない席は、山札の先頭から補う（指定したカードが手札の先頭に来る）。
  for (const p of s.players) {
    while (p.hand.length < 4) {
      const id = s.moveDeck.shift();
      if (id === undefined) throw new Error('山札が足りない');
      p.hand.push(id);
    }
  }
  if (a.moveDeck !== undefined) s.moveDeck = a.moveDeck;
  if (a.moveDiscard !== undefined) s.moveDiscard = a.moveDiscard;
  s.pending = null;
  askPlayCard(s);
  return s;
};

/** 手番プレイヤーが手札の card を使う選択肢 ID */
export const play = (card: MoveCardId): OptionId => `play:${card}`;

/** テスト用の決定的な乱択。合法手から一様に選ぶ。 */
export const randomPicker = (seed: number) => {
  let r = seedToState(seed);
  return <T>(items: readonly T[]): T => {
    const [v, n] = nextRandom(r);
    r = n;
    const x = items[Math.floor(v * items.length)];
    if (x === undefined) throw new Error('選択肢が空である');
    return x;
  };
};

/** 席のプレイヤーを取り出す（存在しなければ例外） */
export const P = (s: GameState, seat: number): PlayerState => {
  const p = s.players[seat];
  if (p === undefined) throw new Error(`席 ${seat} は存在しない`);
  return p;
};

/**
 * 手番プレイヤーが通せん棒カード card を使い、設置できる最初の辺（辺 ID の昇順で先頭）に置く。
 * 駒もチップも動かさずに、獲得判定以降の手番の処理を進めたいときに使う（rules v0.1 §5.5(a)）。
 */
export const playStill = (s: GameState, card: MoveCardId): GameState => {
  const t = applyMove(s, play(card));
  if (t.pending?.kind !== 'barrierTarget') throw new Error(`${card} は通せん棒カードではない`);
  const place = t.pending.options.find((o) => o.startsWith('barrier:place:'));
  if (place === undefined) throw new Error('設置できる辺がない');
  return applyMove(t, place);
};
