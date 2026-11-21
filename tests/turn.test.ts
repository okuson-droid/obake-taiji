// rules v0.2 §4（手番の進行）。対象を選ぶカード（§5.4・§5.5）を使った手番の流れを含む。
// 1 手番に 2 回の行動を行う形そのものの検査は tests/turn-v02.test.ts にある。
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { shuffle } from '../src/game/rng.ts';
import type { GameEvent, OptionId } from '../src/game/types.ts';
import { P, arrange, cardIds, finish, play, playStill, playTurn } from './helpers.ts';

describe('手番の順（rules v0.2 §4.1・§4.8）', () => {
  test('§4.1 席番号の順に回り、最後の席の次は席 1 に戻る', () => {
    const ids = cardIds();
    // 1 手番に通せん棒を 2 回使うため、各席に 2〜4 枚ずつ持たせる。
    const b = Array.from({ length: 8 }, () => ids.barrier());
    let s = arrange({
      players: 3,
      chips: [{ cell: 'D4' }],
      seats: {
        0: { hand: [b[0]!, b[1]!, b[2]!, b[3]!] },
        1: { hand: [b[4]!, b[5]!] },
        2: { hand: [b[6]!, b[7]!] },
      },
    });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(s.turn);
      expect(s.pending?.player).toBe(s.turn);
      s = playStill(s, P(s, s.turn).hand.find((id) => b.includes(id))!);
    }
    expect(seen).toEqual([0, 1, 2, 0]);
  });

  test('§4.8 手番が替わるごとに turnNo が 1 増え、turnStarted が記録される', () => {
    const ids = cardIds();
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [ids.human('N')] } } });
    const s1 = playTurn(s0, P(s0, 0).hand[0]!);
    expect(s1.turnNo).toBe(s0.turnNo + 1);
    expect(s1.turn).toBe(1);
    expect(s1.events.at(-1)).toEqual({ type: 'turnStarted', seat: 1, turnNo: s0.turnNo + 1 });
  });
});

describe('カードの使用（rules v0.2 §4.3）', () => {
  test('§4.3 選択肢は手札のカードごとに 1 つで、手札順に並ぶ（design §6.1）', () => {
    const ids = cardIds();
    const hand = [ids.human('front'), ids.human('front'), ids.ghost('N'), ids.barrier(), ids.human('E'), ids.ghost('S')];
    const s = arrange({ seats: { 0: { hand } } });
    expect(getOptions(s)).toEqual(hand.map((id) => `play:${id}`));
  });

  test('§4.3 使ったカードは公開されて捨て札に置かれる', () => {
    const ids = cardIds();
    const card = ids.human('S');
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.moveDiscard.at(-1)).toBe(card);
    expect(s1.events[0]).toEqual({ type: 'cardPlayed', seat: 0, card });
    expect(P(s1, 0).hand).not.toContain(card);
  });

  test('§4.3 手札にないカードや他の種類の選択肢 ID には例外を投げる', () => {
    const s = arrange({});
    const notInHand = s.moveDeck[0]!;
    expect(() => applyMove(s, play(notInHand))).toThrow();
    expect(() => applyMove(s, 'overlap:continue')).toThrow();
    expect(() => applyMove(s, 'lose:normal')).toThrow();
    expect(() => applyMove(s, 'ghost:wraith')).toThrow();
    expect(() => applyMove(s, 'nonsense' as OptionId)).toThrow();
  });

  test('design §4.1 applyMove は引数の state を変更しない', () => {
    const s = createGame({ players: 2 }, 9);
    const before = JSON.stringify(s);
    applyMove(s, getOptions(s)[0]!);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('カードを引く（rules v0.2 §4.7）', () => {
  test('§4.7 手番の終わりに山札の上から 1 枚ずつ引き、手札が 6 枚に戻る', () => {
    const ids = cardIds();
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [ids.human('E')] } } });
    const s1 = finish(applyMove(s0, getOptions(s0)[0]!));
    // 2 回目の行動（finish）のために手札と山札の 1 枚を入れ替えることがあるため、引いたカードは出来事で確かめる。
    const drawn = s1.events.flatMap((e) => (e.type === 'cardDrawn' && e.card !== null ? [e.card] : []));
    expect(drawn).toHaveLength(2);
    expect(P(s1, 0).hand).toHaveLength(6);
    expect(P(s1, 0).hand.slice(-2)).toEqual(drawn);
  });

  test('§4.7 山札が尽きていれば、捨て札をシャッフルして新しい山札としてから引く', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const discard = [ids.human('W'), ids.human('N'), ids.barrier()];
    const second = ids.human('W');
    const s0 = arrange({
      chips: [{ cell: 'D4' }],
      seats: { 0: { hand: [card, second] } },
      moveDeck: [],
      moveDiscard: discard,
    });
    const s1 = applyMove(applyMove(s0, play(card)), play(second));
    // 使った 2 枚は引く前に捨て札へ置かれているため、新しい山札に含まれる。
    const [expected, rng] = shuffle([...discard, card, second], s0.rng);
    expect(s1.events).toContainEqual({ type: 'moveDeckReshuffled' });
    expect(P(s1, 0).hand.slice(-2)).toEqual(expected.slice(0, 2));
    expect(s1.moveDeck).toEqual(expected.slice(2));
    expect(s1.moveDiscard).toEqual([]);
    expect(s1.rng).toBe(rng);
  });
});

describe('お化けの補充（rules v0.2 §4.6）', () => {
  test('§4.6 手番の終わりにボード上のチップが 0 枚なら配置を行う', () => {
    const ids = cardIds();
    // 席 1 が D4 の 1 枚を取り、ボードが空になる。
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { pos: 'D3', facing: 'S', hand: [ids.human('front')] } } });
    const s1 = finish(applyMove(s0, getOptions(s0)[0]!));
    expect(s1.events.map((e) => e.type)).toContain('ghostCardsRevealed');
    expect(s1.ghostDeck).toHaveLength(s0.ghostDeck.length - 3);
    expect(s1.chips.length).toBeGreaterThan(0);
  });

  test('§4.6 チップが残っていれば配置しない', () => {
    const ids = cardIds();
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [ids.human('front')] } } });
    const s1 = finish(applyMove(s0, getOptions(s0)[0]!));
    expect(s1.events.map((e) => e.type)).not.toContain('ghostCardsRevealed');
    expect(s1.ghostDeck).toEqual(s0.ghostDeck);
  });

  test('§4.3〜§4.7 順番：1 回目の効果 → 2 回目の効果 → 獲得判定 → 補充 → 引く → 次の手番', () => {
    const ids = cardIds();
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { pos: 'D3', facing: 'S', hand: [ids.human('front')] } } });
    const types = finish(applyMove(s0, getOptions(s0)[0]!)).events.map((e) => e.type);
    const order: GameEvent['type'][] = ['cardPlayed', 'humanMoved', 'barrierPlaced', 'acquired', 'ghostCardsRevealed', 'cardDrawn', 'turnStarted'];
    expect(order.map((t) => types.indexOf(t))).toEqual([...order.map((t) => types.indexOf(t))].sort((a, b) => a - b));
    for (const t of order) expect(types).toContain(t);
  });
});

describe('対象を選ぶカード（rules v0.2 §4.3・§4.4、§5.4・§5.5）', () => {
  test('§4.4・§5.4 お化け移動カードを使うと ghostTarget の選択待ちになり、まだカードを引かない', () => {
    const ids = cardIds();
    const card = ids.ghost('E');
    const s0 = arrange({ chips: [{ cell: 'D4' }, { cell: 'B2' }], seats: { 0: { hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.pending).toEqual({ kind: 'ghostTarget', player: 0, card, options: ['ghost:c1', 'ghost:c2', 'ghost:wraith'] });
    expect(s1.moveDiscard.at(-1)).toBe(card);
    expect(P(s1, 0).hand).toHaveLength(5);
    expect(s1.turn).toBe(0);
    expect(s1.rng).toBe(s0.rng);
    expect(s1.events).toEqual([{ type: 'cardPlayed', seat: 0, card }]);
  });

  test('§4.4・§5.5 通せん棒カードを使うと barrierTarget の選択待ちになり、まだカードを引かない', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.pending?.kind).toBe('barrierTarget');
    expect(s1.pending?.player).toBe(0);
    expect(P(s1, 0).hand).toHaveLength(5);
    expect(s1.turn).toBe(0);
  });

  test('§4.4〜§4.8 対象を選ぶと 2 回目に進み、2 回目の後に獲得判定・補充・引く・次の手番へ進む', () => {
    const ids = cardIds();
    const card = ids.ghost('N');
    const s0 = arrange({ chips: [{ cell: 'F6' }, { cell: 'B2' }], seats: { 0: { hand: [card] } } });
    const mid = applyMove(applyMove(s0, play(card)), 'ghost:c2');
    expect(mid.pending?.kind).toBe('playCard');
    expect(mid.turn).toBe(0);
    const s1 = finish(mid);
    // c2 は B2 から B1 へ動く。席 2 は F6 のチップを手番の終わりの判定で取る（R-09）。
    expect(s1.chips).toEqual([{ id: 'c2', kind: 'normal', cell: 'B1' }]);
    expect(P(s1, 1).held.normal).toBe(1);
    expect(P(s1, 0).hand).toHaveLength(6);
    expect(s1.turn).toBe(1);
    expect(s1.pending?.kind).toBe('playCard');
    const types = s1.events.map((e) => e.type);
    expect(types.indexOf('ghostMoved')).toBeLessThan(types.indexOf('acquired'));
    expect(types.indexOf('acquired')).toBeLessThan(types.indexOf('cardDrawn'));
  });
});
