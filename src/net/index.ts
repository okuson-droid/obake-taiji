// 使う Room の実装を選ぶ（design.md §7.2、decisions.md D-08）。
// URL の ?db=fake または環境変数 VITE_ROOM_BACKEND=fake で偽 DB を使う。
// それ以外は、Supabase の URL と publishable key が設定されていれば Supabase を使い、なければオンライン対戦を出さない。
import { connectFake } from './fake-room.ts';
import type { Connection } from './room.ts';

const supabaseConfig = (): { url: string; key: string } | null => {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
  return url !== '' && key !== '' ? { url, key } : null;
};

/** URL（通常のクエリかハッシュ内のクエリ）か環境変数で偽 DB が指定されているか */
export const fakeDbRequested = (): boolean => {
  if ((import.meta.env.VITE_ROOM_BACKEND as string | undefined) === 'fake') return true;
  const hashQuery = window.location.hash.split('?')[1] ?? '';
  return [window.location.search, hashQuery].some((q) => new URLSearchParams(q).get('db') === 'fake');
};

/** オンライン対戦を出せるか（D-08） */
export const onlineAvailable = (): boolean => fakeDbRequested() || supabaseConfig() !== null;

/** 部屋に接続する。オンライン対戦を出せないときは例外を投げる。 */
export const connect = async (code: string): Promise<Connection> => {
  if (fakeDbRequested()) return connectFake(code);
  const cfg = supabaseConfig();
  if (cfg === null) throw new Error('オンライン対戦の設定がない');
  // Supabase の部品は、オンライン対戦を使うときだけ読み込む。
  const { connectSupabase } = await import('./supabase-room.ts');
  return connectSupabase(cfg.url, cfg.key, code);
};
