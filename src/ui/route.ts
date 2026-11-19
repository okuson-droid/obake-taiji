// 画面の経路（design.md §7.5）。経路はハッシュで表す。
// #/ はトップ、#/local/<人数> はローカル対戦である。?seed=<数> でシードを指定できる（decisions.md D-17）。
import type { GameConfig } from '../game/types.ts';

export type Route = { name: 'top' } | { name: 'local'; players: GameConfig['players']; seed: number | null };

/** シードとして受け付ける文字列（0 以上 2^32 未満の 10 進整数） */
const parseSeed = (text: string | null): number | null => {
  if (text === null || !/^\d{1,10}$/.test(text)) return null;
  const n = Number(text);
  return n < 2 ** 32 ? n : null;
};

/**
 * location.hash と location.search から経路を求める。
 * シードはハッシュ内のクエリ（#/local/3?seed=1）を優先し、なければ通常のクエリ（?seed=1#/local/3）を使う。
 * 解釈できない経路はトップとして扱う。
 */
export const parseRoute = (hash: string, search = ''): Route => {
  const body = hash.replace(/^#/, '');
  const [path = '', hashQuery = ''] = body.split('?', 2);
  const m = /^\/local\/([234])\/?$/.exec(path);
  if (m === null) return { name: 'top' };
  const seed =
    parseSeed(new URLSearchParams(hashQuery).get('seed')) ?? parseSeed(new URLSearchParams(search).get('seed'));
  return { name: 'local', players: Number(m[1]) as GameConfig['players'], seed };
};

/** ローカル対戦のハッシュを作る。 */
export const localHash = (players: GameConfig['players'], seed?: number): string =>
  seed === undefined ? `#/local/${players}` : `#/local/${players}?seed=${seed}`;

/** ブラウザの暗号論的乱数でシードを作る（decisions.md D-17）。 */
export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
