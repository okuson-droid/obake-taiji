// Firebase Realtime Database による本番の実装。匿名ログインで uid を得て、/rooms/<部屋コード> に部屋を置く。
// 書き込みはトランザクションで版を確かめてから行い、Security Rules（deploy/firebase.rules.json）が
// 版が 1 つずつ進むことと、対局中は着席している人だけが書けることを守る（もとの設計の Supabase の write_room に当たる）。
// 鍵（apiKey）はブラウザに公開してよい値であり、守りは Security Rules が担う。
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, onValue, ref, remove, runTransaction, type Database } from 'firebase/database';
import { transactWith, type Connection, type Room, type RoomDoc, type WriteResult } from './room.ts';

export type FirebaseConfig = { apiKey: string; authDomain: string; databaseURL: string; projectId: string };

/**
 * データベースに置く 1 部屋の形。Realtime Database は null や空の配列を保存しないため、doc は JSON の文字列で持つ。
 * host・status・seatUids は Security Rules が読むための写しである（doc と同じ内容から作る）。
 */
export type RoomRecord = {
  doc: string;
  version: number;
  host: string;
  status: RoomDoc['status'];
  seatUids: Record<string, true>;
};

/** 共有ドキュメントと版から、データベースに置く形を作る。 */
export const toRecord = (doc: RoomDoc, version: number): RoomRecord => ({
  doc: JSON.stringify(doc),
  version,
  host: doc.host,
  status: doc.status,
  seatUids: Object.fromEntries(doc.seats.flatMap((s) => (s === null ? [] : [[s.uid, true] as const]))),
});

/** データベースの値から、共有ドキュメントと版を取り出す。部屋がなければ版 0。 */
export const fromRecord = (value: unknown): { doc: RoomDoc | null; version: number } => {
  if (value === null || typeof value !== 'object') return { doc: null, version: 0 };
  const r = value as Partial<RoomRecord>;
  if (typeof r.doc !== 'string' || typeof r.version !== 'number') return { doc: null, version: 0 };
  return { doc: JSON.parse(r.doc) as RoomDoc, version: r.version };
};

let app: FirebaseApp | null = null;

const getApp = (config: FirebaseConfig): FirebaseApp => {
  app ??= initializeApp(config);
  return app;
};

/** 匿名ログインする。ログインの状態はブラウザに保たれ、再読み込み後も同じ uid に戻る。 */
const signIn = async (a: FirebaseApp): Promise<string> => {
  const auth = getAuth(a);
  await auth.authStateReady();
  if (auth.currentUser !== null) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
};

const createFirebaseRoom = (db: Database, code: string): Room => {
  const roomRef = ref(db, `rooms/${code}`);
  const read = async () => fromRecord((await get(roomRef)).val());
  const write = async (doc: RoomDoc, expectedVersion: number): Promise<WriteResult> => {
    const version = expectedVersion + 1;
    try {
      // 現在の版が expectedVersion のときだけ書く。違えば中止する（undefined を返すと書かない）。
      // トランザクションは手元の写しで先に試し、サーバーの値と違えばサーバーの値でやり直す。
      const result = await runTransaction(
        roomRef,
        (current: unknown) => (fromRecord(current).version === expectedVersion ? toRecord(doc, version) : undefined),
        { applyLocally: false },
      );
      return result.committed ? { ok: true, version } : { ok: false };
    } catch {
      // Security Rules に拒まれた場合（着席していない、版が飛んだなど）も、書けなかったものとして扱う。
      return { ok: false };
    }
  };
  return {
    subscribe(listener) {
      return onValue(roomRef, (snap) => {
        const { doc, version } = fromRecord(snap.val());
        listener(doc, version);
      });
    },
    write,
    async clear() {
      await remove(roomRef);
    },
    transact: (update) => transactWith(read, write, update),
  };
};

export const connectFirebase = async (config: FirebaseConfig, code: string): Promise<Connection> => {
  const a = getApp(config);
  const uid = await signIn(a);
  return { room: createFirebaseRoom(getDatabase(a), code), uid };
};
