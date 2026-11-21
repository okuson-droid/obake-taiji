// rules v0.2 §6（お化けの獲得）、§6.5・§9.1（10 点到達による終了）
import { describe, expect, test } from 'vitest';
import { applyMove, finalScores, getOptions, isGameOver } from '../src/game/engine.ts';
import { scoreOf } from '../src/game/queries.ts';
import { P, arrange, cardIds, play, playStill, playTurn } from './helpers.ts';

describe('獲得（rules v0.2 §6.1・§6.4）', () => {
  test('§6.1 駒と同じ部屋のチップをすべて獲得する', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({
      chips: [{ cell: 'D4' }, { cell: 'D4', kind: 'golden' }, { cell: 'D4' }, { cell: 'B6' }],
      seats: { 0: { pos: 'C4', hand: [card] } },
    });
    const s1 = playTurn(s0, card);
    expect(P(s1, 0).held).toEqual({ normal: 2, golden: 1 });
    expect(s1.chips.map((c) => c.id)).toEqual(['c4']);
    expect(s1.events).toContainEqual({ type: 'acquired', seat: 0, chips: ['c1', 'c2', 'c3'], points: 5 });
  });

  test('§6.4 通常は 1 点、ゴールデンは 3 点として数える', () => {
    const s = arrange({ seats: { 0: { held: { normal: 2, golden: 3 } }, 1: { held: { golden: 1 } } } });
    expect(scoreOf(s, 0)).toBe(11);
    expect(scoreOf(s, 1)).toBe(3);
    expect(finalScores(s)).toEqual([11, 3]);
  });

  test('§6.1 手番プレイヤー以外も、自分の部屋のチップを獲得する（R-09）', () => {
    const ids = cardIds();
    const card = ids.human('S');
    const s0 = arrange({ chips: [{ cell: 'B2' }, { cell: 'E5' }], seats: { 0: { pos: 'D3', hand: [card] }, 1: { pos: 'B2' } } });
    const s1 = playTurn(s0, card);
    expect(P(s1, 1).held.normal).toBe(1);
    expect(P(s1, 0).held.normal).toBe(0);
  });
});

describe('判定の順（rules v0.2 §6.2）', () => {
  test('§6.2 同じ部屋に複数いる場合、手番プレイヤーがすべて獲得する', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({
      chips: [{ cell: 'D4' }, { cell: 'D4' }, { cell: 'A5' }],
      seats: { 0: { pos: 'C4', hand: [card] }, 1: { pos: 'D4' } },
    });
    const s1 = playTurn(s0, card);
    expect(P(s1, 0).held.normal).toBe(2);
    expect(P(s1, 1).held.normal).toBe(0);
  });

  test('§6.2 判定は手番プレイヤーから席番号の順（最後の席の次は席 1）', () => {
    const ids = cardIds();
    const card = ids.barrier(); // 通せん棒を置くだけで駒を動かさずに判定させる
    const s0 = arrange({
      players: 3,
      turn: 1,
      chips: [{ cell: 'D4' }, { cell: 'A5' }],
      seats: { 0: { pos: 'D4' }, 1: { hand: [card] }, 2: { pos: 'D4' } },
    });
    const s1 = playStill(s0, card);
    // 席 2（turn=1）→ 席 3 → 席 1 の順。席 3 が先に判定され、すべて取る。
    expect(P(s1, 2).held.normal).toBe(1);
    expect(P(s1, 0).held.normal).toBe(0);
  });
});

describe('怨霊の部屋（rules v0.2 §6.3）', () => {
  test('§6.3 怨霊コマがいる部屋のチップは獲得できない', () => {
    const ids = cardIds();
    const card = ids.barrier();
    // 怨霊と駒が同じ部屋にいる局面を直接作る（接触で駒がスタート地点に戻るため、通常の進行では生じない）。
    const s0 = arrange({ wraith: 'D4', chips: [{ cell: 'D4' }, { cell: 'A5' }], seats: { 0: { hand: [card] }, 1: { pos: 'D4' } } });
    const s1 = playStill(s0, card);
    expect(P(s1, 1).held.normal).toBe(0);
    expect(s1.chips.map((c) => c.cell)).toContain('D4');
  });
});

describe('10 点到達による終了（rules v0.2 §6.5・§9.1）', () => {
  test('§6.5・§9.1 獲得で 10 点以上になると、その場でゲームが終了し勝者になる', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'D4' }, { cell: 'A5' }], seats: { 0: { pos: 'C4', hand: [card], held: { normal: 6, golden: 1 } } } });
    const s1 = playTurn(s0, card);
    expect(isGameOver(s1)).toBe(true);
    expect(s1.result).toEqual({ reason: 'score', winners: [0], scores: [10, 0] });
    expect(s1.pending).toBeNull();
    expect(s1.effectQueue).toEqual([]);
    expect(getOptions(s1)).toEqual([]);
    expect(s1.events.at(-1)).toEqual({ type: 'gameEnded', result: s1.result });
    // §4.9：手番の残り（補充・引く・次の手番）を行わない。
    const types = s1.events.map((e) => e.type);
    expect(types).not.toContain('cardDrawn');
    expect(types).not.toContain('turnStarted');
    // rules v0.2：2 回使った後、手番の終わりの獲得判定で終了するため、手札は 4 枚のまま引かない。
    expect(P(s1, 0).hand).toHaveLength(4);
  });

  test('§6.5 10 点に達した後のプレイヤーの判定は行わない（R-16：判定順で先に達した人が勝つ）', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s0 = arrange({
      players: 3,
      turn: 2,
      chips: [{ cell: 'B2' }, { cell: 'E5' }, { cell: 'F1' }],
      seats: {
        0: { pos: 'B2', held: { normal: 9 } },
        1: { pos: 'E5', held: { normal: 9 } },
        2: { hand: [card], pos: 'D3', held: { normal: 9 } },
      },
    });
    const s1 = playStill(s0, card);
    // 手番は席 3。席 3 は D3（チップなし）→ 席 1 が B2 で 10 点 → 席 2 は判定しない。
    expect(s1.result).toEqual({ reason: 'score', winners: [0], scores: [10, 9, 9] });
    expect(P(s1, 1).held.normal).toBe(9);
    expect(s1.chips.map((c) => c.cell)).toEqual(['E5', 'F1']);
  });

  test('§9.1 終了後の applyMove は例外を投げる', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'D4', kind: 'golden' }, { cell: 'A5' }], seats: { 0: { pos: 'C4', hand: [card], held: { normal: 7 } } } });
    const s1 = playTurn(s0, card);
    expect(isGameOver(s1)).toBe(true);
    expect(() => applyMove(s1, play(P(s1, 1).hand[0]!))).toThrow();
  });

  test('§6.5 9 点では終了しない', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'D4' }, { cell: 'A5' }], seats: { 0: { pos: 'C4', hand: [card], held: { normal: 8 } } } });
    const s1 = playTurn(s0, card);
    expect(isGameOver(s1)).toBe(false);
    expect(scoreOf(s1, 0)).toBe(9);
  });
});
