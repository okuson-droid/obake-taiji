// rules v0.1 §3（ゲームの準備）、§2.6（スタート地点の割り当て）、design.md §5.1・§6.2（準備の乱数の消費順）
import { describe, expect, test } from 'vitest';
import { START_ASSIGNMENT, START_FACING } from '../src/data/board.ts';
import { GHOST_CARDS, GHOST_CARD_BY_ID, MOVE_CARDS } from '../src/data/cards.ts';
import { createGame, getOptions } from '../src/game/engine.ts';
import { rollDie, seedToState, shuffle } from '../src/game/rng.ts';
import type { GameConfig } from '../src/game/types.ts';
import { P } from './helpers.ts';

const counts: GameConfig['players'][] = [2, 3, 4];

describe('準備（rules v0.1 §3）', () => {
  for (const n of counts) {
    test(`§3.2 ${n} 人：駒は自分のスタート地点に開始時の向きで置かれる（§2.5・§2.6）`, () => {
      const s = createGame({ players: n }, 1);
      expect(s.players).toHaveLength(n);
      s.players.forEach((p, i) => {
        const start = START_ASSIGNMENT[n][i];
        expect(p.seat).toBe(i);
        expect(p.start).toBe(start);
        expect(p.pos).toBe(start);
        expect(p.facing).toBe(START_FACING[start as 'A1']);
        expect(p.held).toEqual({ normal: 0, golden: 0 });
      });
    });

    test(`§3.4 ${n} 人：各プレイヤーに 4 枚ずつ配られ、山札は 180−4×${n} 枚になる`, () => {
      const s = createGame({ players: n }, 2);
      for (const p of s.players) expect(p.hand).toHaveLength(4);
      expect(s.moveDeck).toHaveLength(180 - 4 * n);
      expect(s.moveDiscard).toEqual([]);
      const all = [...s.moveDeck, ...s.players.flatMap((p) => p.hand)];
      expect([...all].sort()).toEqual(MOVE_CARDS.map((c) => c.id).sort());
    });
  }

  test('§3.3 怨霊コマは C3 に置かれる', () => {
    expect(createGame({ players: 2 }, 3).wraith).toBe('C3');
  });

  test('§3.5・§3.6 お化けカードが 3 枚めくられて捨て札に置かれ、山札は 27 枚になる', () => {
    const s = createGame({ players: 3 }, 4);
    expect(s.ghostDiscard).toHaveLength(3);
    expect(s.ghostDeck).toHaveLength(27);
    expect([...s.ghostDeck, ...s.ghostDiscard].sort()).toEqual(GHOST_CARDS.map((c) => c.id).sort());
  });

  test('§3.6・§8.3 配置したチップの数と種類は、めくった 3 枚の合計と一致する', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame({ players: 2 }, seed);
      const cards = s.ghostDiscard.map((id) => GHOST_CARD_BY_ID[id]!);
      const normal = cards.reduce((a, c) => a + c.normal, 0);
      const golden = cards.reduce((a, c) => a + c.golden, 0);
      expect(s.chips.filter((c) => c.kind === 'normal')).toHaveLength(normal);
      expect(s.chips.filter((c) => c.kind === 'golden')).toHaveLength(golden);
      expect(s.chips.map((c) => c.id)).toEqual(s.chips.map((_, i) => `c${i + 1}`));
      expect(s.nextChipId).toBe(s.chips.length + 1);
    }
  });

  test('§3.7 席 1 の手番から始まり、手札の順に playCard の選択肢が並ぶ（design §6.1）', () => {
    // 準備直後に §7.5 の条件が成り立つシードを避ける。
    const s = createGame({ players: 4 }, 5);
    expect(s.turn).toBe(0);
    expect(s.turnNo).toBe(1);
    expect(s.pending).toEqual({ kind: 'playCard', player: 0, options: P(s, 0).hand.map((id) => `play:${id}`) });
    expect(getOptions(s)).toEqual(P(s, 0).hand.map((id) => `play:${id}`));
    expect(s.result).toBeNull();
    expect(s.barriers).toEqual([]);
    expect(s.removedChips).toEqual({ normal: 0, golden: 0 });
    expect(s.effectQueue).toEqual([]);
    expect(s.rulesVersion).toBe('0.1');
    expect(s.seed).toBe(5);
  });

  test('design §6.2 準備の乱数の消費順：移動カード→お化けカード→配牌（消費なし）→配置のダイス（列・行）', () => {
    for (const n of counts) {
      const seed = 20261115 + n;
      const s = createGame({ players: n }, seed);
      let rng = seedToState(seed);
      const [moveDeck, r1] = shuffle(MOVE_CARDS.map((c) => c.id), rng);
      const [ghostDeck, r2] = shuffle(GHOST_CARDS.map((c) => c.id), r1);
      rng = r2;
      // 4 巡、席 1 から順に 1 枚ずつ配る。
      s.players.forEach((p, i) => {
        expect(p.hand).toEqual([0, 1, 2, 3].map((round) => moveDeck[round * n + i]));
      });
      expect(s.moveDeck).toEqual(moveDeck.slice(4 * n));
      // 先頭の 3 枚をめくり、めくった順・カードの中では匹数分を続けて配置する。
      expect(s.ghostDiscard).toEqual(ghostDeck.slice(0, 3));
      expect(s.ghostDeck).toEqual(ghostDeck.slice(3));
      const expected: { kind: string; cell: string }[] = [];
      for (const id of ghostDeck.slice(0, 3)) {
        const card = GHOST_CARD_BY_ID[id]!;
        const kinds = [...Array(card.normal).fill('normal'), ...Array(card.golden).fill('golden')];
        for (const kind of kinds) {
          const [c, a] = rollDie(rng);
          const [r, b] = rollDie(a);
          rng = b;
          expected.push({ kind, cell: `${'ABCDEF'[c - 1]}${r}` });
        }
      }
      expect(s.chips.map((c) => ({ kind: c.kind, cell: c.cell }))).toEqual(expected);
      expect(s.rng).toBe(rng);
    }
  });

  test('§3 createGame の events に準備中の出来事が入る', () => {
    const s = createGame({ players: 2 }, 6);
    const types = s.events.map((e) => e.type);
    expect(types[0]).toBe('ghostCardsRevealed');
    expect(types.filter((t) => t === 'ghostPlaced')).toHaveLength(s.chips.length);
    expect(s.events.at(-1)).toEqual({ type: 'turnStarted', seat: 0, turnNo: 1 });
  });

  test('§3 同じシードで同じ局面、異なるシードで異なる局面になる', () => {
    expect(JSON.stringify(createGame({ players: 3 }, 77))).toBe(JSON.stringify(createGame({ players: 3 }, 77)));
    expect(JSON.stringify(createGame({ players: 3 }, 77))).not.toBe(JSON.stringify(createGame({ players: 3 }, 78)));
  });

  test('design §3.3 GameState は JSON で往復しても変わらない', () => {
    const s = createGame({ players: 4 }, 8);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
