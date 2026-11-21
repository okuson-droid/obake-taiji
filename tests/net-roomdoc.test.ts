// 共有ドキュメントの書き換え（design.md §7.3・§7.5、decisions.md D-06）
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { isCheckpoint } from '../src/game/history.ts';
import {
  ROOM_CODE,
  applyChoice,
  canStart,
  docState,
  joinSeat,
  newRoomDoc,
  randomRoomCode,
  seatOf,
  startGame,
  undoChoice,
} from '../src/net/roomDoc.ts';
import type { RoomDoc } from '../src/net/room.ts';
import { MOVE_CARD_BY_ID } from '../src/data/cards.ts';
import type { MoveCardId } from '../src/game/types.ts';
import { randomPicker } from './helpers.ts';

const lobby = (players: 2 | 3 | 4 = 2): RoomDoc => newRoomDoc({ players }, 77, 'u1', '  ホスト  ');
const full = (players: 2 | 3 | 4 = 2): RoomDoc => {
  let d = lobby(players);
  for (let i = 2; i <= players; i++) d = joinSeat(d, `u${i}`, `P${i}`);
  return d;
};

describe('ロビー（design §7.5）', () => {
  test('部屋コードは英大文字と数字の 6 桁', () => {
    for (let i = 0; i < 50; i++) expect(randomRoomCode()).toMatch(ROOM_CODE);
  });

  test('部屋を作ると、席 1 に作成者が座ったロビーになる', () => {
    const d = lobby(3);
    expect(d).toMatchObject({ schema: 1, rulesVersion: '0.1', status: 'lobby', host: 'u1', seed: 77, checkpoint: null, moves: [] });
    expect(d.seats).toEqual([{ uid: 'u1', name: 'ホスト' }, null, null]);
  });

  test('空席に順に座り、同じ uid は席を増やさず元の席に戻る', () => {
    let d = joinSeat(lobby(3), 'u2', 'B');
    d = joinSeat(d, 'u2', 'B2');
    expect(seatOf(d, 'u2')).toBe(1);
    expect(d.seats[2]).toBeNull();
    expect(seatOf(d, 'u9')).toBeNull();
  });

  test('満席なら座れない。名前は 12 文字までに切る', () => {
    const d = joinSeat(full(2), 'u9', 'X');
    expect(seatOf(d, 'u9')).toBeNull();
    expect(joinSeat(lobby(2), 'u2', 'あ'.repeat(20)).seats[1]?.name).toBe('あ'.repeat(12));
  });

  test('作成者だけが、全席が埋まってから開始できる', () => {
    expect(canStart(lobby(2), 'u1')).toBe(false);
    expect(canStart(full(2), 'u2')).toBe(false);
    expect(canStart(full(2), 'u1')).toBe(true);
  });

  test('開始すると checkpoint = createGame(config, seed)、moves = [] になる', () => {
    const d = startGame(full(4));
    expect(d.status).toBe('playing');
    expect(d.checkpoint).toEqual(createGame({ players: 4 }, 77));
    expect(d.moves).toEqual([]);
    expect(canStart(d, 'u1')).toBe(false);
    expect(joinSeat(d, 'u9', 'X')).toBe(d);
  });
});

describe('対局の書き込み（design §7.3）', () => {
  test('選択待ちの席の人だけが書ける。他人や不正な選択肢は null', () => {
    const d = startGame(full(2));
    const state = docState(d)!;
    const option = getOptions(state)[0]!;
    expect(applyChoice(d, 'u2', option)).toBeNull();
    expect(applyChoice(d, 'u1', 'overlap:purge')).toBeNull();
    expect(applyChoice(d, 'u1', option)).not.toBeNull();
  });

  test('チェックポイントになる手は checkpoint を進め、ならない手は moves に足す', () => {
    const pick = randomPicker(5);
    let d = startGame(full(3));
    for (let i = 0; i < 300 && d.status === 'playing'; i++) {
      const state = docState(d)!;
      const option = pick(getOptions(state));
      const uid = d.seats[state.pending!.player]!.uid;
      const next = applyChoice(d, uid, option)!;
      const expected = applyMove(state, option);
      if (isCheckpoint(state, expected)) {
        expect(next.checkpoint).toEqual(expected);
        expect(next.moves).toEqual([]);
      } else {
        expect(next.moves).toEqual([...d.moves, option]);
      }
      expect(JSON.stringify(docState(next))).toBe(JSON.stringify(expected));
      d = next;
    }
  });

  test('終局した手で status が ended になる', () => {
    const pick = randomPicker(8);
    let d = startGame(full(2));
    for (let i = 0; i < 20000 && d.status === 'playing'; i++) {
      const state = docState(d)!;
      d = applyChoice(d, d.seats[state.pending!.player]!.uid, pick(getOptions(state)))!;
    }
    expect(d.status).toBe('ended');
    expect(docState(d)!.result).not.toBeNull();
  });

  test('U-03 対象を選ぶ前のカードの選択は、選んだ本人だけが取り消せる', () => {
    let d = startGame(full(2));
    // 対象を選ぶカード（お化け移動・通せん棒）が来るまで進める。
    for (let i = 0; i < 200; i++) {
      const state = docState(d)!;
      const uid = d.seats[state.pending!.player]!.uid;
      const special = getOptions(state).find(
        (o) => o.startsWith('play:') && MOVE_CARD_BY_ID[o.slice(5) as MoveCardId]?.type !== 'human',
      );
      if (special !== undefined) {
        const chosen = applyChoice(d, uid, special)!;
        expect(chosen.moves).toEqual([special]);
        const other = uid === 'u1' ? 'u2' : 'u1';
        expect(undoChoice(chosen, other)).toBeNull();
        expect(undoChoice(chosen, uid)?.moves).toEqual([]);
        return;
      }
      d = applyChoice(d, uid, getOptions(state)[0]!)!;
    }
    throw new Error('対象を選ぶカードが来なかった');
  });

  test('D-06 不正な選択肢 ID を含む doc は replay で弾かれる', () => {
    const d = startGame(full(2));
    expect(() => docState({ ...d, moves: ['overlap:purge'] })).toThrow();
  });
});
