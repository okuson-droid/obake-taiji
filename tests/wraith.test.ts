// rules v0.2 §7.2(a)（人間が怨霊の部屋に入る接触とペナルティ）、§7.4（接触した手番の獲得判定なし）、
// §7.5（怨霊とお化けチップの重なりの選択）
import { describe, expect, test } from 'vitest';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { overlapConditionHolds } from '../src/game/executor.ts';
import type { GameState } from '../src/game/types.ts';
import { P, arrange, cardIds, playStill, playTurn } from './helpers.ts';

/** 席 1 が C4 から北へ進み、C3 の怨霊の部屋に入る局面 */
const enterWraith = (held: { normal?: number; golden?: number }, extra: Parameters<typeof arrange>[0] = {}) => {
  const ids = cardIds();
  const card = ids.human('N');
  const s0 = arrange({
    chips: [{ cell: 'F3' }],
    ...extra,
    seats: { ...extra.seats, 0: { pos: 'C4', facing: 'W', hand: [card], held } },
  });
  return { s0, s1: playTurn(s0, card) };
};

describe('怨霊との接触（rules v0.2 §7.2(a)）', () => {
  test('§7.2(a) 1. 駒を自分のスタート地点に戻し、向きを開始時の向きに戻す（R-07）', () => {
    const { s1 } = enterWraith({});
    expect(P(s1, 0).pos).toBe('A1');
    expect(P(s1, 0).facing).toBe('E');
    expect(s1.events).toContainEqual({ type: 'returnedToStart', seat: 0, to: 'A1' });
  });

  test('§7.2(a) 1. 席 2（F6）なら F6・向き西に戻る', () => {
    const ids = cardIds();
    const card = ids.human('W');
    const s0 = arrange({ turn: 1, chips: [{ cell: 'F3' }], seats: { 1: { pos: 'D3', hand: [card] } } });
    const s1 = playTurn(s0, card);
    expect(P(s1, 1).pos).toBe('F6');
    expect(P(s1, 1).facing).toBe('W');
  });

  test('§7.2(a) 2. 獲得済みのチップがなければ何も失わない（R-06）', () => {
    const { s1 } = enterWraith({});
    expect(P(s1, 0).held).toEqual({ normal: 0, golden: 0 });
    expect(s1.events).toContainEqual({ type: 'chipLost', seat: 0, kind: null });
    expect(s1.turn).toBe(1);
  });

  test('§7.2(a) 2. 通常だけを持っていれば、選択待ちなしで通常を 1 枚失う（U-06）', () => {
    const { s1 } = enterWraith({ normal: 3 });
    expect(P(s1, 0).held).toEqual({ normal: 2, golden: 0 });
    expect(s1.removedChips).toEqual({ normal: 1, golden: 0 });
    expect(s1.events).toContainEqual({ type: 'chipLost', seat: 0, kind: 'normal' });
    expect(s1.turn).toBe(1);
  });

  test('§7.2(a) 2. ゴールデンだけを持っていれば、選択待ちなしでゴールデンを失い 3 点減る（U-06）', () => {
    const { s1 } = enterWraith({ golden: 2 });
    expect(P(s1, 0).held).toEqual({ normal: 0, golden: 1 });
    expect(s1.removedChips).toEqual({ normal: 0, golden: 1 });
  });

  test('§7.2(a) 2. 両方を持っていれば、失う種類を本人が選ぶ（penaltyChip）', () => {
    const { s1 } = enterWraith({ normal: 1, golden: 1 });
    expect(s1.pending).toEqual({ kind: 'penaltyChip', player: 0, options: ['lose:normal', 'lose:golden'] });
    expect(s1.turn).toBe(0);

    const lostGolden = applyMove(s1, 'lose:golden');
    expect(P(lostGolden, 0).held).toEqual({ normal: 1, golden: 0 });
    expect(lostGolden.removedChips).toEqual({ normal: 0, golden: 1 });
    expect(lostGolden.events[0]).toEqual({ type: 'chipLost', seat: 0, kind: 'golden' });
    // 選んだ後は手番の残り（引く・次の手番）が進む。
    // rules v0.2 §4.4・§4.7：1 回目で接触したので 2 回目は行わず、1 枚引いて 6 枚に戻す。
    expect(P(lostGolden, 0).hand).toHaveLength(6);
    expect(lostGolden.turn).toBe(1);

    const lostNormal = applyMove(s1, 'lose:normal');
    expect(P(lostNormal, 0).held).toEqual({ normal: 0, golden: 1 });
    expect(() => applyMove(s1, getOptions(lostNormal)[0]!)).toThrow();
  });

  test('§7.2(a) 怨霊コマは動かない', () => {
    const { s1 } = enterWraith({});
    expect(s1.wraith).toBe('C3');
  });
});

describe('接触した手番の獲得判定（rules v0.2 §4.5・§7.4）', () => {
  test('§7.4 接触した手番では、他のプレイヤーも含めて獲得判定を行わない', () => {
    const { s1 } = enterWraith({}, { chips: [{ cell: 'B5' }, { cell: 'A1' }], seats: { 1: { pos: 'B5' } } });
    expect(P(s1, 1).held.normal).toBe(0);
    expect(P(s1, 0).held.normal).toBe(0); // 戻った A1 のチップも取らない
    expect(s1.chips).toHaveLength(2);
    expect(s1.events.map((e) => e.type)).not.toContain('acquired');
  });

  test('§7.4 次の手番以降は通常どおり獲得判定を行う', () => {
    const { s1 } = enterWraith({}, { chips: [{ cell: 'B5' }, { cell: 'A1' }], seats: { 1: { pos: 'B5' } } });
    expect(s1.contactThisTurn).toBe(false);
    // 席 2 の手番：駒を動かさないよう、手札の先頭を通せん棒カードに差し替えて使う。
    const s2in: GameState = structuredClone(s1);
    const ids = cardIds();
    const barrier = ids.barrier();
    s2in.players[1]!.hand[0] = barrier;
    s2in.pending = { kind: 'playCard', player: 1, options: s2in.players[1]!.hand.map((id) => `play:${id}` as const) };
    const s2 = playStill(s2in, barrier);
    expect(P(s2, 1).held.normal).toBe(1);
    expect(P(s2, 0).held.normal).toBe(1);
  });

  test('§7.2・§4.6 接触した手番でも、ボード上のチップが 0 枚なら補充を行う', () => {
    const { s0, s1 } = enterWraith({}, { chips: [] });
    expect(s1.ghostDeck).toHaveLength(s0.ghostDeck.length - 3);
  });
});

describe('怨霊とお化けチップの重なり（rules v0.2 §7.5）', () => {
  /** 席 1 の手番を終えると、席 2 の手番の開始時に §7.5 の条件が成り立つ局面 */
  const overlapAtStart = (chips: { cell: 'C3' | 'D4' }[]) => {
    const ids = cardIds();
    const card = ids.barrier();
    const s0 = arrange({ chips, seats: { 0: { hand: [card] } } });
    return playStill(s0, card);
  };

  test('§7.5 チップがすべて怨霊と同じ部屋にあれば、手番の開始時に 2 択の選択待ちになる', () => {
    const s = overlapAtStart([{ cell: 'C3' }, { cell: 'C3' }]);
    expect(s.turn).toBe(1);
    expect(s.pending).toEqual({ kind: 'overlapChoice', player: 1, options: ['overlap:continue', 'overlap:purge'] });
  });

  test('§7.5 怨霊の部屋の外にチップが 1 枚でもあれば、選択待ちにならない', () => {
    const s = overlapAtStart([{ cell: 'C3' }, { cell: 'D4' }]);
    expect(s.pending?.kind).toBe('playCard');
  });

  test('§7.5 (a) 続行を選ぶとチップはそのままで、カードの使用に進む', () => {
    const s = overlapAtStart([{ cell: 'C3' }]);
    const s1 = applyMove(s, 'overlap:continue');
    expect(s1.chips).toEqual(s.chips);
    expect(s1.ghostDeck).toEqual(s.ghostDeck);
    expect(s1.pending).toEqual({ kind: 'playCard', player: 1, options: P(s1, 1).hand.map((id) => `play:${id}`) });
    expect(s1.events).toEqual([]);
    expect(s1.rng).toBe(s.rng);
  });

  test('§7.5 (b) 除外を選ぶと怨霊の部屋のチップを取り除き、お化けの配置を行ってからカードの使用に進む（R-10）', () => {
    const s = overlapAtStart([{ cell: 'C3' }, { cell: 'C3' }]);
    const s1 = applyMove(s, 'overlap:purge');
    expect(s1.events[0]).toEqual({ type: 'overlapPurged', chips: ['c1', 'c2'] });
    expect(s1.removedChips).toEqual({ normal: 2, golden: 0 });
    expect(s1.events[1]?.type).toBe('ghostCardsRevealed');
    expect(s1.ghostDeck).toHaveLength(s.ghostDeck.length - 3);
    expect(s1.chips.every((c) => c.id !== 'c1' && c.id !== 'c2')).toBe(true);
    expect(s1.chips.length).toBeGreaterThan(0);
    expect(s1.pending?.kind).toBe('playCard');
    expect(s1.pending?.player).toBe(1);
  });

  test('§7.5 (b)・§8.2 除外後の配置で山札が尽きれば、その場で終了する', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'C3' }], ghostDeck: ['G00', 'G01', 'G02'], seats: { 0: { hand: [card] } } });
    const s = playStill(s0, card);
    const s1 = applyMove(s, 'overlap:purge');
    expect(s1.result?.reason).toBe('ghostDeck');
    expect(s1.pending).toBeNull();
  });

  test('§7.5 条件の判定：ボード上にチップがなければ成り立たない', () => {
    expect(overlapConditionHolds(arrange({ chips: [] }))).toBe(false);
    expect(overlapConditionHolds(arrange({ chips: [{ cell: 'C3' }] }))).toBe(true);
    expect(overlapConditionHolds(arrange({ wraith: 'D4', chips: [{ cell: 'C3' }] }))).toBe(false);
    expect(overlapConditionHolds(arrange({ wraith: 'D4', chips: [{ cell: 'D4' }, { cell: 'D4', kind: 'golden' }] }))).toBe(true);
  });
});
