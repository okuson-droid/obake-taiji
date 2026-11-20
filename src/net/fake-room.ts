// 検査用の偽 DB（design.md §7.2）。localStorage のキー obake-room:<code> に { doc, version } を保存し、
// storage イベント（別のタブ）と同じタブ内のリスナーで変更を知らせる。
// Playwright では同じブラウザコンテキストの複数ページで共有する。
import { transactWith, type Connection, type Room, type RoomDoc, type WriteResult } from './room.ts';

type Stored = { doc: RoomDoc; version: number };

/** localStorage と同じ形の保存先（単体テストでは Map で差し替える） */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const keyOf = (code: string): string => `obake-room:${code}`;

/** 同じタブ（同じ保存先）の中のリスナー */
const localListeners = new Map<string, Set<() => void>>();

const notifyLocal = (key: string) => {
  for (const f of localListeners.get(key) ?? []) f();
};

export const createFakeRoom = (code: string, store: KeyValueStore, onExternalChange?: (key: string, f: () => void) => () => void): Room => {
  const key = keyOf(code);
  const read = async (): Promise<{ doc: RoomDoc | null; version: number }> => {
    const raw = store.getItem(key);
    if (raw === null) return { doc: null, version: 0 };
    const s = JSON.parse(raw) as Stored;
    return { doc: s.doc, version: s.version };
  };
  const write = async (doc: RoomDoc, expectedVersion: number): Promise<WriteResult> => {
    const cur = await read();
    if (cur.version !== expectedVersion) return { ok: false };
    const version = expectedVersion + 1;
    store.setItem(key, JSON.stringify({ doc, version } satisfies Stored));
    notifyLocal(key);
    return { ok: true, version };
  };
  return {
    subscribe(listener) {
      const emit = () => {
        void read().then(({ doc, version }) => listener(doc, version));
      };
      const set = localListeners.get(key) ?? new Set();
      set.add(emit);
      localListeners.set(key, set);
      const stopExternal = onExternalChange?.(key, emit);
      emit();
      return () => {
        set.delete(emit);
        stopExternal?.();
      };
    },
    write,
    async clear() {
      store.removeItem(key);
      notifyLocal(key);
    },
    transact: (update) => transactWith(read, write, update),
  };
};

/** ブラウザの localStorage を使う偽 DB に接続する。uid はタブごと（sessionStorage）に作る。 */
export const connectFake = async (code: string): Promise<Connection> => {
  const uidKey = 'obake-fake-uid';
  let uid = window.sessionStorage.getItem(uidKey);
  if (uid === null) {
    uid = crypto.randomUUID();
    window.sessionStorage.setItem(uidKey, uid);
  }
  const room = createFakeRoom(code, window.localStorage, (key, f) => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) f();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  return { room, uid };
};
