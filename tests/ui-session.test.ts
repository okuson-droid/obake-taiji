// ローカル対戦の状態（design.md §4.2・§7.3 の考え方、decisions.md U-03）
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { MOVE_CARD_BY_ID } from '../src/data/cards.ts';
import type { MoveCardId } from '../src/game/types.ts';
import { allEvents, canUndo, choose, currentState, startSession, undo, type Session } from '../src/ui/session.ts';
import { randomPicker } from './helpers.ts';

describe('ローカル対戦の状態（session.ts）', () => {
  test('開始時はチェックポイントが createGame の結果で、準備中の出来事を持つ', () => {
    const s = startSession({ players: 3 }, 5);
    expect(s.checkpoint).toEqual(createGame({ players: 3 }, 5));
    expect(s.moves).toEqual([]);
    expect(s.log).toEqual(createGame({ players: 3 }, 5).events);
  });

  test('§4.2 乱択で進めても、局面は applyMove を順に適用した結果と一致する', () => {
    const pick = randomPicker(9);
    let s: Session = startSession({ players: 4 }, 9);
    let direct = createGame({ players: 4 }, 9);
    for (let i = 0; i < 300 && direct.result === null; i++) {
      const o = pick(getOptions(direct));
      s = choose(s, o);
      direct = applyMove(direct, o);
      expect(JSON.stringify(currentState(s))).toBe(JSON.stringify(direct));
    }
  });

  test('U-03 対象を選ぶ前のカードの選択は moves に積まれ、「選び直す」で取り消せる', () => {
    // 通せん棒カードかお化け移動カードを持つ局面まで、人間移動カードで進める。
    let s = startSession({ players: 2 }, 3);
    for (let i = 0; i < 100; i++) {
      const state = currentState(s);
      const special = getOptions(state).find(
        (o) => o.startsWith('play:') && MOVE_CARD_BY_ID[o.slice(5) as MoveCardId]?.type !== 'human',
      );
      if (special !== undefined) {
        const before = s;
        s = choose(s, special);
        expect(s.moves).toEqual([special]);
        expect(s.checkpoint).toBe(before.checkpoint);
        expect(canUndo(s)).toBe(true);
        const back = undo(s);
        expect(back.moves).toEqual([]);
        expect(canUndo(back)).toBe(false);
        expect(currentState(back)).toEqual(currentState(before));
        return;
      }
      s = choose(s, getOptions(state)[0]!);
    }
    throw new Error('対象を選ぶカードが手札に来なかった');
  });

  test('チェックポイントに進むと moves が空になり、出来事がログに移る', () => {
    const s0 = startSession({ players: 2 }, 11);
    const s1 = choose(s0, getOptions(currentState(s0))[0]!);
    if (s1.moves.length === 0) {
      expect(s1.log.length).toBeGreaterThan(s0.log.length);
      expect(allEvents(s1)).toEqual(s1.log);
    } else {
      // 対象を選ぶカードだった場合は、取り消せる範囲の出来事が allEvents に含まれる。
      expect(allEvents(s1).length).toBeGreaterThan(s1.log.length);
    }
  });

  test('取り消せないときの undo は何もしない', () => {
    const s = startSession({ players: 2 }, 1);
    expect(undo(s)).toBe(s);
  });
});
