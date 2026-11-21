// 性質テスト（design.md §9.2）の本体。人数ごとのテストファイルから呼ぶ。
// 合法手から一様に選ぶ乱択プレイアウトを走らせ、すべての局面で不変条件を確かめる。
import { expect } from 'vitest';
import { START_CELLS } from '../src/data/board.ts';
import { MOVE_CARDS } from '../src/data/cards.ts';
import { isConnected } from '../src/game/board-ops.ts';
import { applyMove, createGame, getOptions, isGameOver } from '../src/game/engine.ts';
import { explain } from '../src/game/explain.ts';
import { targetOf } from '../src/game/targets.ts';
import type { GameConfig, GameResult, GameState } from '../src/game/types.ts';
import { randomPicker } from './helpers.ts';

/** 1 局の applyMove 回数の上限（design.md §9.2、decisions.md D-13） */
export const MAX_MOVES = 20000;
/** 人数ごとのシード数（design.md §9.2） */
export const SEED_COUNT = 200;

const ALL_MOVE_CARDS = MOVE_CARDS.map((c) => c.id).sort().join(',');

/** 1 つの局面について不変条件を確かめる。 */
const checkInvariants = (s: GameState): void => {
  // 終局までのすべての局面で合法手が空でない（design §5.12）。
  if (!isGameOver(s)) expect(getOptions(s).length).toBeGreaterThan(0);
  else expect(getOptions(s)).toEqual([]);

  // すべての合法手に targetOf の対象があり、explain は null を返す（design §4.3・§4.4）。
  for (const o of getOptions(s)) {
    const t = targetOf(s, o);
    expect(explain(s, s.pending!.player, t)).toBeNull();
  }

  // チップの総数が保存される：ボード上＋獲得済み＋除外済み＝配置した総数（rules v0.2 §2.7・§7.2・§7.5）。
  const held = s.players.reduce((a, p) => a + p.held.normal + p.held.golden, 0);
  expect(s.chips.length + held + s.removedChips.normal + s.removedChips.golden).toBe(s.nextChipId - 1);

  // 通せん棒の連結条件が常に成り立ち、barriers は重複なく昇順に保たれる（rules v0.2 §2.3・§5.5）。
  expect(isConnected(s.barriers)).toBe(true);
  expect(s.barriers).toEqual([...new Set(s.barriers)].sort());

  // 怨霊はスタート地点にいない（rules v0.2 §7.3）。
  expect(START_CELLS).not.toContain(s.wraith);

  // 移動カード 180 枚が山札・捨て札・手札のどこかに 1 枚ずつある（rules v0.2 §2.9）。
  const cards = [...s.moveDeck, ...s.moveDiscard, ...s.players.flatMap((p) => p.hand)];
  expect(cards.sort().join(',')).toBe(ALL_MOVE_CARDS);

  // 手札は 6 枚。手番プレイヤーは、その手番で使った回数だけ少ない（rules v0.2 §4.3・§4.7）。
  // 手番の終わりに 6 枚まで引いてから次の手番に移るため、選択待ちや終局の局面では常にこの関係が成り立つ。
  for (const p of s.players) {
    expect(p.hand.length).toBe(p.seat === s.turn ? 6 - s.actionsTaken : 6);
  }
  expect(s.actionsTaken).toBeGreaterThanOrEqual(0);
  expect(s.actionsTaken).toBeLessThanOrEqual(2);
};

export type PlayoutSummary = { moves: number; reason: GameResult['reason'] | null };

/** 1 局を乱択で終局まで打つ。上限に達したら reason を null として返す。 */
export const playout = (config: GameConfig, seed: number): PlayoutSummary => {
  const pick = randomPicker(seed * 104729 + config.players);
  let s = createGame(config, seed);
  checkInvariants(s);
  let moves = 0;
  while (!isGameOver(s) && moves < MAX_MOVES) {
    s = applyMove(s, pick(getOptions(s)));
    moves++;
    checkInvariants(s);
  }
  return { moves, reason: s.result?.reason ?? null };
};

const percentile = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

/** 人数ごとの集計を 1 行の文にまとめる。 */
export const summarize = (players: number, results: PlayoutSummary[]): string => {
  const moves = results.map((r) => r.moves).sort((a, b) => a - b);
  const count = (reason: PlayoutSummary['reason']) => results.filter((r) => r.reason === reason).length;
  return (
    `${players} 人（${results.length} 局）：applyMove 回数 中央値 ${percentile(moves, 50)}・` +
    `90 パーセンタイル ${percentile(moves, 90)}・最大 ${moves.at(-1)}。` +
    `10 点決着 ${count('score')}・山札切れ決着 ${count('ghostDeck')}・未終局 ${count(null)}`
  );
};
