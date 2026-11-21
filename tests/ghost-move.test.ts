// rules v0.2 §5.4・§5.6（お化け移動カード）、§7.1〜§7.3（怨霊コマの移動と接触）
import { describe, expect, test } from 'vitest';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { isCheckpoint } from '../src/game/history.ts';
import type { Dir, GameState, OptionId } from '../src/game/types.ts';
import { P, arrange, cardIds, finish, play, type Arrangement } from './helpers.ts';

/** 席 turn がお化け移動カード dir を使い、target を選ぶ。 */
const ghostMove = (dir: Dir, target: OptionId, a: Arrangement = {}) => {
  const ids = cardIds();
  const card = ids.ghost(dir);
  const turn = a.turn ?? 0;
  const s0 = arrange({ ...a, seats: { ...a.seats, [turn]: { ...a.seats?.[turn], hand: [card] } } });
  const mid = applyMove(s0, play(card));
  return { s0, mid, s1: finish(applyMove(mid, target)) };
};

const types = (s: GameState) => s.events.map((e) => e.type);

describe('お化け移動カードの選択肢（rules v0.2 §5.4、design §6.1）', () => {
  test('§5.4 選択肢はボード上のチップを配置順に並べ、その後に怨霊を置く', () => {
    const { mid } = ghostMove('N', 'ghost:wraith', { chips: [{ cell: 'E5' }, { cell: 'B2', kind: 'golden' }, { cell: 'E5' }] });
    expect(getOptions(mid)).toEqual(['ghost:c1', 'ghost:c2', 'ghost:c3', 'ghost:wraith']);
  });

  test('§5.4 壁に当たって動かない対象も選択肢に含める', () => {
    const { mid } = ghostMove('N', 'ghost:wraith', { wraith: 'C1', chips: [{ cell: 'D1' }] });
    expect(getOptions(mid)).toEqual(['ghost:c1', 'ghost:wraith']);
  });

  test('§5.4 ボード上にチップがなくても怨霊は選べる（design §5.12）', () => {
    const ids = cardIds();
    const card = ids.ghost('S');
    const s0 = arrange({ chips: [{ cell: 'C3' }], seats: { 0: { hand: [card] } } });
    // チップ 0 枚の局面を直接作る。
    const s = structuredClone(s0);
    s.chips = [];
    expect(getOptions(applyMove(s, play(card)))).toEqual(['ghost:wraith']);
  });
});

describe('お化けチップの移動（rules v0.2 §5.4・§5.6）', () => {
  test('§5.4 選んだチップがカードの方角の隣の部屋へ 1 マス動く', () => {
    const { s1 } = ghostMove('E', 'ghost:c1', { chips: [{ cell: 'B2' }, { cell: 'F6' }] });
    expect(s1.chips.find((c) => c.id === 'c1')?.cell).toBe('C2');
    expect(s1.events).toContainEqual({ type: 'ghostMoved', chip: 'c1', from: 'B2', to: 'C2', blocked: false });
  });

  test('§5.4 同じ部屋に重なっていても、選んだ 1 枚だけが動く', () => {
    const { s1 } = ghostMove('S', 'ghost:c2', { chips: [{ cell: 'D4' }, { cell: 'D4' }, { cell: 'D4' }] });
    expect(s1.chips.map((c) => [c.id, c.cell])).toEqual([
      ['c1', 'D4'],
      ['c2', 'D5'],
      ['c3', 'D4'],
    ]);
  });

  test('§5.4 ゴールデンお化けも通常のお化けと同様に動く', () => {
    const { s1 } = ghostMove('W', 'ghost:c1', { chips: [{ cell: 'D4', kind: 'golden' }, { cell: 'F6' }] });
    expect(s1.chips.find((c) => c.id === 'c1')).toEqual({ id: 'c1', kind: 'golden', cell: 'C4' });
  });

  test('§5.4・§5.6 お化けチップは通せん棒を無視して動く', () => {
    const { s1 } = ghostMove('E', 'ghost:c1', { barriers: ['E:D4'], chips: [{ cell: 'D4' }, { cell: 'F6' }] });
    expect(s1.chips.find((c) => c.id === 'c1')?.cell).toBe('E4');
  });

  test('§5.4 外周の壁の方角なら動かず、効果の使用は成立して手番が進む（R-03）', () => {
    const { s1 } = ghostMove('E', 'ghost:c1', { chips: [{ cell: 'F3' }, { cell: 'B6' }] });
    expect(s1.chips.find((c) => c.id === 'c1')?.cell).toBe('F3');
    expect(s1.events).toContainEqual({ type: 'ghostMoved', chip: 'c1', from: 'F3', to: 'F3', blocked: true });
    expect(s1.turn).toBe(1);
  });

  test('§5.4・§6.1 プレイヤーのいる部屋にチップを動かすと、その手番の獲得判定で取る', () => {
    const { s1 } = ghostMove('N', 'ghost:c1', { chips: [{ cell: 'F6' }, { cell: 'B2' }], seats: { 1: { pos: 'F5' } } });
    expect(P(s1, 1).held.normal).toBe(1);
    expect(s1.chips.map((c) => c.id)).toEqual(['c2']);
  });

  test('§5.4・§6.3 怨霊の部屋にチップを動かしても獲得されない', () => {
    const { s1 } = ghostMove('N', 'ghost:c1', { chips: [{ cell: 'C4' }, { cell: 'B2' }] });
    expect(s1.chips.find((c) => c.id === 'c1')?.cell).toBe('C3');
  });
});

describe('怨霊コマの移動（rules v0.2 §7.1・§7.3・§5.6）', () => {
  test('§7.1 怨霊コマはお化け移動カードで隣の部屋へ 1 マス動く', () => {
    const { s1 } = ghostMove('S', 'ghost:wraith', { chips: [{ cell: 'F1' }] });
    expect(s1.wraith).toBe('C4');
    expect(s1.events).toContainEqual({ type: 'wraithMoved', from: 'C3', to: 'C4', blocked: false });
  });

  test('§5.6 怨霊コマは通せん棒を無視して動く', () => {
    const { s1 } = ghostMove('E', 'ghost:wraith', { barriers: ['E:C3'], chips: [{ cell: 'F1' }] });
    expect(s1.wraith).toBe('D3');
  });

  test('§5.4 怨霊コマは外周の壁の方角へは動かない', () => {
    const { s1 } = ghostMove('N', 'ghost:wraith', { wraith: 'C1', chips: [{ cell: 'F3' }] });
    expect(s1.wraith).toBe('C1');
    expect(s1.events).toContainEqual({ type: 'wraithMoved', from: 'C1', to: 'C1', blocked: true });
    expect(s1.turn).toBe(1);
  });

  const toStart: [Dir, 'B1' | 'A2' | 'E1' | 'F2' | 'F5' | 'E6' | 'A5' | 'B6', string][] = [
    ['W', 'B1', 'A1'],
    ['N', 'A2', 'A1'],
    ['E', 'E1', 'F1'],
    ['N', 'F2', 'F1'],
    ['S', 'F5', 'F6'],
    ['E', 'E6', 'F6'],
    ['S', 'A5', 'A6'],
    ['W', 'B6', 'A6'],
  ];
  for (const [dir, from, start] of toStart) {
    test(`§7.3 怨霊コマはスタート地点 ${start} に入れない（${from} から ${dir}、R-08）`, () => {
      const { s1 } = ghostMove(dir, 'ghost:wraith', { players: 4, wraith: from, chips: [{ cell: 'C3' }] });
      expect(s1.wraith).toBe(from);
      expect(s1.events).toContainEqual({ type: 'wraithMoved', from, to: from, blocked: true });
      expect(types(s1)).not.toContain('contact');
    });
  }

  test('§7.3 2 人対戦で使っていない隅（F1）もスタート地点として扱う', () => {
    const { s1 } = ghostMove('E', 'ghost:wraith', { players: 2, wraith: 'E1', chips: [{ cell: 'C3' }] });
    expect(s1.wraith).toBe('E1');
  });
});

describe('怨霊が駒のいる部屋に入る接触（rules v0.2 §7.2(b)・§7.4）', () => {
  test('§7.2(b) 怨霊コマが駒のいる部屋に入ると接触し、駒はスタート地点・開始時の向きに戻る', () => {
    const { s1 } = ghostMove('E', 'ghost:wraith', { chips: [{ cell: 'F1' }], seats: { 1: { pos: 'D3', facing: 'N' } } });
    expect(s1.wraith).toBe('D3');
    expect(s1.events).toContainEqual({ type: 'contact', seats: [1] });
    expect(P(s1, 1).pos).toBe('F6');
    expect(P(s1, 1).facing).toBe('W');
    expect(s1.events).toContainEqual({ type: 'chipLost', seat: 1, kind: null });
  });

  test('§7.2(b) 手番プレイヤー自身の部屋に怨霊を入れても接触する', () => {
    const { s1 } = ghostMove('S', 'ghost:wraith', { chips: [{ cell: 'F1' }], seats: { 0: { pos: 'C4', held: { normal: 2 } } } });
    expect(P(s1, 0).pos).toBe('A1');
    expect(P(s1, 0).held.normal).toBe(1);
  });

  test('§7.2(b)・R-17 同じ部屋の全員が接触し、手番プレイヤーから席番号の順にペナルティを処理する', () => {
    const both = { normal: 1, golden: 1 };
    const { s1 } = ghostMove('S', 'ghost:wraith', {
      players: 4,
      turn: 2,
      wraith: 'D3',
      chips: [{ cell: 'F3' }],
      seats: { 0: { pos: 'D4', held: both }, 1: { pos: 'D4', held: both }, 3: { pos: 'D4', held: both } },
    });
    // 席 3 の手番 → 席 4 → 席 1 → 席 2 の順。
    expect(s1.events).toContainEqual({ type: 'contact', seats: [3, 0, 1] });
    expect(s1.players.filter((p) => p.seat !== 2).map((p) => p.pos)).toEqual(['A1', 'F1', 'A6']);
    expect(s1.pending).toEqual({ kind: 'penaltyChip', player: 3, options: ['lose:normal', 'lose:golden'] });
    const s2 = applyMove(s1, 'lose:golden');
    expect(s2.pending?.player).toBe(0);
    expect(isCheckpoint(s1, s2)).toBe(true);
    const s3 = applyMove(s2, 'lose:normal');
    expect(s3.pending?.player).toBe(1);
    const s4 = applyMove(s3, 'lose:golden');
    expect(s4.turn).toBe(3);
    expect(P(s4, 3).held).toEqual({ normal: 1, golden: 0 });
    expect(P(s4, 0).held).toEqual({ normal: 0, golden: 1 });
    expect(P(s4, 1).held).toEqual({ normal: 1, golden: 0 });
    expect(s4.removedChips).toEqual({ normal: 1, golden: 2 });
  });

  test('§7.2(b) 1 種類しか持たない人は選択待ちなしで失い、両方を持つ人だけ選ぶ（U-06）', () => {
    const { s1 } = ghostMove('S', 'ghost:wraith', {
      players: 3,
      turn: 0,
      wraith: 'D3',
      chips: [{ cell: 'F3' }],
      seats: { 1: { pos: 'D4', held: { golden: 2 } }, 2: { pos: 'D4', held: { normal: 1, golden: 1 } } },
    });
    expect(P(s1, 1).held).toEqual({ normal: 0, golden: 1 });
    expect(s1.pending).toEqual({ kind: 'penaltyChip', player: 2, options: ['lose:normal', 'lose:golden'] });
  });

  test('§7.4 怨霊を動かして接触した手番では、獲得判定を行わない', () => {
    const { s1 } = ghostMove('E', 'ghost:wraith', {
      chips: [{ cell: 'B5' }, { cell: 'F1' }],
      seats: { 0: { pos: 'B5' }, 1: { pos: 'D3' } },
    });
    expect(types(s1)).toContain('contact');
    expect(types(s1)).not.toContain('acquired');
    expect(P(s1, 0).held.normal).toBe(0);
  });

  test('§7.2(b) 怨霊が動かなかった場合（壁・スタート地点）は接触しない', () => {
    const { s1 } = ghostMove('W', 'ghost:wraith', { wraith: 'B1', chips: [{ cell: 'F3' }], seats: { 1: { pos: 'B1' } } });
    expect(types(s1)).not.toContain('contact');
  });
});
