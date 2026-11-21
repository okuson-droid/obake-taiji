// 効果キューの実行（design.md §3.5・§5）。
// run は applyMove・createGame が作った作業用の複製を直接書き換える。呼び出し側に渡す前の
// 複製だけを対象とするため、公開 API（engine.ts）から見れば純粋関数である。
import { START_CELLS, START_FACING } from '../data/board.ts';
import { GHOST_CARD_BY_ID, MOVE_CARD_BY_ID } from '../data/cards.ts';
import { COLS, ROWS } from '../data/board.ts';
import { neighbor } from './board-ops.ts';
import { rollDie, shuffle } from './rng.ts';
import { canPlaceBarrier, chipsAt, placeableEdges, playerAt, pointsOf, previewHumanMove } from './queries.ts';
import type {
  Cell,
  ChipId,
  ChipKind,
  Dir,
  EdgeId,
  GameEvent,
  GameResult,
  GameState,
  Instr,
  MoveCardId,
  OptionId,
  Seat,
} from './types.ts';

/** 1 局の勝利に必要な点数（rules v0.2 §1.3・§6.5） */
export const WINNING_SCORE = 10;
/** 1 手番にカードを使う回数（rules v0.2 §4.3） */
export const ACTIONS_PER_TURN = 2;
/** 手札の枚数。準備で配る枚数であり、手番の終わりに補充する枚数でもある（rules v0.2 §3.4・§4.7） */
export const HAND_SIZE = 6;
/** 1 回の配置でめくるお化けカードの枚数（rules v0.2 §8.1） */
export const GHOST_CARDS_PER_PLACEMENT = 3;

const emit = (state: GameState, event: GameEvent): void => {
  state.events.push(event);
};

/** 手番プレイヤーから席番号の順（rules v0.2 §6.2・§7.2）に並べた席の列 */
export const seatsFromTurn = (state: GameState): Seat[] => {
  const n = state.config.players;
  return Array.from({ length: n }, (_, i) => ((state.turn + i) % n) as Seat);
};

/** スタート地点の開始時の向き（rules v0.2 §2.5） */
const startFacing = (start: Cell) => {
  if (start === 'A1' || start === 'F1' || start === 'F6' || start === 'A6') return START_FACING[start];
  throw new Error(`${start} はスタート地点ではない`);
};

/** playCard の選択待ちを立てる。選択肢は手札順（design.md §6.1）。 */
export const askPlayCard = (state: GameState): void => {
  const player = state.turn;
  state.pending = {
    kind: 'playCard',
    player,
    options: playerAt(state, player).hand.map((id): OptionId => `play:${id}`),
  };
};

/**
 * rules v0.2 §7.5 の条件：ボード上にお化けチップが 1 枚以上あり、かつそのすべてが
 * 怨霊コマと同じ部屋にある。
 */
export const overlapConditionHolds = (state: GameState): boolean =>
  state.chips.length > 0 && state.chips.every((c) => c.cell === state.wraith);

/** ゲームを終了させる（rules v0.2 §4.9）。残りの命令は捨てる。 */
const endGame = (state: GameState, reason: GameResult['reason'], winners: Seat[]): void => {
  const result: GameResult = {
    reason,
    winners,
    scores: state.players.map((p) => pointsOf(p.held)),
  };
  state.result = result;
  state.pending = null;
  state.effectQueue = [];
  emit(state, { type: 'gameEnded', result });
};

/** チップを 1 枚失う（rules v0.2 §7.2 の 2.）。失ったチップはゲームから取り除く。 */
export const loseChip = (state: GameState, seat: Seat, kind: ChipKind): void => {
  const p = playerAt(state, seat);
  if (p.held[kind] <= 0) throw new Error(`席 ${seat + 1} は ${kind} のチップを持っていない`);
  p.held[kind] -= 1;
  state.removedChips[kind] += 1;
  emit(state, { type: 'chipLost', seat, kind });
};

/** カードを使う（rules v0.2 §4.3、design.md §5.3）。手札から捨て札へ移し、効果の命令を積む。 */
export const playCard = (state: GameState, card: MoveCardId): void => {
  const seat = state.turn;
  const p = playerAt(state, seat);
  const index = p.hand.indexOf(card);
  if (index < 0) throw new Error(`${card} は席 ${seat + 1} の手札にない`);
  p.hand.splice(index, 1);
  state.moveDiscard.push(card);
  state.actionsTaken += 1;
  emit(state, { type: 'cardPlayed', seat, card });

  const def = MOVE_CARD_BY_ID[card];
  if (def === undefined) throw new Error(`${card} は存在しないカードである`);
  // 効果を解決した後に、2 回目へ進むか手番の終わりへ進むかを決める（rules v0.2 §4.3・§4.4）。
  const rest: Instr[] = [{ op: 'nextAction' }];
  switch (def.type) {
    case 'human':
      state.effectQueue.unshift({ op: 'moveHuman', seat, card }, ...rest);
      return;
    case 'ghost':
      // 対象を選ぶまで手番の残りを待たせる（rules v0.2 §5.4、design.md §5.3）。
      state.effectQueue.unshift(...rest);
      state.pending = { kind: 'ghostTarget', player: seat, card, options: ghostTargetOptions(state) };
      return;
    case 'barrier':
      // 対象を選ぶまで手番の残りを待たせる（rules v0.2 §5.5、design.md §5.3）。
      state.effectQueue.unshift(...rest);
      state.pending = { kind: 'barrierTarget', player: seat, card, options: barrierTargetOptions(state) };
      return;
  }
};

/**
 * お化け移動カードの選択肢（design.md §6.1）。ボード上のチップを配置順に並べ、その後に怨霊を置く。
 * 壁に当たって動かない対象も含める。
 */
export const ghostTargetOptions = (state: GameState): OptionId[] => [
  ...state.chips.map((c): OptionId => `ghost:${c.id}`),
  'ghost:wraith',
];

/**
 * 通せん棒カードの選択肢（design.md §6.1）。連結条件を満たす空き辺の設置を辺 ID の昇順に並べ、
 * その後に置かれている辺の撤去を昇順に並べる。
 */
export const barrierTargetOptions = (state: GameState): OptionId[] => [
  ...placeableEdges(state).map((e): OptionId => `barrier:place:${e}`),
  ...[...state.barriers].sort().map((e): OptionId => `barrier:remove:${e}`),
];

const execStartTurn = (state: GameState): void => {
  // design.md §5.2
  emit(state, { type: 'turnStarted', seat: state.turn, turnNo: state.turnNo });
  state.contactThisTurn = false;
  state.actionsTaken = 0;
  if (overlapConditionHolds(state)) {
    state.pending = {
      kind: 'overlapChoice',
      player: state.turn,
      options: ['overlap:continue', 'overlap:purge'],
    };
  } else {
    askPlayCard(state);
  }
};

const execMoveHuman = (state: GameState, seat: Seat, card: MoveCardId): void => {
  // rules v0.2 §5.1・§5.3、design.md §5.4
  const p = playerAt(state, seat);
  const from = p.pos;
  const preview = previewHumanMove(state, seat, card);
  p.facing = preview.facing;
  p.pos = preview.to;
  emit(state, { type: 'humanMoved', seat, from, to: preview.to, facing: preview.facing, blocked: preview.blocked });
  if (preview.contact) {
    state.effectQueue.unshift({ op: 'contact', seats: [seat] });
  }
};

const execMoveGhost = (state: GameState, target: ChipId | 'wraith', dir: Dir): void => {
  // rules v0.2 §5.4・§5.6・§7.1〜§7.3、design.md §5.5。お化けチップと怨霊コマは通せん棒を無視する。
  if (target === 'wraith') {
    const from = state.wraith;
    const to = neighbor(from, dir);
    // 外周の壁、または行き先がスタート地点なら動かない（rules v0.2 §7.3、R-08）。
    const blocked = to === null || START_CELLS.includes(to);
    const dest = blocked ? from : to;
    state.wraith = dest;
    emit(state, { type: 'wraithMoved', from, to: dest, blocked });
    if (blocked) return;
    // 動いた先にプレイヤー駒がいれば、その全員と接触する（rules v0.2 §7.2(b)）。
    const seats = state.players.filter((p) => p.pos === dest).map((p) => p.seat);
    if (seats.length > 0) state.effectQueue.unshift({ op: 'contact', seats });
    return;
  }
  const chip = state.chips.find((c) => c.id === target);
  if (chip === undefined) throw new Error(`チップ ${target} はボード上にない`);
  const from = chip.cell;
  const to = neighbor(from, dir);
  // 外周の壁の方角なら動かない（rules v0.2 §5.4、R-03）。
  chip.cell = to ?? from;
  emit(state, { type: 'ghostMoved', chip: chip.id, from, to: chip.cell, blocked: to === null });
};

const execPlaceBarrier = (state: GameState, edge: EdgeId): void => {
  // rules v0.2 §5.5(a)。barriers は昇順に保つ。
  if (!canPlaceBarrier(state, edge)) throw new Error(`辺 ${edge} には通せん棒を設置できない`);
  state.barriers = [...state.barriers, edge].sort();
  emit(state, { type: 'barrierPlaced', edge });
};

const execRemoveBarrier = (state: GameState, edge: EdgeId): void => {
  // rules v0.2 §5.5(b)。誰が設置した通せん棒でもよい。
  if (!state.barriers.includes(edge)) throw new Error(`辺 ${edge} に通せん棒はない`);
  state.barriers = state.barriers.filter((e) => e !== edge);
  emit(state, { type: 'barrierRemoved', edge });
};

const execContact = (state: GameState, seats: Seat[]): void => {
  // rules v0.2 §7.2、design.md §5.6。手番プレイヤーから席番号の順に処理する（R-17）。
  const ordered = seatsFromTurn(state).filter((s) => seats.includes(s));
  emit(state, { type: 'contact', seats: ordered });
  state.contactThisTurn = true;
  for (const seat of ordered) {
    const p = playerAt(state, seat);
    p.pos = p.start;
    p.facing = startFacing(p.start);
    emit(state, { type: 'returnedToStart', seat, to: p.start });
  }
  state.effectQueue.unshift(...ordered.map((seat): Instr => ({ op: 'penalty', seat })));
};

const execPenalty = (state: GameState, seat: Seat): void => {
  // rules v0.2 §7.2 の 2.、design.md §5.7、decisions.md U-06
  const { normal, golden } = playerAt(state, seat).held;
  if (normal === 0 && golden === 0) {
    emit(state, { type: 'chipLost', seat, kind: null });
  } else if (golden === 0) {
    loseChip(state, seat, 'normal');
  } else if (normal === 0) {
    loseChip(state, seat, 'golden');
  } else {
    state.pending = { kind: 'penaltyChip', player: seat, options: ['lose:normal', 'lose:golden'] };
  }
};

const execPurgeOverlap = (state: GameState): void => {
  // rules v0.2 §7.5(b)：怨霊コマと同じ部屋のチップをすべてゲームから取り除く。
  const purged = chipsAt(state, state.wraith);
  state.chips = state.chips.filter((c) => c.cell !== state.wraith);
  for (const chip of purged) state.removedChips[chip.kind] += 1;
  emit(state, { type: 'overlapPurged', chips: purged.map((c) => c.id) });
};

const execNextAction = (state: GameState): void => {
  // rules v0.2 §4.3〜§4.7。2 回使い終えたか、接触が起きていれば（誰の接触でも、R-21）手番の終わりの処理へ進む。
  // 手番の終わり：獲得判定 → お化けの補充 → 手札を 6 枚まで 1 枚ずつ引く → 次の手番。
  if (state.contactThisTurn || state.actionsTaken >= ACTIONS_PER_TURN) {
    const seat = state.turn;
    const draws = Math.max(0, HAND_SIZE - playerAt(state, seat).hand.length);
    state.effectQueue.unshift(
      { op: 'judge' },
      { op: 'refillIfEmpty' },
      ...Array.from({ length: draws }, (): Instr => ({ op: 'draw', seat })),
      { op: 'endTurn' },
    );
    return;
  }
  // 2 回目：§7.5 の重なりは手番の始めにだけ確かめる（R-23）ため、そのままカードの使用へ進む。
  askPlayCard(state);
};

const execJudge = (state: GameState): void => {
  // rules v0.2 §6・§4.5・§7.4、design.md §5.8。手番の中で接触があれば行わない。
  if (state.contactThisTurn) return;
  for (const seat of seatsFromTurn(state)) {
    const p = playerAt(state, seat);
    // 怨霊コマがいる部屋のチップは獲得できない（rules v0.2 §6.3）。
    if (p.pos === state.wraith) continue;
    const got = chipsAt(state, p.pos);
    if (got.length === 0) continue;
    state.chips = state.chips.filter((c) => c.cell !== p.pos);
    let points = 0;
    for (const chip of got) {
      p.held[chip.kind] += 1;
      points += chip.kind === 'golden' ? 3 : 1;
    }
    emit(state, { type: 'acquired', seat, chips: got.map((c) => c.id), points });
    // 判定の途中で 10 点以上になったら、その場で終了する（rules v0.2 §6.5・§9.1、R-11・R-16）。
    if (pointsOf(p.held) >= WINNING_SCORE) {
      endGame(state, 'score', [seat]);
      return;
    }
  }
};

const execRefillIfEmpty = (state: GameState): void => {
  // rules v0.2 §4.6
  if (state.chips.length === 0) state.effectQueue.unshift({ op: 'place' });
};

const execPlace = (state: GameState): void => {
  // rules v0.2 §8、design.md §5.9・§6.2
  const revealed = state.ghostDeck.splice(0, GHOST_CARDS_PER_PLACEMENT);
  state.ghostDiscard.push(...revealed);
  emit(state, { type: 'ghostCardsRevealed', cards: revealed });
  if (state.ghostDeck.length === 0) {
    // めくった結果山札が 0 枚になったら、配置せずに終了する（rules v0.2 §8.2・§9.2、R-12・R-13）。
    const scores = state.players.map((p) => pointsOf(p.held));
    const best = Math.max(...scores);
    const winners = state.players.filter((p) => pointsOf(p.held) === best).map((p) => p.seat);
    endGame(state, 'ghostDeck', winners);
    return;
  }
  // めくった順にカードを処理し、1 枚の中では記載された匹数分を続けて配置する（rules v0.2 §8.3）。
  for (const id of revealed) {
    const card = GHOST_CARD_BY_ID[id];
    if (card === undefined) throw new Error(`${id} は存在しないお化けカードである`);
    const kinds: ChipKind[] = [
      ...Array.from({ length: card.normal }, (): ChipKind => 'normal'),
      ...Array.from({ length: card.golden }, (): ChipKind => 'golden'),
    ];
    for (const kind of kinds) {
      const [colPip, s1] = rollDie(state.rng);
      const [rowPip, s2] = rollDie(s1);
      state.rng = s2;
      const col = COLS[colPip - 1];
      const row = ROWS[rowPip - 1];
      if (col === undefined || row === undefined) throw new Error('ダイスの出目が範囲外である');
      const cell: Cell = `${col}${row}`;
      const chip = { id: `c${state.nextChipId}` as const, kind, cell };
      state.nextChipId += 1;
      state.chips.push(chip);
      emit(state, { type: 'ghostPlaced', chip: chip.id, kind, cell, dice: [colPip, rowPip] });
    }
  }
};

const execDraw = (state: GameState, seat: Seat): void => {
  // rules v0.2 §4.7、design.md §5.10
  if (state.moveDeck.length === 0) {
    const [deck, rng] = shuffle(state.moveDiscard, state.rng);
    state.moveDeck = deck;
    state.moveDiscard = [];
    state.rng = rng;
    emit(state, { type: 'moveDeckReshuffled' });
  }
  const card = state.moveDeck.shift();
  if (card === undefined) throw new Error('移動カードの山札と捨て札がどちらも空である');
  playerAt(state, seat).hand.push(card);
  emit(state, { type: 'cardDrawn', seat, card });
};

const execEndTurn = (state: GameState): void => {
  // rules v0.2 §4.1・§4.8
  state.turn = ((state.turn + 1) % state.config.players) as Seat;
  state.turnNo += 1;
  state.effectQueue.unshift({ op: 'startTurn' });
};

const exec = (state: GameState, instr: Instr): void => {
  switch (instr.op) {
    case 'startTurn':
      return execStartTurn(state);
    case 'moveHuman':
      return execMoveHuman(state, instr.seat, instr.card);
    case 'contact':
      return execContact(state, instr.seats);
    case 'penalty':
      return execPenalty(state, instr.seat);
    case 'purgeOverlap':
      return execPurgeOverlap(state);
    case 'nextAction':
      return execNextAction(state);
    case 'judge':
      return execJudge(state);
    case 'refillIfEmpty':
      return execRefillIfEmpty(state);
    case 'place':
      return execPlace(state);
    case 'draw':
      return execDraw(state, instr.seat);
    case 'endTurn':
      return execEndTurn(state);
    case 'moveGhost':
      return execMoveGhost(state, instr.target, instr.dir);
    case 'placeBarrier':
      return execPlaceBarrier(state, instr.edge);
    case 'removeBarrier':
      return execRemoveBarrier(state, instr.edge);
  }
};

/**
 * 選択待ちが立つか、ゲームが終わるか、キューが空になるまで、先頭から命令を実行する。
 */
export const run = (state: GameState): void => {
  while (state.pending === null && state.result === null) {
    const instr = state.effectQueue.shift();
    if (instr === undefined) return;
    exec(state, instr);
  }
};
