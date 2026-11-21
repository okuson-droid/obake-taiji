// rules v0.2 の手番の構造：手札 6 枚（§3.4・§4.7）、1 手番に 2 回の行動（§4.3・§4.4）、
// 手番の終わりの獲得判定・補充（§4.5〜§4.7）、接触による 2 回目の打ち切り（§4.4・§7.4）。
import { describe, expect, test } from 'vitest';
import { MOVE_CARDS } from '../src/data/cards.ts';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { isCheckpoint, replay, undoLast } from '../src/game/history.ts';
import { shuffle } from '../src/game/rng.ts';
import { P, arrange, cardIds, play } from './helpers.ts';

describe('手札 6 枚（rules v0.2 §3.4）', () => {
  for (const n of [2, 3, 4] as const) {
    test(`§3.4 ${n} 人：席 1 から 1 枚ずつ 6 巡配り、山札は 180−6×${n} 枚`, () => {
      const s = createGame({ players: n }, 9);
      const [deck] = shuffle(MOVE_CARDS.map((c) => c.id), s.seed >>> 0);
      s.players.forEach((p, i) => expect(p.hand).toEqual([0, 1, 2, 3, 4, 5].map((r) => deck[r * n + i])));
      expect(s.moveDeck).toHaveLength(180 - 6 * n);
      expect(s.rulesVersion).toBe('0.2');
    });
  }
});

describe('1 手番に 2 回の行動（rules v0.2 §4.3・§4.4）', () => {
  test('§4.3 1 回目を使うと、同じ席が手札 5 枚で 2 回目を選ぶ。まだ引かず、手番も替わらない', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.turn).toBe(0);
    expect(s1.turnNo).toBe(s0.turnNo);
    expect(s1.actionsTaken).toBe(1);
    expect(P(s1, 0).hand).toHaveLength(5);
    expect(s1.pending).toEqual({ kind: 'playCard', player: 0, options: P(s1, 0).hand.map((id) => `play:${id}`) });
    expect(s1.events.map((e) => e.type)).toEqual(['cardPlayed', 'humanMoved']);
  });

  test('§4.3・§4.7 2 回目を使うと、2 枚引いて手札が 6 枚に戻り、次の席の手番になる', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('E'), ids.human('S')];
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { pos: 'B4', hand: [a, b] } } });
    const top = s0.moveDeck.slice(0, 2);
    const s2 = applyMove(applyMove(s0, play(a)), play(b));
    expect(P(s2, 0).pos).toBe('C5');
    expect(P(s2, 0).hand).toHaveLength(6);
    expect(P(s2, 0).hand.slice(-2)).toEqual(top);
    expect(s2.events.filter((e) => e.type === 'cardDrawn')).toHaveLength(2);
    expect(s2.turn).toBe(1);
    expect(s2.actionsTaken).toBe(0);
  });

  test('§4.3 同じ種類のカードを 2 枚続けて使える', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('E'), ids.human('E')];
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { pos: 'B4', hand: [a, b] } } });
    const s2 = applyMove(applyMove(s0, play(a)), play(b));
    expect(P(s2, 0).pos).toBe('D4');
  });

  test('§4.3 対象を選ぶカード（お化け移動）は、対象を選んでから 2 回目に進む', () => {
    const ids = cardIds();
    const [g, h] = [ids.ghost('N'), ids.human('S')];
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'B3', hand: [g, h] } } });
    const mid = applyMove(applyMove(s0, play(g)), 'ghost:c1');
    expect(mid.chips[0]?.cell).toBe('F2');
    expect(mid.pending?.kind).toBe('playCard');
    expect(mid.turn).toBe(0);
  });
});

describe('手番の終わりの獲得判定（rules v0.2 §4.5）', () => {
  test('§4.5 1 回目でお化けの部屋に入っても、2 回目で出れば獲得しない', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('E'), ids.human('E')];
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { pos: 'C4', hand: [a, b] } } });
    const s2 = applyMove(applyMove(s0, play(a)), play(b));
    expect(P(s2, 0).pos).toBe('E4');
    expect(P(s2, 0).held.normal).toBe(0);
    expect(s2.chips.map((c) => c.cell)).toEqual(['D4']);
  });

  test('§4.5 手番の終わりにお化けの部屋にいれば獲得する。判定は全員について行う', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('E'), ids.human('E')];
    const s0 = arrange({ chips: [{ cell: 'E4' }, { cell: 'F6' }, { cell: 'A2' }], seats: { 0: { pos: 'C4', hand: [a, b] } } });
    const mid = applyMove(s0, play(a));
    expect(mid.events.map((e) => e.type)).not.toContain('acquired');
    const s2 = applyMove(mid, play(b));
    expect(P(s2, 0).held.normal).toBe(1);
    expect(P(s2, 1).held.normal).toBe(1); // 席 2 は F6 にいる
  });
});

describe('接触による 2 回目の打ち切り（rules v0.2 §4.4・§7.4、R-21）', () => {
  test('§4.4 1 回目で手番プレイヤーが怨霊の部屋に入ると、2 回目を行わず手番が終わる（1 枚引いて 6 枚に戻す）', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(P(s1, 0).pos).toBe('A1');
    expect(s1.turn).toBe(1);
    expect(P(s1, 0).hand).toHaveLength(6);
    expect(s1.events.filter((e) => e.type === 'cardDrawn')).toHaveLength(1);
  });

  test('§4.4 1 回目で怨霊をほかの人の部屋に入れても（手番プレイヤーは触れていなくても）、2 回目を行わない', () => {
    const ids = cardIds();
    const g = ids.ghost('E');
    const s0 = arrange({ chips: [{ cell: 'F1' }, { cell: 'A3' }], seats: { 0: { pos: 'A3', hand: [g] }, 1: { pos: 'D3' } } });
    const s1 = applyMove(applyMove(s0, play(g)), 'ghost:wraith');
    expect(P(s1, 1).pos).toBe('F6');
    expect(s1.turn).toBe(1);
    // §7.4：接触した手番は、手番プレイヤーが A3 のお化けの部屋にいても獲得しない。
    expect(P(s1, 0).held.normal).toBe(0);
  });

  test('§7.4 2 回目で接触した場合も、その手番の獲得判定を行わない', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('W'), ids.human('N')];
    const s0 = arrange({ chips: [{ cell: 'F6' }, { cell: 'A2' }], seats: { 0: { pos: 'D4', hand: [a, b] } } });
    const s2 = applyMove(applyMove(s0, play(a)), play(b));
    expect(s2.events.map((e) => e.type)).toContain('contact');
    expect(P(s2, 1).held.normal).toBe(0); // 席 2 は F6 にいるが獲得しない
    expect(s2.turn).toBe(1);
  });

  test('§7.2 接触でペナルティの選択待ちになり、選ぶと手番の終わりへ進む', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'C4', hand: [card], held: { normal: 1, golden: 1 } } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.pending).toEqual({ kind: 'penaltyChip', player: 0, options: ['lose:normal', 'lose:golden'] });
    const s2 = applyMove(s1, 'lose:normal');
    expect(s2.turn).toBe(1);
    expect(P(s2, 0).hand).toHaveLength(6);
  });
});

describe('手札の補充（rules v0.2 §4.7）', () => {
  test('§4.7 引く途中で山札が尽きたら、捨て札を切り直してから続けて引く', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('E'), ids.human('S')];
    const last = ids.human('W');
    const discard = [ids.barrier(), ids.ghost('N'), ids.human('N')];
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { pos: 'B4', hand: [a, b] } }, moveDeck: [last], moveDiscard: discard });
    const s2 = applyMove(applyMove(s0, play(a)), play(b));
    const types = s2.events.map((e) => e.type);
    expect(types.indexOf('cardDrawn')).toBeLessThan(types.indexOf('moveDeckReshuffled'));
    expect(types.filter((t) => t === 'cardDrawn')).toHaveLength(2);
    expect(P(s2, 0).hand).toHaveLength(6);
    expect(P(s2, 0).hand.at(-2)).toBe(last);
  });
});

describe('重なりの選択は手番の始めだけ（rules v0.2 §7.5、R-23）', () => {
  test('§7.5 1 回目の後にお化けがすべて怨霊の部屋に集まっても、2 回目の前には選択待ちにならない', () => {
    const ids = cardIds();
    const [g, h] = [ids.ghost('W'), ids.human('S')];
    const s0 = arrange({ chips: [{ cell: 'D3' }], seats: { 0: { pos: 'B5', hand: [g, h] } } });
    const mid = applyMove(applyMove(s0, play(g)), 'ghost:c1');
    expect(mid.chips[0]?.cell).toBe('C3');
    expect(mid.pending?.kind).toBe('playCard');
  });
});

describe('1 回目の取り消し（decisions.md R-19 の実装上の扱い）', () => {
  test('1 回目の後はチェックポイントではなく、「選び直す」で 1 回目の前に戻れる', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(isCheckpoint(s0, s1)).toBe(false);
    const moves = undoLast(s0, [play(card)]);
    expect(replay(s0, moves!)).toEqual(s0);
  });

  test('2 回目を使うと（カードを引くため）チェックポイントになる', () => {
    const ids = cardIds();
    const [a, b] = [ids.human('E'), ids.human('S')];
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { pos: 'B4', hand: [a, b] } } });
    const s1 = applyMove(s0, play(a));
    expect(isCheckpoint(s1, applyMove(s1, play(b)))).toBe(true);
    expect(getOptions(s1)).toContain(play(b));
  });
});
