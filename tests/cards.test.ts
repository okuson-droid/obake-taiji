// rules v0.2 §2.9・§2.10（カードの総数と内訳）、design.md §3.2（カード ID の割り当て）
import { describe, expect, test } from 'vitest';
import {
  GHOST_CARDS,
  GHOST_CARD_BY_ID,
  HUMAN_CARD_KINDS,
  MOVE_CARDS,
  MOVE_CARD_BY_ID,
} from '../src/data/cards.ts';
import type { MoveCard } from '../src/game/types.ts';

const countBy = <T>(items: readonly T[], key: (x: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of items) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
};

const moveKey = (c: MoveCard): string =>
  c.type === 'human' ? `human:${c.kind}` : c.type === 'ghost' ? `ghost:${c.dir}` : 'barrier';

describe('移動カード（rules v0.2 §2.9）', () => {
  test('§2.9 合計 180 枚で ID が重複しない', () => {
    expect(MOVE_CARDS).toHaveLength(180);
    expect(new Set(MOVE_CARDS.map((c) => c.id)).size).toBe(180);
    expect(Object.keys(MOVE_CARD_BY_ID)).toHaveLength(180);
  });

  test('§2.9 人間移動 120 枚（8 種類×各 15 枚）', () => {
    const humans = MOVE_CARDS.filter((c) => c.type === 'human');
    expect(humans).toHaveLength(120);
    const counts = countBy(humans, moveKey);
    for (const kind of ['front', 'back', 'right', 'left', 'N', 'E', 'S', 'W']) {
      expect(counts[`human:${kind}`]).toBe(15);
    }
  });

  test('§2.9 お化け移動 40 枚（東西南北×各 10 枚）', () => {
    const ghosts = MOVE_CARDS.filter((c) => c.type === 'ghost');
    expect(ghosts).toHaveLength(40);
    const counts = countBy(ghosts, moveKey);
    for (const dir of ['N', 'E', 'S', 'W']) {
      expect(counts[`ghost:${dir}`]).toBe(10);
    }
  });

  test('§2.9 通せん棒 20 枚', () => {
    expect(MOVE_CARDS.filter((c) => c.type === 'barrier')).toHaveLength(20);
  });

  test('design §3.2 ID は M000〜M179 で、種類ごとの範囲が割り当てどおりである', () => {
    MOVE_CARDS.forEach((c, i) => {
      expect(c.id).toBe(`M${String(i).padStart(3, '0')}`);
      if (i < 120) {
        expect(c).toEqual({ id: c.id, type: 'human', kind: HUMAN_CARD_KINDS[Math.floor(i / 15)] });
      } else if (i < 160) {
        expect(c).toEqual({ id: c.id, type: 'ghost', dir: ['N', 'E', 'S', 'W'][Math.floor((i - 120) / 10)] });
      } else {
        expect(c).toEqual({ id: c.id, type: 'barrier' });
      }
    });
    // 境界の確認
    expect(MOVE_CARD_BY_ID['M014']).toEqual({ id: 'M014', type: 'human', kind: 'front' });
    expect(MOVE_CARD_BY_ID['M015']).toEqual({ id: 'M015', type: 'human', kind: 'back' });
    expect(MOVE_CARD_BY_ID['M105']).toEqual({ id: 'M105', type: 'human', kind: 'W' });
    expect(MOVE_CARD_BY_ID['M119']).toEqual({ id: 'M119', type: 'human', kind: 'W' });
    expect(MOVE_CARD_BY_ID['M120']).toEqual({ id: 'M120', type: 'ghost', dir: 'N' });
    expect(MOVE_CARD_BY_ID['M159']).toEqual({ id: 'M159', type: 'ghost', dir: 'W' });
    expect(MOVE_CARD_BY_ID['M160']).toEqual({ id: 'M160', type: 'barrier' });
    expect(MOVE_CARD_BY_ID['M179']).toEqual({ id: 'M179', type: 'barrier' });
  });
});

describe('お化けカード（rules v0.2 §2.10）', () => {
  test('§2.10 合計 30 枚で ID が重複しない', () => {
    expect(GHOST_CARDS).toHaveLength(30);
    expect(new Set(GHOST_CARDS.map((c) => c.id)).size).toBe(30);
    expect(Object.keys(GHOST_CARD_BY_ID)).toHaveLength(30);
  });

  test('§2.10 内訳：1 匹 10 枚、2 匹 10 枚、3 匹 7 枚、ゴールデン 1 匹 3 枚', () => {
    const counts = countBy(GHOST_CARDS, (c) => `${c.normal}/${c.golden}`);
    expect(counts).toEqual({ '1/0': 10, '2/0': 10, '3/0': 7, '0/1': 3 });
  });

  test('§2.10 お化けの総数：通常 51 匹、ゴールデン 3 匹', () => {
    const normal = GHOST_CARDS.reduce((s, c) => s + c.normal, 0);
    const golden = GHOST_CARDS.reduce((s, c) => s + c.golden, 0);
    expect(normal).toBe(10 * 1 + 10 * 2 + 7 * 3);
    expect(golden).toBe(3);
  });

  test('design §3.2 ID は G00〜G29 で、範囲が割り当てどおりである', () => {
    GHOST_CARDS.forEach((c, i) => {
      expect(c.id).toBe(`G${String(i).padStart(2, '0')}`);
      const expected =
        i < 10 ? { normal: 1, golden: 0 } : i < 20 ? { normal: 2, golden: 0 } : i < 27 ? { normal: 3, golden: 0 } : { normal: 0, golden: 1 };
      expect(c).toEqual({ id: c.id, ...expected });
    });
  });
});
