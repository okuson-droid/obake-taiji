// 効果キューの実行（design.md §3.5・§5）。
// run は applyMove・createGame が作った作業用の複製を直接書き換える。呼び出し側に渡す前の
// 複製だけを対象とするため、公開 API（engine.ts）から見れば純粋関数である。
import { START_FACING } from '../data/board.ts';
import { GHOST_CARD_BY_ID, MOVE_CARD_BY_ID } from '../data/cards.ts';
import { COLS, ROWS } from '../data/board.ts';
import { rollDie, shuffle } from './rng.ts';
import { chipsAt, playerAt, pointsOf, previewHumanMove } from './queries.ts';
import type {
  Cell,
  ChipKind,
  GameEvent,
  GameResult,
  GameState,
  Instr,
  MoveCardId,
  OptionId,
  Seat,
} from './types.ts';

/** 1 局の勝利に必要な点数（rules v0.1 §1.3・§6.5） */
export const WINNING_SCORE = 10;
/** 1 回の配置でめくるお化けカードの枚数（rules v0.1 §8.1） */
export const GHOST_CARDS_PER_PLACEMENT = 3;

const emit = (state: GameState, event: GameEvent): void => {
  state.events.push(event);
};

/** 手番プレイヤーから席番号の順（rules v0.1 §6.2・§7.2）に並べた席の列 */
export const seatsFromTurn = (state: GameState): Seat[] => {
  const n = state.config.players;
  return Array.from({ length: n }, (_, i) => ((state.turn + i) % n) as Seat);
};

/** スタート地点の開始時の向き（rules v0.1 §2.5） */
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
 * rules v0.1 §7.5 の条件：ボード上にお化けチップが 1 枚以上あり、かつそのすべてが
 * 怨霊コマと同じ部屋にある。
 */
export const overlapConditionHolds = (state: GameState): boolean =>
  state.chips.length > 0 && state.chips.every((c) => c.cell === state.wraith);

/** ゲームを終了させる（rules v0.1 §4.9）。残りの命令は捨てる。 */
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

/** チップを 1 枚失う（rules v0.1 §7.2 の 2.）。失ったチップはゲームから取り除く。 */
export const loseChip = (state: GameState, seat: Seat, kind: ChipKind): void => {
  const p = playerAt(state, seat);
  if (p.held[kind] <= 0) throw new Error(`席 ${seat + 1} は ${kind} のチップを持っていない`);
  p.held[kind] -= 1;
  state.removedChips[kind] += 1;
  emit(state, { type: 'chipLost', seat, kind });
};

/** カードを使う（rules v0.1 §4.3、design.md §5.3）。手札から捨て札へ移し、効果の命令を積む。 */
export const playCard = (state: GameState, card: MoveCardId): void => {
  const seat = state.turn;
  const p = playerAt(state, seat);
  const index = p.hand.indexOf(card);
  if (index < 0) throw new Error(`${card} は席 ${seat + 1} の手札にない`);
  p.hand.splice(index, 1);
  state.moveDiscard.push(card);
  emit(state, { type: 'cardPlayed', seat, card });

  const def = MOVE_CARD_BY_ID[card];
  if (def === undefined) throw new Error(`${card} は存在しないカードである`);
  const effect: Instr[] = [];
  if (def.type === 'human') {
    effect.push({ op: 'moveHuman', seat, card });
  }
  // 第 2 段階の仮実装：お化け移動カード（rules v0.1 §5.4）と通せん棒カード（§5.5）は効果なしとし、
  // ghostTarget・barrierTarget の選択待ちを立てずに、獲得判定以降の手番の処理へ進む。
  // 第 3 段階で本実装に置き換える（design.md §11、decisions.md D-11）。

  // 1 手番の標準の命令列（design.md §3.5）
  state.effectQueue.unshift(...effect, { op: 'judge' }, { op: 'refillIfEmpty' }, { op: 'draw', seat }, { op: 'endTurn' });
};

const execStartTurn = (state: GameState): void => {
  // design.md §5.2
  emit(state, { type: 'turnStarted', seat: state.turn, turnNo: state.turnNo });
  state.contactThisTurn = false;
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
  // rules v0.1 §5.1・§5.3、design.md §5.4
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

const execContact = (state: GameState, seats: Seat[]): void => {
  // rules v0.1 §7.2、design.md §5.6。手番プレイヤーから席番号の順に処理する（R-17）。
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
  // rules v0.1 §7.2 の 2.、design.md §5.7、decisions.md U-06
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
  // rules v0.1 §7.5(b)：怨霊コマと同じ部屋のチップをすべてゲームから取り除く。
  const purged = chipsAt(state, state.wraith);
  state.chips = state.chips.filter((c) => c.cell !== state.wraith);
  for (const chip of purged) state.removedChips[chip.kind] += 1;
  emit(state, { type: 'overlapPurged', chips: purged.map((c) => c.id) });
};

const execJudge = (state: GameState): void => {
  // rules v0.1 §6・§4.5・§7.4、design.md §5.8
  if (state.contactThisTurn) return;
  for (const seat of seatsFromTurn(state)) {
    const p = playerAt(state, seat);
    // 怨霊コマがいる部屋のチップは獲得できない（rules v0.1 §6.3）。
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
    // 判定の途中で 10 点以上になったら、その場で終了する（rules v0.1 §6.5・§9.1、R-11・R-16）。
    if (pointsOf(p.held) >= WINNING_SCORE) {
      endGame(state, 'score', [seat]);
      return;
    }
  }
};

const execRefillIfEmpty = (state: GameState): void => {
  // rules v0.1 §4.6
  if (state.chips.length === 0) state.effectQueue.unshift({ op: 'place' });
};

const execPlace = (state: GameState): void => {
  // rules v0.1 §8、design.md §5.9・§6.2
  const revealed = state.ghostDeck.splice(0, GHOST_CARDS_PER_PLACEMENT);
  state.ghostDiscard.push(...revealed);
  emit(state, { type: 'ghostCardsRevealed', cards: revealed });
  if (state.ghostDeck.length === 0) {
    // めくった結果山札が 0 枚になったら、配置せずに終了する（rules v0.1 §8.2・§9.2、R-12・R-13）。
    const scores = state.players.map((p) => pointsOf(p.held));
    const best = Math.max(...scores);
    const winners = state.players.filter((p) => pointsOf(p.held) === best).map((p) => p.seat);
    endGame(state, 'ghostDeck', winners);
    return;
  }
  // めくった順にカードを処理し、1 枚の中では記載された匹数分を続けて配置する（rules v0.1 §8.3）。
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
  // rules v0.1 §4.7、design.md §5.10
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
  // rules v0.1 §4.1・§4.8
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
    case 'placeBarrier':
    case 'removeBarrier':
      // 第 3 段階で実装する。第 2 段階ではこれらの命令を積まない。
      throw new Error(`命令 ${instr.op} は第 2 段階では実装していない`);
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
