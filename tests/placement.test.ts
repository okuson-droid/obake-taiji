// rules v0.1 §8（お化けの配置）、§8.2・§9.2（お化けカードの山札が尽きたときの終了と勝敗）
import { describe, expect, test } from 'vitest';
import { GHOST_CARD_BY_ID } from '../src/data/cards.ts';
import { applyMove, createGame, getOptions, isGameOver } from '../src/game/engine.ts';
import { rollDie } from '../src/game/rng.ts';
import type { GameEvent, GameState } from '../src/game/types.ts';
import { P, arrange, cardIds, play, playStill } from './helpers.ts';

/** 席 1 が D3 から南へ進んで D4 の最後の 1 枚を取り、配置が起きる局面 */
const triggerPlacement = (extra: Parameters<typeof arrange>[0] = {}) => {
  const ids = cardIds();
  const card = ids.human('S');
  const s0 = arrange({ chips: [{ cell: 'D4' }], ...extra, seats: { ...extra.seats, 0: { pos: 'D3', hand: [card], ...extra.seats?.[0] } } });
  return { s0, s1: applyMove(s0, play(card)) };
};

const placedEvents = (s: GameState) =>
  s.events.filter((e): e is Extract<GameEvent, { type: 'ghostPlaced' }> => e.type === 'ghostPlaced');

describe('お化けの配置（rules v0.1 §8.1・§8.3）', () => {
  test('§8.1 山札から 3 枚めくり、捨て札に置く', () => {
    const { s0, s1 } = triggerPlacement();
    expect(s1.ghostDiscard).toEqual([...s0.ghostDiscard, ...s0.ghostDeck.slice(0, 3)]);
    expect(s1.ghostDeck).toEqual(s0.ghostDeck.slice(3));
    expect(s1.events).toContainEqual({ type: 'ghostCardsRevealed', cards: s0.ghostDeck.slice(0, 3) });
  });

  test('§8.3 1 個目の出目で列（1＝A〜6＝F）、2 個目の出目で行を決める', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const e of placedEvents(createGame({ players: 2 }, seed))) {
        expect(e.cell).toBe(`${'ABCDEF'[e.dice[0] - 1]}${e.dice[1]}`);
      }
    }
  });

  test('§8.3 めくった順・カードの中では匹数分を続けて配置し、お化け 1 体ごとに列・行の順でダイスを振る（design §6.2）', () => {
    const { s0, s1 } = triggerPlacement({ ghostDeck: ['G27', 'G20', 'G10', 'G00', 'G01', 'G02'] });
    // ゴールデン 1 → 3 匹 → 2 匹の順。
    const placed = placedEvents(s1);
    expect(placed.map((e) => e.kind)).toEqual(['golden', 'normal', 'normal', 'normal', 'normal', 'normal']);
    let rng = s0.rng;
    for (const e of placed) {
      const [c, a] = rollDie(rng);
      const [r, b] = rollDie(a);
      rng = b;
      expect(e.dice).toEqual([c, r]);
    }
    // 配置の後、カードを引く前には乱数を消費しない（山札が残っているため）。
    expect(s1.rng).toBe(rng);
    expect(placed.map((e) => e.chip)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  });

  test('§8.3 ゴールデンお化けのカードはゴールデンのチップ 1 枚を配置する', () => {
    const { s1 } = triggerPlacement({ ghostDeck: ['G27', 'G28', 'G29', 'G00'] });
    expect(s1.chips.map((c) => c.kind)).toEqual(['golden', 'golden', 'golden']);
  });

  test('§8.3 4. 同じ部屋が複数回指定されたら重ねて置く', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = createGame({ players: 2 }, seed);
      const cells = s.chips.map((c) => c.cell);
      if (new Set(cells).size < cells.length) {
        found = true;
        const dup = cells.find((c, i) => cells.indexOf(c) !== i)!;
        expect(s.chips.filter((c) => c.cell === dup).length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(found).toBe(true);
  });

  test('§8.3 4. 怨霊コマやプレイヤー駒がいる部屋にもそのまま置く（R-09）', () => {
    const cells = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      for (const c of createGame({ players: 4 }, seed).chips) cells.add(c.cell);
    }
    for (const cell of ['C3', 'A1', 'F1', 'F6', 'A6']) expect(cells).toContain(cell);
  });

  test('§8.5 配置は準備を含めて最大 9 回である', () => {
    const s = createGame({ players: 2 }, 1);
    expect(s.ghostDeck).toHaveLength(27); // 準備で 1 回。残り 27 枚では 8 回配置でき、9 回目のめくりで尽きる。
  });
});

describe('お化けカードの山札が尽きたとき（rules v0.1 §8.2・§9.2）', () => {
  test('§8.2 めくった結果山札が 0 枚になったら配置せず、その時点でゲームを終了する（R-12）', () => {
    const { s0, s1 } = triggerPlacement({ ghostDeck: ['G20', 'G21', 'G22'] });
    expect(s1.ghostDeck).toEqual([]);
    expect(s1.ghostDiscard.slice(-3)).toEqual(['G20', 'G21', 'G22']);
    expect(placedEvents(s1)).toEqual([]);
    expect(s1.chips).toEqual([]);
    expect(s1.rng).toBe(s0.rng);
    expect(isGameOver(s1)).toBe(true);
    expect(getOptions(s1)).toEqual([]);
    // §4.9：カードを引く・次の手番を行わない。
    expect(s1.events.map((e) => e.type)).not.toContain('cardDrawn');
    expect(s1.events.at(-1)?.type).toBe('gameEnded');
  });

  test('§9.2 最高点のプレイヤーの勝利とする', () => {
    const { s1 } = triggerPlacement({
      players: 3,
      ghostDeck: ['G00', 'G01', 'G02'],
      seats: { 1: { held: { normal: 2, golden: 1 } }, 2: { held: { normal: 4 } } },
    });
    // 席 1 は D4 で 1 点を取る。
    expect(s1.result).toEqual({ reason: 'ghostDeck', winners: [1], scores: [1, 5, 4] });
  });

  test('§9.2 最高点が複数なら全員の引き分けとする（R-13）', () => {
    const { s1 } = triggerPlacement({
      players: 4,
      ghostDeck: ['G00', 'G01', 'G02'],
      seats: { 0: { held: { normal: 2 } }, 1: { held: { golden: 1 } }, 3: { held: { normal: 3 } } },
    });
    expect(s1.result).toEqual({ reason: 'ghostDeck', winners: [0, 1, 3], scores: [3, 3, 0, 3] });
  });

  test('§9.2 全員 0 点なら全員の引き分けとする', () => {
    const ids = cardIds();
    const card = ids.barrier();
    // 全員がチップを取らないまま、手番の終わりにボードが空で山札が尽きる。
    const s0 = arrange({ chips: [], ghostDeck: ['G00', 'G01', 'G02'], seats: { 0: { hand: [card] } } });
    const s1 = playStill(s0, card);
    expect(s1.result).toEqual({ reason: 'ghostDeck', winners: [0, 1], scores: [0, 0] });
  });

  test('§8.3 お化けカードの記載どおりの匹数が置かれる（全 30 枚）', () => {
    for (const id of Object.keys(GHOST_CARD_BY_ID) as (keyof typeof GHOST_CARD_BY_ID)[]) {
      const card = GHOST_CARD_BY_ID[id]!;
      // 先頭に対象のカードを置き、山札が尽きないよう別のカードを 3 枚続ける。
      const rest = (['G03', 'G04', 'G05', 'G06'] as const).filter((x) => x !== id).slice(0, 3);
      const { s1 } = triggerPlacement({ ghostDeck: [id, ...rest] });
      const placed = placedEvents(s1);
      const first = placed.slice(0, card.normal + card.golden);
      expect(first.filter((e) => e.kind === 'normal')).toHaveLength(card.normal);
      expect(first.filter((e) => e.kind === 'golden')).toHaveLength(card.golden);
      expect(P(s1, 0).held.normal).toBe(1);
    }
  });
});
