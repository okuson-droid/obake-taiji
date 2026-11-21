// 検査用の偽 DB（design.md §7.2）。版の検査、通知、transact のやり直し。
import { describe, expect, test } from 'vitest';
import { createFakeRoom, type KeyValueStore } from '../src/net/fake-room.ts';
import { newRoomDoc } from '../src/net/roomDoc.ts';
import type { RoomDoc } from '../src/net/room.ts';

const memoryStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const doc = newRoomDoc({ players: 2 }, 1, 'u1', 'A');

describe('偽 DB（fake-room.ts）', () => {
  test('部屋がなければ版 0。版 0 で書くと作られ、版 1 になる。キーは obake-room:<code>', async () => {
    const store = memoryStore();
    const room = createFakeRoom('ABC123', store);
    expect(await room.write(doc, 1)).toEqual({ ok: false });
    expect(await room.write(doc, 0)).toEqual({ ok: true, version: 1 });
    expect(JSON.parse(store.data.get('obake-room:ABC123')!)).toEqual({ doc, version: 1 });
  });

  test('版が食い違う書き込みは失敗し、内容を変えない', async () => {
    const room = createFakeRoom('ABC124', memoryStore());
    await room.write(doc, 0);
    const changed: RoomDoc = { ...doc, seed: 2 };
    expect(await room.write(changed, 0)).toEqual({ ok: false });
    expect(await room.write(changed, 1)).toEqual({ ok: true, version: 2 });
  });

  test('購読すると現在の値が届き、同じ保存先への書き込みのたびに届く', async () => {
    const store = memoryStore();
    const a = createFakeRoom('ABC125', store);
    const b = createFakeRoom('ABC125', store);
    const seen: [RoomDoc | null, number][] = [];
    const stop = b.subscribe((d, v) => seen.push([d, v]));
    await a.write(doc, 0);
    await a.clear();
    await new Promise((r) => setTimeout(r, 0));
    stop();
    expect(seen.map(([d, v]) => [d?.host ?? null, v])).toEqual([
      [null, 0],
      ['u1', 1],
      [null, 0],
    ]);
  });

  test('transact は読み込み→更新→書き込みを行い、変化がなければ書かない', async () => {
    const room = createFakeRoom('ABC126', memoryStore());
    expect(await room.transact(() => doc)).toEqual(doc);
    const same = await room.transact((d) => d);
    expect(same).toEqual(doc);
    const seen: number[] = [];
    room.subscribe((_, v) => seen.push(v));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([1]);
  });

  test('transact は版の衝突でやり直す', async () => {
    const store = memoryStore();
    const room = createFakeRoom('ABC127', store);
    await room.write(doc, 0);
    let first = true;
    const result = await room.transact((d) => {
      if (first) {
        first = false;
        // 読み込みの後、書き込みの前に別の人が書く。
        store.setItem('obake-room:ABC127', JSON.stringify({ doc: { ...d!, seed: 9 }, version: 2 }));
      }
      return { ...d!, moves: [] , seed: (d!.seed) + 100 };
    });
    expect(result?.seed).toBe(109);
  });
});
