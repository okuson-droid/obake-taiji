// design.md §6.2（乱数の消費順）、decisions.md D-03（mulberry32）
// rules v0.2 §3.4・§3.5（シャッフル）、§8.3（ダイス）で使う乱数の決定性を確かめる。
import { describe, expect, test } from 'vitest';
import { next, rollDie, seedToState, shuffle } from '../src/game/rng.ts';

/** 広く知られた mulberry32 の参照実装。src/game/rng.ts がこれと同じ列を出すことを確かめる。 */
const referenceMulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const take = (seed: number, n: number): number[] => {
  const out: number[] = [];
  let s = seedToState(seed);
  for (let i = 0; i < n; i++) {
    const [v, ns] = next(s);
    out.push(v);
    s = ns;
  }
  return out;
};

describe('mulberry32（design §6.2）', () => {
  test('内部状態は uint32 に正規化される', () => {
    expect(seedToState(-1)).toBe(4294967295);
    expect(seedToState(2 ** 32 + 5)).toBe(5);
    let s = seedToState(123);
    for (let i = 0; i < 100; i++) {
      s = next(s)[1];
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });

  test('参照実装と同じ列を出す', () => {
    for (const seed of [0, 1, 2, 42, 12345, 0x7fffffff, 0xffffffff]) {
      const ref = referenceMulberry32(seed);
      const expected = Array.from({ length: 50 }, () => ref());
      expect(take(seed, 50)).toEqual(expected);
    }
  });

  test('シード 1 の先頭 3 値が固定値と一致する（通信プロトコルの固定）', () => {
    expect(take(1, 3)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  test('同じシードで同じ列、異なるシードで異なる列になる', () => {
    expect(take(2026, 20)).toEqual(take(2026, 20));
    expect(take(2026, 20)).not.toEqual(take(2027, 20));
  });

  test('値は 0 以上 1 未満である', () => {
    for (const v of take(99, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('シャッフル（design §6.2、rules v0.2 §3.4・§3.5）', () => {
  const items = Array.from({ length: 180 }, (_, i) => i);

  test('同じシードで同じ結果、異なるシードで異なる結果になる', () => {
    const [a, sa] = shuffle(items, seedToState(7));
    const [b, sb] = shuffle(items, seedToState(7));
    const [c] = shuffle(items, seedToState(8));
    expect(a).toEqual(b);
    expect(sa).toBe(sb);
    expect(a).not.toEqual(c);
  });

  test('結果は元の要素の並べ替えであり、引数の配列を変更しない', () => {
    const input = [...items];
    const [out] = shuffle(input, seedToState(3));
    expect(input).toEqual(items);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
  });

  test('n 要素のシャッフルは乱数を n−1 回消費する', () => {
    let s = seedToState(11);
    for (let i = 0; i < 179; i++) s = next(s)[1];
    expect(shuffle(items, seedToState(11))[1]).toBe(s);
    expect(shuffle([], seedToState(11))[1]).toBe(seedToState(11));
    expect(shuffle(['x'], seedToState(11))[1]).toBe(seedToState(11));
  });

  test('Fisher–Yates：i を末尾から 1 まで下げ、j = floor(next() * (i + 1)) と入れ替える', () => {
    const ref = referenceMulberry32(5);
    const expected = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let i = expected.length - 1; i >= 1; i--) {
      const j = Math.floor(ref() * (i + 1));
      [expected[i], expected[j]] = [expected[j] as string, expected[i] as string];
    }
    expect(shuffle(['a', 'b', 'c', 'd', 'e', 'f'], seedToState(5))[0]).toEqual(expected);
  });
});

describe('ダイス（design §6.2、rules v0.2 §8.3）', () => {
  test('出目は 1〜6 の整数で、6 種類すべてが出る', () => {
    let s = seedToState(2026);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const [pip, ns] = rollDie(s);
      expect(Number.isInteger(pip)).toBe(true);
      expect(pip).toBeGreaterThanOrEqual(1);
      expect(pip).toBeLessThanOrEqual(6);
      seen.add(pip);
      s = ns;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('出目は floor(next() * 6) + 1 で、乱数を 1 回消費する', () => {
    const s = seedToState(77);
    const [v, ns] = next(s);
    expect(rollDie(s)).toEqual([Math.floor(v * 6) + 1, ns]);
  });

  test('同じシードで同じ出目の列になる', () => {
    const roll = (seed: number): number[] => {
      let s = seedToState(seed);
      return Array.from({ length: 30 }, () => {
        const [pip, ns] = rollDie(s);
        s = ns;
        return pip;
      });
    };
    expect(roll(4)).toEqual(roll(4));
    expect(roll(4)).not.toEqual(roll(5));
  });
});
