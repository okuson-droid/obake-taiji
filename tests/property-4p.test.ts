// 性質テスト（design.md §9.2）：4 人。rules v0.1 §2.3・§2.7・§2.9・§4.3・§4.7・§5.5・§7.3・§9 の不変条件と終局を確かめる。
import { expect, test } from 'vitest';
import { MAX_MOVES, SEED_COUNT, playout, summarize } from './property.ts';

test(`§9 4 人・${SEED_COUNT} シードの乱択プレイアウトが、不変条件を保ったまま ${MAX_MOVES} 回以内に終局する`, () => {
  const results = Array.from({ length: SEED_COUNT }, (_, i) => playout({ players: 4 }, i + 1));
  console.log(summarize(4, results));
  // 終局しないシードがあっても、件数と分布を報告できるよう集計を出してから確かめる（decisions.md O-01）。
  expect(results.filter((r) => r.reason === null)).toEqual([]);
}, 600_000);
