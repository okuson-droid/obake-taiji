// design.md §4.4（explain）。選べない理由の表示文を確かめる。判定には使わない。
// rules v0.2 §4.1（手番）、§4.3（手札）、§5.5(a)（連結条件）、§2.3（1 辺 1 本）、§9（終了）に対応する。
import { describe, expect, test } from 'vitest';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { explain } from '../src/game/explain.ts';
import { targetOf } from '../src/game/targets.ts';
import { P, arrange, cardIds, play, playTurn } from './helpers.ts';

describe('explain（design §4.4）', () => {
  test('選べる要素には null を返す（すべての合法手）', () => {
    const ids = cardIds();
    const g = ids.ghost('E');
    const b = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'D4' }], barriers: ['E:C3'], seats: { 0: { hand: [g, b] } } });
    for (const s of [s0, playTurn(s0, g), playTurn(s0, b)]) {
      for (const o of getOptions(s)) expect(explain(s, 0, targetOf(s, o))).toBeNull();
    }
  });

  test('§4.1 手番外のプレイヤーには「席 N の手番です」を返す', () => {
    const s = arrange({});
    const card = P(s, 0).hand[0]!;
    expect(explain(s, 1, { type: 'handCard', card })).toBe('席 1 の手番です');
  });

  test('§4.3 手札にないカードを選べない', () => {
    const s = arrange({});
    expect(explain(s, 0, { type: 'handCard', card: s.moveDeck[0]! })).toBe('手札にないカードです');
  });

  test('§4.4 対象の選択中はカードを選べない', () => {
    const ids = cardIds();
    const g = ids.ghost('E');
    const s = applyMove(arrange({ seats: { 0: { hand: [g] } } }), play(g));
    expect(explain(s, 0, { type: 'handCard', card: P(s, 0).hand[0]! })).toBe('動かすお化けか怨霊を選んでください');
  });

  test('§5.5(a) 連結条件に反する辺には、設置できない理由を返す', () => {
    const ids = cardIds();
    const b = ids.barrier();
    const s = applyMove(arrange({ barriers: ['E:A1'], seats: { 0: { hand: [b] } } }), play(b));
    expect(explain(s, 0, { type: 'edge', edge: 'S:A1', mode: 'place' })).toBe(
      'ここに置くと行き来できない部屋ができるため設置できません',
    );
  });

  test('§2.3 通せん棒のある辺には設置できず、ない辺は撤去できない', () => {
    const ids = cardIds();
    const b = ids.barrier();
    const s = applyMove(arrange({ barriers: ['E:C3'], seats: { 0: { hand: [b] } } }), play(b));
    expect(explain(s, 0, { type: 'edge', edge: 'E:C3', mode: 'place' })).toBe('すでに通せん棒があります');
    expect(explain(s, 0, { type: 'edge', edge: 'E:D3', mode: 'remove' })).toBe('通せん棒が置かれていません');
  });

  test('§5.4 お化け移動カードを使っていなければ、チップ・怨霊は選べない', () => {
    const s = arrange({ chips: [{ cell: 'D4' }] });
    expect(explain(s, 0, { type: 'chip', chip: 'c1' })).toBe('お化け移動カードを使うと選べます');
    expect(explain(s, 0, { type: 'wraith' })).toBe('お化け移動カードを使うと選べます');
  });

  test('§9 終了後は「ゲームは終了しました」を返す', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'D4' }, { cell: 'A5' }], seats: { 0: { pos: 'C4', hand: [card], held: { normal: 9 } } } });
    const s1 = playTurn(s0, card);
    expect(explain(s1, 0, { type: 'handCard', card: P(s1, 0).hand[0]! })).toBe('ゲームは終了しました');
  });
});
