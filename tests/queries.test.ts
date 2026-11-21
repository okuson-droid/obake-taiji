// design.md §4.5（UI 向けの派生値）。rules v0.2 §5.1・§5.3・§6.4 に対応する。
import { describe, expect, test } from 'vitest';
import { createGame } from '../src/game/engine.ts';
import { chipsAt, deckCounts, isWraithRoom, previewHumanMove, scoreOf } from '../src/game/queries.ts';
import { P, arrange, cardIds, playTurn } from './helpers.ts';

describe('queries（design §4.5）', () => {
  test('§6.4 scoreOf は通常 1 点・ゴールデン 3 点で数える', () => {
    const s = arrange({ seats: { 1: { held: { normal: 4, golden: 2 } } } });
    expect(scoreOf(s, 0)).toBe(0);
    expect(scoreOf(s, 1)).toBe(10);
  });

  test('§2.7 chipsAt は部屋のチップを配置順に返す', () => {
    const s = arrange({ chips: [{ cell: 'B2' }, { cell: 'E5' }, { cell: 'B2', kind: 'golden' }] });
    expect(chipsAt(s, 'B2').map((c) => [c.id, c.kind])).toEqual([
      ['c1', 'normal'],
      ['c3', 'golden'],
    ]);
    expect(chipsAt(s, 'A1')).toEqual([]);
  });

  test('§2.8 isWraithRoom は怨霊コマのいる部屋だけ真になる', () => {
    const s = createGame({ players: 2 }, 1);
    expect(isWraithRoom(s, 'C3')).toBe(true);
    expect(isWraithRoom(s, 'C4')).toBe(false);
  });

  test('§5.1 previewHumanMove は applyMove の結果と一致する', () => {
    const ids = cardIds();
    for (const kind of ['front', 'back', 'right', 'left', 'N', 'E', 'S', 'W'] as const) {
      for (const [pos, facing] of [['C4', 'E'], ['A1', 'N'], ['F3', 'S'], ['B2', 'W']] as const) {
        const card = ids.human(kind);
        const s0 = arrange({ wraith: 'E5', chips: [{ cell: 'F1' }], barriers: ['S:B2'], seats: { 0: { pos, facing, hand: [card] } } });
        const preview = previewHumanMove(s0, 0, card);
        const s1 = playTurn(s0, card);
        expect(preview).toEqual({ to: P(s1, 0).pos, facing: P(s1, 0).facing, blocked: P(s1, 0).pos === pos, contact: false });
      }
    }
  });

  test('§5.1 手順 3 previewHumanMove は外周の壁・通せん棒で blocked になる', () => {
    const ids = cardIds();
    const n = ids.human('N');
    const e = ids.human('E');
    const s = arrange({ barriers: ['E:A1'], seats: { 0: { hand: [n, e] } } });
    expect(previewHumanMove(s, 0, n)).toEqual({ to: 'A1', facing: 'N', blocked: true, contact: false });
    expect(previewHumanMove(s, 0, e)).toEqual({ to: 'A1', facing: 'E', blocked: true, contact: false });
  });

  test('§5.3 previewHumanMove は怨霊の部屋に入るとき contact を真にする', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s = arrange({ seats: { 0: { pos: 'C4', hand: [card] } } });
    expect(previewHumanMove(s, 0, card)).toEqual({ to: 'C3', facing: 'N', blocked: false, contact: true });
  });

  test('previewHumanMove は人間移動カード以外に例外を投げる', () => {
    const ids = cardIds();
    const s = arrange({});
    expect(() => previewHumanMove(s, 0, ids.ghost('N'))).toThrow();
    expect(() => previewHumanMove(s, 0, ids.barrier())).toThrow();
  });

  test('§3.4・§3.5 deckCounts は山札と捨て札の残り枚数を返す', () => {
    const s = createGame({ players: 3 }, 1);
    expect(deckCounts(s)).toEqual({ move: 180 - 6 * 3, moveDiscard: 0, ghost: 27 });
  });
});
