// 使う Room の実装を選ぶ（design.md §7.2、decisions.md D-08）。
// URL の ?db=fake または環境変数 VITE_ROOM_BACKEND=fake で偽 DB を使う。
// それ以外は、Firebase の設定（VITE_FIREBASE_*）がそろっていれば Firebase を使い、なければオンライン対戦を出さない。
import { connectFake } from './fake-room.ts';
import type { FirebaseConfig } from './firebase-room.ts';
import type { Connection } from './room.ts';

const env = (name: string): string => ((import.meta.env[name] as string | undefined) ?? '').trim();

const firebaseConfig = (): FirebaseConfig | null => {
  const config = {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    databaseURL: env('VITE_FIREBASE_DATABASE_URL'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
  };
  return Object.values(config).every((v) => v !== '') ? config : null;
};

/** URL（通常のクエリかハッシュ内のクエリ）か環境変数で偽 DB が指定されているか */
export const fakeDbRequested = (): boolean => {
  if ((import.meta.env.VITE_ROOM_BACKEND as string | undefined) === 'fake') return true;
  const hashQuery = window.location.hash.split('?')[1] ?? '';
  return [window.location.search, hashQuery].some((q) => new URLSearchParams(q).get('db') === 'fake');
};

/** オンライン対戦を出せるか（D-08） */
export const onlineAvailable = (): boolean => fakeDbRequested() || firebaseConfig() !== null;

/** 部屋に接続する。オンライン対戦を出せないときは例外を投げる。 */
export const connect = async (code: string): Promise<Connection> => {
  if (fakeDbRequested()) return connectFake(code);
  const cfg = firebaseConfig();
  if (cfg === null) throw new Error('オンライン対戦の設定がない');
  // Firebase の部品は、オンライン対戦を使うときだけ読み込む。
  const { connectFirebase } = await import('./firebase-room.ts');
  return connectFirebase(cfg, code);
};
