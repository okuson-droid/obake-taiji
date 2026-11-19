// design.md §7.5（経路）と decisions.md D-17（シードの指定）
import { describe, expect, test } from 'vitest';
import { localHash, parseRoute } from '../src/ui/route.ts';

describe('経路（design §7.5）', () => {
  test('#/ と空のハッシュはトップ', () => {
    expect(parseRoute('#/')).toEqual({ name: 'top' });
    expect(parseRoute('')).toEqual({ name: 'top' });
  });

  test('#/local/<人数> はローカル対戦（2〜4 人）', () => {
    for (const n of [2, 3, 4] as const) expect(parseRoute(`#/local/${n}`)).toEqual({ name: 'local', players: n, seed: null });
  });

  test('範囲外の人数や解釈できない経路はトップとして扱う', () => {
    expect(parseRoute('#/local/1')).toEqual({ name: 'top' });
    expect(parseRoute('#/local/5')).toEqual({ name: 'top' });
    expect(parseRoute('#/room/ABC123')).toEqual({ name: 'top' });
  });

  test('D-17 ?seed=<数> でシードを指定できる（ハッシュ内のクエリを優先する）', () => {
    expect(parseRoute('#/local/3?seed=42')).toEqual({ name: 'local', players: 3, seed: 42 });
    expect(parseRoute('#/local/3', '?seed=7')).toEqual({ name: 'local', players: 3, seed: 7 });
    expect(parseRoute('#/local/3?seed=42', '?seed=7')).toEqual({ name: 'local', players: 3, seed: 42 });
  });

  test('D-17 シードは 0 以上 2^32 未満の整数だけを受け付ける', () => {
    expect(parseRoute('#/local/2?seed=4294967295').name === 'local' && parseRoute('#/local/2?seed=4294967295')).toMatchObject({ seed: 4294967295 });
    for (const bad of ['-1', '1.5', 'abc', '4294967296', '']) {
      expect(parseRoute(`#/local/2?seed=${bad}`)).toEqual({ name: 'local', players: 2, seed: null });
    }
  });

  test('localHash は parseRoute で読み戻せる', () => {
    expect(parseRoute(localHash(4, 99))).toEqual({ name: 'local', players: 4, seed: 99 });
    expect(parseRoute(localHash(2))).toEqual({ name: 'local', players: 2, seed: null });
  });
});
