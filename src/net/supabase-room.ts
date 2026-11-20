// Supabase による本番の実装（design.md §7.4）。匿名ログインで uid を得て、rooms テーブルを読み、
// 書き込みは RPC 関数 write_room（版の一致と着席を検査する）に限る。変更は Realtime で受け取る。
// 鍵は publishable key を使い、secret key は使わない（decisions.md D-09）。
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { transactWith, type Connection, type Room, type RoomDoc, type WriteResult } from './room.ts';

type Row = { doc: RoomDoc; version: number };

let client: SupabaseClient | null = null;

const getClient = (url: string, key: string): SupabaseClient => {
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
};

/** 匿名ログインする。セッションは supabase-js の既定どおり localStorage に保ち、再読み込み後も同じ uid に戻る。 */
const signIn = async (c: SupabaseClient): Promise<string> => {
  const { data } = await c.auth.getSession();
  if (data.session !== null) return data.session.user.id;
  const res = await c.auth.signInAnonymously();
  if (res.error !== null || res.data.user === null) throw new Error(`匿名ログインに失敗した：${res.error?.message ?? ''}`);
  return res.data.user.id;
};

const createSupabaseRoom = (c: SupabaseClient, code: string): Room => {
  /** 列の version に 1 を足したものを、この画面での版とする（room.ts の約束） */
  const read = async (): Promise<{ doc: RoomDoc | null; version: number }> => {
    const { data, error } = await c.from('rooms').select('doc, version').eq('id', code).maybeSingle<Row>();
    if (error !== null) throw new Error(`部屋を読めなかった：${error.message}`);
    return data === null ? { doc: null, version: 0 } : { doc: data.doc, version: data.version + 1 };
  };
  const write = async (doc: RoomDoc, expectedVersion: number): Promise<WriteResult> => {
    if (expectedVersion === 0) {
      const { error } = await c.from('rooms').insert({ id: code, doc, version: 0 });
      return error === null ? { ok: true, version: 1 } : { ok: false };
    }
    const { data, error } = await c.rpc('write_room', { p_id: code, p_expected: expectedVersion - 1, p_doc: doc });
    if (error !== null) throw new Error(`書き込めなかった：${error.message}`);
    return typeof data === 'number' && data >= 0 ? { ok: true, version: data + 1 } : { ok: false };
  };
  return {
    subscribe(listener) {
      let latest = -1;
      const deliver = (doc: RoomDoc | null, version: number) => {
        // 古い版が後から届いても戻らないようにする。部屋が消えたとき（version 0）は必ず知らせる。
        if (version !== 0 && version <= latest) return;
        latest = version;
        listener(doc, version);
      };
      const channel = c
        .channel(`room:${code}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
          if (payload.eventType === 'DELETE') deliver(null, 0);
          else {
            const row = payload.new as Row;
            deliver(row.doc, row.version + 1);
          }
        })
        .subscribe((status) => {
          // 購読の開始時と再接続時に、取りこぼしがないよう読み直す。
          if (status === 'SUBSCRIBED') void read().then(({ doc, version }) => deliver(doc, version));
        });
      return () => {
        void c.removeChannel(channel);
      };
    },
    write,
    async clear() {
      const { error } = await c.rpc('clear_room', { p_id: code });
      if (error !== null) throw new Error(`部屋を消せなかった：${error.message}`);
    },
    transact: (update) => transactWith(read, write, update),
  };
};

export const connectSupabase = async (url: string, key: string, code: string): Promise<Connection> => {
  const c = getClient(url, key);
  const uid = await signIn(c);
  return { room: createSupabaseRoom(c, code), uid };
};
