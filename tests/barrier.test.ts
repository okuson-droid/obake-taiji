// rules v0.2 §5.5・§5.6（通せん棒カード）、§2.3（1 つの辺に 1 本まで）、design §5.11・§6.1
import { describe, expect, test } from 'vitest';
import { EDGE_IDS } from '../src/data/board.ts';
import { isConnected } from '../src/game/board-ops.ts';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { canPlaceBarrier, placeableEdges } from '../src/game/queries.ts';
import type { EdgeId, OptionId } from '../src/game/types.ts';
import { P, arrange, cardIds, finish, play } from './helpers.ts';

const withBarrierCard = (barriers: EdgeId[]) => {
  const ids = cardIds();
  const card = ids.barrier();
  const s0 = arrange({ barriers, chips: [{ cell: 'F3' }], seats: { 0: { hand: [card] } } });
  return { s0, mid: applyMove(s0, play(card)) };
};

describe('通せん棒カードの選択肢（rules v0.2 §5.5、design §6.1）', () => {
  test('§5.5 通せん棒がなければ 60 本すべてに設置でき、撤去の選択肢はない', () => {
    const { mid } = withBarrierCard([]);
    expect(getOptions(mid)).toEqual(EDGE_IDS.map((e) => `barrier:place:${e}`));
  });

  test('§5.5 設置の選択肢を辺 ID の昇順に並べ、その後に撤去の選択肢を昇順に並べる', () => {
    const { mid } = withBarrierCard(['S:D2', 'E:B5']);
    const options = getOptions(mid);
    const place = options.filter((o) => o.startsWith('barrier:place:'));
    const remove = options.filter((o) => o.startsWith('barrier:remove:'));
    expect(options).toEqual([...place, ...remove]);
    expect(place.map((o) => o.slice(14))).toEqual([...place.map((o) => o.slice(14))].sort());
    expect(remove).toEqual(['barrier:remove:E:B5', 'barrier:remove:S:D2']);
    expect(place).toHaveLength(58);
  });

  test('§2.3 通せん棒のある辺には設置できない（1 つの辺に 1 本まで）', () => {
    const { mid } = withBarrierCard(['E:C3']);
    expect(getOptions(mid)).not.toContain('barrier:place:E:C3');
    expect(getOptions(mid)).toContain('barrier:remove:E:C3');
  });

  test('§5.5(a) 設置すると 36 部屋が行き来できなくなる辺は選択肢に出ない（R-04）', () => {
    const { mid } = withBarrierCard(['E:A1']);
    expect(getOptions(mid)).not.toContain('barrier:place:S:A1');
    expect(getOptions(mid)).toContain('barrier:place:S:B1');
  });

  test('§5.5(a) 盤を分断する最後の 1 本は選択肢に出ない', () => {
    const wall: EdgeId[] = ['E:C1', 'E:C2', 'E:C3', 'E:C4', 'E:C5'];
    const { mid } = withBarrierCard(wall);
    expect(getOptions(mid)).not.toContain('barrier:place:E:C6');
    for (const o of getOptions(mid)) {
      if (!o.startsWith('barrier:place:')) continue;
      expect(isConnected([...wall, o.slice(14) as EdgeId])).toBe(true);
    }
  });
});

describe('通せん棒の設置と撤去（rules v0.2 §5.5）', () => {
  test('§5.5(a) 選んだ辺に設置し、barriers は昇順に保つ', () => {
    const { mid } = withBarrierCard(['S:D2', 'E:B5']);
    const s1 = applyMove(mid, 'barrier:place:E:D4');
    expect(s1.barriers).toEqual(['E:B5', 'E:D4', 'S:D2']);
    expect(s1.events).toContainEqual({ type: 'barrierPlaced', edge: 'E:D4' });
    // rules v0.2 §4.3：設置の後は 2 回目の行動に進む。
    expect(s1.pending?.kind).toBe('playCard');
    expect(P(s1, 0).hand).toHaveLength(5);
    const s2 = finish(s1);
    expect(s2.turn).toBe(1);
    expect(P(s2, 0).hand).toHaveLength(6);
  });

  test('§5.5(b) 置かれている通せん棒を 1 本取り除く（誰が置いたものでもよい）', () => {
    const { mid } = withBarrierCard(['S:D2', 'E:B5']);
    const s1 = applyMove(mid, 'barrier:remove:S:D2');
    expect(s1.barriers).toEqual(['E:B5']);
    expect(s1.events).toContainEqual({ type: 'barrierRemoved', edge: 'S:D2' });
    expect(finish(s1).turn).toBe(1);
  });

  test('§5.5 選択肢にない辺（連結条件に反する辺・盤外の ID）を選ぶと例外を投げる', () => {
    const { mid } = withBarrierCard(['E:A1']);
    expect(() => applyMove(mid, 'barrier:place:S:A1')).toThrow();
    expect(() => applyMove(mid, 'barrier:place:E:F1' as OptionId)).toThrow();
    expect(() => applyMove(mid, 'barrier:remove:E:C3')).toThrow();
  });

  test('§5.6 設置した通せん棒はプレイヤー駒の移動を妨げる', () => {
    const { mid } = withBarrierCard([]);
    const s1 = finish(applyMove(mid, 'barrier:place:E:E6'));
    // 席 2（F6、向き西）が「前」で西へ進もうとしても E6 へは入れない。
    const ids = cardIds();
    const card = ids.human('front');
    const s2in = structuredClone(s1);
    s2in.players[1]!.hand[0] = card;
    s2in.pending = { kind: 'playCard', player: 1, options: s2in.players[1]!.hand.map((id) => `play:${id}` as const) };
    const s2 = applyMove(s2in, play(card));
    expect(P(s2, 1).pos).toBe('F6');
    expect(P(s2, 1).facing).toBe('W');
  });
});

describe('canPlaceBarrier・placeableEdges（design §4.5、rules v0.2 §5.5）', () => {
  test('§5.5 placeableEdges は連結条件を満たす空き辺を昇順に返す', () => {
    const s = arrange({ barriers: ['E:A1'] });
    const edges = placeableEdges(s);
    expect(edges).toEqual(EDGE_IDS.filter((e) => e !== 'E:A1' && e !== 'S:A1'));
    expect(edges).toEqual([...edges].sort());
  });

  test('§5.5 canPlaceBarrier は空き辺で連結が保たれるときだけ真になる', () => {
    const s = arrange({ barriers: ['E:A1'] });
    expect(canPlaceBarrier(s, 'S:B1')).toBe(true);
    expect(canPlaceBarrier(s, 'S:A1')).toBe(false); // 連結条件に反する
    expect(canPlaceBarrier(s, 'E:A1')).toBe(false); // 既に置かれている
    expect(canPlaceBarrier(s, 'E:F1' as EdgeId)).toBe(false); // 盤外（外周の壁）
  });
});
