// design.md §4.3（targetOf）。選択肢 ID（design §6.1）と画面上の対象の対応を確かめる。
// rules v0.2 §4.3（手札）、§5.4（チップ・怨霊）、§5.5（辺）、§7.2（失うチップ）、§7.5（2 択）に対応する。
import { describe, expect, test } from 'vitest';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { optionOfTarget, targetOf } from '../src/game/targets.ts';
import type { OptionId } from '../src/game/types.ts';
import { P, arrange, cardIds, play, playStill } from './helpers.ts';

describe('targetOf（design §4.3）', () => {
  test('§4.3 play:<カード ID> は手札のカード', () => {
    const s = arrange({});
    const card = P(s, 0).hand[0]!;
    expect(targetOf(s, `play:${card}`)).toEqual({ type: 'handCard', card });
  });

  test('§5.4 ghost:<チップ ID> はチップ、ghost:wraith は怨霊', () => {
    const ids = cardIds();
    const card = ids.ghost('N');
    const s = applyMove(arrange({ chips: [{ cell: 'D4' }, { cell: 'B2' }], seats: { 0: { hand: [card] } } }), play(card));
    expect(targetOf(s, 'ghost:c2')).toEqual({ type: 'chip', chip: 'c2' });
    expect(targetOf(s, 'ghost:wraith')).toEqual({ type: 'wraith' });
  });

  test('§5.5 barrier:place・barrier:remove は辺と操作の種類', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s = applyMove(arrange({ barriers: ['S:D2'], seats: { 0: { hand: [card] } } }), play(card));
    expect(targetOf(s, 'barrier:place:E:B3')).toEqual({ type: 'edge', edge: 'E:B3', mode: 'place' });
    expect(targetOf(s, 'barrier:remove:S:D2')).toEqual({ type: 'edge', edge: 'S:D2', mode: 'remove' });
  });

  test('§7.2 lose:<種類> は獲得済みチップ、§7.5 overlap:<選択> はボタン', () => {
    const s = arrange({});
    expect(targetOf(s, 'lose:normal')).toEqual({ type: 'heldChip', kind: 'normal' });
    expect(targetOf(s, 'lose:golden')).toEqual({ type: 'heldChip', kind: 'golden' });
    expect(targetOf(s, 'overlap:continue')).toEqual({ type: 'button', action: 'overlapContinue' });
    expect(targetOf(s, 'overlap:purge')).toEqual({ type: 'button', action: 'overlapPurge' });
  });

  test('対象が局面に存在しなければ例外を投げる（手札にないカード、盤上にないチップ、盤外の辺）', () => {
    const s = arrange({ chips: [{ cell: 'D4' }] });
    expect(() => targetOf(s, `play:${s.moveDeck[0]!}`)).toThrow();
    expect(() => targetOf(s, 'ghost:c9')).toThrow();
    expect(() => targetOf(s, 'barrier:place:E:F1' as OptionId)).toThrow();
    expect(() => targetOf(s, 'unknown' as OptionId)).toThrow();
  });

  test('optionOfTarget は targetOf の逆である（選択待ちの全選択肢で往復する）', () => {
    const ids = cardIds();
    const g = ids.ghost('E');
    const b = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'D4' }, { cell: 'B2' }], barriers: ['E:C3'], seats: { 0: { hand: [g, b] } } });
    const states = [s0, applyMove(s0, play(g)), applyMove(s0, play(b))];
    for (const s of states) {
      for (const o of getOptions(s)) expect(optionOfTarget(targetOf(s, o))).toBe(o);
    }
    expect(optionOfTarget({ type: 'heldChip', kind: 'golden' })).toBe('lose:golden');
    expect(optionOfTarget({ type: 'button', action: 'overlapPurge' })).toBe('overlap:purge');
  });

  test('§7.5 重なりの選択待ちの選択肢はボタンになる', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s = playStill(arrange({ chips: [{ cell: 'C3' }], seats: { 0: { hand: [card] } } }), card);
    expect(getOptions(s).map((o) => targetOf(s, o).type)).toEqual(['button', 'button']);
  });
});
