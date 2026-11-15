// rules v0.1 §5.1〜§5.3（人間移動カード）
import { describe, expect, test } from 'vitest';
import { applyMove } from '../src/game/engine.ts';
import type { Dir, HumanCardKind } from '../src/game/types.ts';
import { P, arrange, cardIds, play } from './helpers.ts';

const moveOnce = (kind: HumanCardKind, pos: 'C4' | 'A1' | 'F6', facing: Dir, barriers: ('E:C4' | 'S:C3')[] = []) => {
  const ids = cardIds();
  const card = ids.human(kind);
  const s0 = arrange({ chips: [{ cell: 'F3' }], barriers, seats: { 0: { pos, facing, hand: [card] } } });
  return applyMove(s0, play(card));
};

describe('人間移動カード（rules v0.1 §5.1）', () => {
  // C4 から向き N で使ったときの移動先と向き
  const cases: [HumanCardKind, string, Dir][] = [
    ['front', 'C3', 'N'],
    ['back', 'C5', 'S'],
    ['right', 'D4', 'E'],
    ['left', 'B4', 'W'],
    ['N', 'C3', 'N'],
    ['E', 'D4', 'E'],
    ['S', 'C5', 'S'],
    ['W', 'B4', 'W'],
  ];
  for (const [kind, to, facing] of cases) {
    test(`§5.1 向き北で「${kind}」を使うと ${to} へ移り、向きが ${facing} になる`, () => {
      // 北へ進むと C3 に入るため、怨霊を E5 に置いて接触を避ける。
      const ids = cardIds();
      const card = ids.human(kind);
      const s = arrange({ wraith: 'E5', chips: [{ cell: 'F3' }], seats: { 0: { pos: 'C4', facing: 'N', hand: [card] } } });
      const s1 = applyMove(s, play(card));
      expect(P(s1, 0).pos).toBe(to);
      expect(P(s1, 0).facing).toBe(facing);
      expect(s1.events).toContainEqual({ type: 'humanMoved', seat: 0, from: 'C4', to, facing, blocked: false });
    });
  }

  test('§5.1 向き東で「右」を使うと南へ進む（相対方向は現在の向きから決まる）', () => {
    const s1 = moveOnce('right', 'C4', 'E');
    expect(P(s1, 0).pos).toBe('C5');
    expect(P(s1, 0).facing).toBe('S');
  });

  test('§5.1 手順 3：外周の壁の方向へは移動せず、向きだけを変える', () => {
    const s1 = moveOnce('N', 'A1', 'E');
    expect(P(s1, 0).pos).toBe('A1');
    expect(P(s1, 0).facing).toBe('N');
    expect(s1.events).toContainEqual({ type: 'humanMoved', seat: 0, from: 'A1', to: 'A1', facing: 'N', blocked: true });
  });

  test('§5.1 手順 3：外周の壁（「後ろ」で南東の隅から南へ）', () => {
    const s1 = moveOnce('back', 'F6', 'N');
    expect(P(s1, 0).pos).toBe('F6');
    expect(P(s1, 0).facing).toBe('S');
  });

  test('§5.1 手順 3・§5.6：移動方向の辺に通せん棒があれば移動せず、向きだけを変える', () => {
    const s1 = moveOnce('E', 'C4', 'N', ['E:C4']);
    expect(P(s1, 0).pos).toBe('C4');
    expect(P(s1, 0).facing).toBe('E');
    expect(s1.events).toContainEqual({ type: 'humanMoved', seat: 0, from: 'C4', to: 'C4', facing: 'E', blocked: true });
  });

  test('§5.1 通せん棒は別の辺にあれば移動を妨げない', () => {
    const s1 = moveOnce('S', 'C4', 'N', ['E:C4', 'S:C3']);
    expect(P(s1, 0).pos).toBe('C5');
  });

  test('§5.1 北の辺（S:C3）の通せん棒は C4 から北への移動を妨げる', () => {
    const ids = cardIds();
    const card = ids.human('front');
    const s0 = arrange({ wraith: 'E5', chips: [{ cell: 'F3' }], barriers: ['S:C3'], seats: { 0: { pos: 'C4', facing: 'N', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(P(s1, 0).pos).toBe('C4');
  });
});

describe('他の駒のいる部屋（rules v0.1 §5.2）', () => {
  test('§5.2 他のプレイヤー駒がいる部屋に入れる', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'D5', hand: [card] }, 1: { pos: 'E5' } } });
    const s1 = applyMove(s0, play(card));
    expect(P(s1, 0).pos).toBe('E5');
    expect(P(s1, 1).pos).toBe('E5');
  });
});

describe('怨霊の部屋に入る（rules v0.1 §5.3）', () => {
  test('§5.3 人間移動カードで怨霊コマのいる部屋に入ると接触が発生する', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.events).toContainEqual({ type: 'humanMoved', seat: 0, from: 'C4', to: 'C3', facing: 'N', blocked: false });
    expect(s1.events).toContainEqual({ type: 'contact', seats: [0] });
  });

  test('§5.3 怨霊の部屋との間に通せん棒があれば入らず、接触しない', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F3' }], barriers: ['S:C3'], seats: { 0: { pos: 'C4', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(P(s1, 0).pos).toBe('C4');
    expect(s1.events.map((e) => e.type)).not.toContain('contact');
  });
});
