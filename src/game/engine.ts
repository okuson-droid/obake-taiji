// ゲームの公開 API（design.md §4.1）。
// いずれの関数も引数の state を変更しない。内部では複製を作り、executor.ts で効果キューを進める。
import { START_ASSIGNMENT, START_FACING, WRAITH_START } from '../data/board.ts';
import { GHOST_CARDS, MOVE_CARDS, MOVE_CARD_BY_ID } from '../data/cards.ts';
import { HAND_SIZE, askPlayCard, loseChip, playCard, run } from './executor.ts';
import { pointsOf } from './queries.ts';
import { seedToState, shuffle } from './rng.ts';
import type { ChipId, EdgeId, GameConfig, GameState, MoveCardId, OptionId, PlayerState, Seat } from './types.ts';

export { HAND_SIZE };

/**
 * rules v0.2 §3 の準備を行い、席 1 の最初の選択待ちで止まった状態を返す。
 * 乱数の消費順は design.md §6.2 に従う。events には準備中の出来事が入る。
 */
export const createGame = (config: GameConfig, seed: number): GameState => {
  // 1. rng = seed >>> 0
  let rng = seedToState(seed);
  // 2. 移動カード（M000〜M179 の順）をシャッフルする。
  const [moveDeck, rng2] = shuffle(
    MOVE_CARDS.map((c) => c.id),
    rng,
  );
  // 3. お化けカード（G00〜G29 の順）をシャッフルする。
  const [ghostDeck, rng3] = shuffle(
    GHOST_CARDS.map((c) => c.id),
    rng2,
  );
  rng = rng3;

  // 駒をスタート地点に開始時の向きで置く（rules v0.2 §2.6・§3.2）。
  const players: PlayerState[] = START_ASSIGNMENT[config.players].map((start, i) => ({
    seat: i as Seat,
    start,
    pos: start,
    facing: START_FACING[start],
    hand: [],
    held: { normal: 0, golden: 0 },
  }));

  // 4. 6 巡にわたり、席 1 から順に山札の一番上を 1 枚ずつ配る（乱数は消費しない、rules v0.2 §3.4）。
  for (let round = 0; round < HAND_SIZE; round++) {
    for (const p of players) {
      const card = moveDeck.shift();
      if (card === undefined) throw new Error('移動カードが足りない');
      p.hand.push(card);
    }
  }

  const state: GameState = {
    rulesVersion: '0.2',
    config: { players: config.players },
    seed,
    rng,
    players,
    wraith: WRAITH_START,
    chips: [],
    nextChipId: 1,
    removedChips: { normal: 0, golden: 0 },
    barriers: [],
    moveDeck,
    moveDiscard: [],
    ghostDeck,
    ghostDiscard: [],
    turn: 0,
    turnNo: 1,
    contactThisTurn: false,
    actionsTaken: 0,
    pending: null,
    // 5. お化けの配置（rules v0.2 §3.6）を行い、席 1 の手番を始める（§3.7、design.md §5.1）。
    effectQueue: [{ op: 'place' }, { op: 'startTurn' }],
    events: [],
    result: null,
  };
  run(state);
  return state;
};

/** 現在の選択待ちの選択肢。ゲーム終了時は空配列を返す。 */
export const getOptions = (state: GameState): OptionId[] =>
  state.result === null && state.pending !== null ? [...state.pending.options] : [];

/**
 * 選択肢 ID を適用し、次の選択待ちまで効果キューを進めた新しい状態を返す（design.md §4.1）。
 * 合法でない選択肢には例外を投げる。events は今回の適用で起きた出来事だけに置き換える。
 */
export const applyMove = (state: GameState, option: OptionId): GameState => {
  if (state.result !== null || state.pending === null) {
    throw new Error('ゲームは終了している');
  }
  if (!state.pending.options.includes(option)) {
    throw new Error(`選択肢 ${option} は合法でない`);
  }
  const s = structuredClone(state);
  const pending = s.pending;
  if (pending === null) throw new Error('選択待ちがない');
  s.pending = null;
  s.events = [];

  switch (pending.kind) {
    case 'playCard':
      playCard(s, option.slice('play:'.length) as MoveCardId);
      run(s);
      break;
    case 'overlapChoice':
      // rules v0.2 §7.5。いずれを選んでも、その後は通常どおり §4.3 以降の手番を行う。
      if (option === 'overlap:purge') {
        s.effectQueue.unshift({ op: 'purgeOverlap' }, { op: 'place' });
        run(s);
      }
      if (s.result === null && s.pending === null) askPlayCard(s);
      break;
    case 'penaltyChip':
      loseChip(s, pending.player, option === 'lose:golden' ? 'golden' : 'normal');
      run(s);
      break;
    case 'ghostTarget': {
      // rules v0.2 §5.4。対象を動かした後、待たせていた獲得判定以降の手番の処理へ進む。
      const def = MOVE_CARD_BY_ID[pending.card];
      if (def?.type !== 'ghost') throw new Error(`${pending.card} はお化け移動カードではない`);
      const target = option.slice('ghost:'.length) as ChipId | 'wraith';
      s.effectQueue.unshift({ op: 'moveGhost', target, dir: def.dir });
      run(s);
      break;
    }
    case 'barrierTarget': {
      // rules v0.2 §5.5。設置または撤去の後、獲得判定以降の手番の処理へ進む。
      if (option.startsWith('barrier:place:')) {
        s.effectQueue.unshift({ op: 'placeBarrier', edge: option.slice('barrier:place:'.length) as EdgeId });
      } else {
        s.effectQueue.unshift({ op: 'removeBarrier', edge: option.slice('barrier:remove:'.length) as EdgeId });
      }
      run(s);
      break;
    }
  }

  if (s.result === null && s.pending === null) {
    throw new Error('選択待ちもゲームの終了もない状態になった');
  }
  return s;
};

/** ゲームが終了したかを返す。 */
export const isGameOver = (state: GameState): boolean => state.result !== null;

/** 席順の得点。通常 1 点、ゴールデン 3 点（rules v0.2 §6.4） */
export const finalScores = (state: GameState): number[] => state.players.map((p) => pointsOf(p.held));
