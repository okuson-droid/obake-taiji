// 簡易プレイアウト。乱択で合法手を選び続けると終局まで進むことを確かめる（rules v0.1 §9）。
// 本格的な性質テスト（design.md §9.2）は第 3 段階で行う。
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions, isGameOver } from '../src/game/engine.ts';
import { scoreOf } from '../src/game/queries.ts';
import type { GameConfig, GameState } from '../src/game/types.ts';
import { randomPicker } from './helpers.ts';

/** 1 局の上限（design.md §9.2） */
const MAX_MOVES = 5000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** 盤上・獲得済み・除外済みのチップの合計 */
const chipTotal = (s: GameState): number =>
  s.chips.length + s.players.reduce((a, p) => a + p.held.normal + p.held.golden, 0) + s.removedChips.normal + s.removedChips.golden;

const playout = (config: GameConfig, seed: number): { state: GameState; moves: number } => {
  const pick = randomPicker(seed * 104729 + config.players);
  let s = createGame(config, seed);
  let moves = 0;
  while (!isGameOver(s) && moves < MAX_MOVES) {
    const options = getOptions(s);
    expect(options.length).toBeGreaterThan(0);
    s = applyMove(s, pick(options));
    moves++;
    expect(chipTotal(s)).toBe(s.nextChipId - 1);
    expect(s.players.every((p) => p.hand.length === 4 || s.pending?.kind === 'penaltyChip' || isGameOver(s))).toBe(true);
  }
  return { state: s, moves };
};

describe('簡易プレイアウト（rules v0.1 §9、design §9.2 の簡易版）', () => {
  for (const players of [2, 3, 4] as const) {
    test(`§9 ${players} 人・${SEEDS.length} シードで、乱択の合法手を選び続けると ${MAX_MOVES} 手以内に終局する`, () => {
      const counts: number[] = [];
      for (const seed of SEEDS) {
        const { state, moves } = playout({ players }, seed);
        expect(isGameOver(state)).toBe(true);
        const r = state.result!;
        if (r.reason === 'score') {
          expect(r.winners).toHaveLength(1);
          expect(scoreOf(state, r.winners[0]!)).toBeGreaterThanOrEqual(10);
        } else {
          expect(state.ghostDeck).toEqual([]);
          const best = Math.max(...r.scores);
          expect(r.winners).toEqual(r.scores.flatMap((x, i) => (x === best ? [i] : [])));
        }
        counts.push(moves);
      }
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      console.log(`${players} 人：applyMove 回数 最小 ${Math.min(...counts)}・平均 ${avg.toFixed(1)}・最大 ${Math.max(...counts)}`);
    });
  }
});
