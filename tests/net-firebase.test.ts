// Firebase 版の Room が置くデータの形と、Security Rules（deploy/firebase.rules.json）の要点を確かめる。
// 実際の Firebase には接続しない（本番の確認は deploy/README.md の手順 7 で行う）。
import { describe, expect, test } from 'vitest';
import { applyChoice, docState, joinSeat, newRoomDoc, startGame } from '../src/net/roomDoc.ts';
import { getOptions } from '../src/game/engine.ts';
import { fromRecord, toRecord } from '../src/net/firebase-room.ts';
import rulesText from '../deploy/firebase.rules.json?raw';
import { randomPicker } from './helpers.ts';

const lobby = () => joinSeat(newRoomDoc({ players: 3 }, 5, 'host-uid', 'A'), 'guest-uid', 'B');

describe('データベースに置く形（firebase-room.ts）', () => {
  test('doc は JSON の文字列で持ち、null や空の配列を含んでもそのまま読み戻せる', () => {
    const doc = lobby();
    expect(doc.seats).toContain(null);
    const record = toRecord(doc, 2);
    expect(typeof record.doc).toBe('string');
    expect(fromRecord(record)).toEqual({ doc, version: 2 });
  });

  test('Security Rules が読む写し（host・status・seatUids）は doc と一致する', () => {
    const record = toRecord(lobby(), 1);
    expect(record).toMatchObject({ version: 1, host: 'host-uid', status: 'lobby', seatUids: { 'host-uid': true, 'guest-uid': true } });
    expect(Object.keys(record.seatUids)).toHaveLength(2);
  });

  test('部屋がない・形が違う値は版 0 の「部屋なし」として扱う', () => {
    expect(fromRecord(null)).toEqual({ doc: null, version: 0 });
    expect(fromRecord(undefined)).toEqual({ doc: null, version: 0 });
    expect(fromRecord({ version: 3 })).toEqual({ doc: null, version: 0 });
  });

  test('対局中の doc の大きさは、ルールの上限（200000 文字）に十分に収まる', () => {
    const pick = randomPicker(7);
    let doc = startGame(joinSeat(lobby(), 'third-uid', 'C'));
    let largest = 0;
    for (let i = 0; i < 3000 && doc.status === 'playing'; i++) {
      const state = docState(doc)!;
      doc = applyChoice(doc, doc.seats[state.pending!.player]!.uid, pick(getOptions(state)))!;
      largest = Math.max(largest, toRecord(doc, i + 2).doc.length);
    }
    expect(largest).toBeLessThan(200000 / 4);
  });
});

describe('Security Rules（deploy/firebase.rules.json）', () => {
  const rules = JSON.parse(rulesText) as { rules: Record<string, unknown> };
  const room = (rules.rules.rooms as Record<string, Record<string, unknown>>)['$code']!;

  test('既定では読み書きを拒み、/rooms/<部屋コード> だけを開ける', () => {
    expect(rules.rules['.read']).toBe(false);
    expect(rules.rules['.write']).toBe(false);
    expect(room['.read']).toContain('auth !== null');
    expect(room['.read']).toContain('/^[A-Z0-9]{6}$/');
  });

  test('書き込みの条件：作成は版 1 と作成者本人、更新は版を 1 つ進める、対局中は着席者だけ、削除は作成者だけ', () => {
    const write = room['.write'] as string;
    expect(write).toContain("newData.child('version').val() === 1");
    expect(write).toContain("newData.child('host').val() === auth.uid");
    expect(write).toContain("newData.child('version').val() === data.child('version').val() + 1");
    expect(write).toContain("data.child('status').val() === 'lobby' || data.child('seatUids').child(auth.uid).val() === true");
    expect(write).toContain("!newData.exists() && data.child('host').val() === auth.uid");
  });

  test('置ける項目は toRecord が作る項目だけである', () => {
    const fields = Object.keys(toRecord(lobby(), 1));
    for (const f of fields) {
      expect(room['.validate']).toContain(`'${f}'`);
      expect(room[f]).toBeDefined();
    }
    expect(room['$other']).toEqual({ '.validate': false });
  });
});
