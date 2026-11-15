// design.md §4.2（replay・isCheckpoint・undoLast）と決定性。対応する rules の条項は各テストに書く。
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions, isGameOver } from '../src/game/engine.ts';
import { isCheckpoint, replay, undoLast } from '../src/game/history.ts';
import type { GameConfig, GameState, OptionId } from '../src/game/types.ts';
import { arrange, cardIds, play, playStill, randomPicker } from './helpers.ts';

/** 乱択で n 手進め、適用した選択肢 ID の列と各局面を返す。 */
const playRandom = (config: GameConfig, seed: number, n: number) => {
  const pick = randomPicker(seed * 7919);
  const states: GameState[] = [createGame(config, seed)];
  const moves: OptionId[] = [];
  for (let i = 0; i < n; i++) {
    const s = states.at(-1)!;
    if (isGameOver(s)) break;
    const option = pick(getOptions(s));
    moves.push(option);
    states.push(applyMove(s, option));
  }
  return { states, moves };
};

describe('決定性（rules v0.1 §3・§8.3、design §6.2）', () => {
  test('§3 同じシードの createGame に同じ選択肢 ID 列を適用すると、同じ GameState（JSON）になる', () => {
    for (const players of [2, 3, 4] as const) {
      const { states, moves } = playRandom({ players }, 31 + players, 300);
      const again = moves.reduce((s, m) => applyMove(s, m), createGame({ players }, 31 + players));
      expect(JSON.stringify(again)).toBe(JSON.stringify(states.at(-1)));
    }
  });
});

describe('replay（design §4.2）', () => {
  test('createGame からの replay は逐次適用と同じ局面になる', () => {
    const { states, moves } = playRandom({ players: 3 }, 5, 200);
    expect(JSON.stringify(replay(states[0]!, moves))).toBe(JSON.stringify(states.at(-1)));
  });

  test('design §7.3 の手順（チェックポイントと以降の選択肢 ID）で、どの時点でも局面を再現できる', () => {
    const { states, moves } = playRandom({ players: 4 }, 12, 400);
    let checkpoint = states[0]!;
    let pending: OptionId[] = [];
    moves.forEach((m, i) => {
      const prev = states[i]!;
      const next = states[i + 1]!;
      if (isCheckpoint(prev, next)) {
        checkpoint = next;
        pending = [];
      } else {
        pending = [...pending, m];
      }
      expect(JSON.stringify(replay(checkpoint, pending))).toBe(JSON.stringify(next));
    });
  });

  test('空の列の replay はチェックポイントそのものを返す', () => {
    const s = createGame({ players: 2 }, 3);
    expect(replay(s, [])).toEqual(s);
  });

  test('合法でない選択肢 ID を含む列の replay は例外を投げる', () => {
    const s = createGame({ players: 2 }, 3);
    expect(() => replay(s, ['overlap:purge'])).toThrow();
  });
});

describe('isCheckpoint の各条件（design §4.2）', () => {
  const base = arrange({ chips: [{ cell: 'D4' }] });
  const variant = (f: (s: GameState) => void): GameState => {
    const s = structuredClone(base);
    s.events = [];
    f(s);
    return s;
  };

  test('何も変わらなければチェックポイントではない', () => {
    expect(isCheckpoint(base, variant(() => {}))).toBe(false);
  });

  test('乱数を消費した（rng が変わった）', () => {
    expect(isCheckpoint(base, variant((s) => (s.rng = (s.rng + 1) >>> 0)))).toBe(true);
  });

  test('非公開情報が公開された（移動カードを引いた、rules v0.1 §4.7）', () => {
    expect(isCheckpoint(base, variant((s) => s.events.push({ type: 'cardDrawn', seat: 0, card: 'M000' })))).toBe(true);
  });

  test('怨霊との接触が発生した（rules v0.1 §7.2）', () => {
    expect(isCheckpoint(base, variant((s) => s.events.push({ type: 'contact', seats: [0] })))).toBe(true);
  });

  test('選択待ちのプレイヤーが変わった', () => {
    expect(
      isCheckpoint(base, variant((s) => (s.pending = { kind: 'penaltyChip', player: 1, options: ['lose:normal', 'lose:golden'] }))),
    ).toBe(true);
  });

  test('手番番号が変わった（rules v0.1 §4.8）', () => {
    expect(isCheckpoint(base, variant((s) => (s.turnNo += 1)))).toBe(true);
  });

  test('ゲームが終了した（rules v0.1 §9）', () => {
    expect(
      isCheckpoint(base, variant((s) => (s.result = { reason: 'score', winners: [0], scores: [10, 0] }))),
    ).toBe(true);
  });

  test('§4.3〜§4.8 カードを使う手は、手番の終了まで進むためチェックポイントになる', () => {
    const next = applyMove(base, getOptions(base)[0]!);
    expect(isCheckpoint(base, next)).toBe(true);
  });

  test('§7.2(a) 接触でペナルティの選択待ちに止まる手は、接触によりチェックポイントになる', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'C4', hand: [card], held: { normal: 1, golden: 1 } } } });
    const s1 = applyMove(s0, play(card));
    expect(s1.pending?.kind).toBe('penaltyChip');
    expect(s1.rng).toBe(s0.rng);
    expect(s1.turnNo).toBe(s0.turnNo);
    expect(isCheckpoint(s0, s1)).toBe(true);
    // ペナルティを選ぶとカードを引くためチェックポイントになる。
    expect(isCheckpoint(s1, applyMove(s1, 'lose:normal'))).toBe(true);
  });

  test('§7.5 (a) 続行はチェックポイントではなく、(b) 除外は乱数を使うためチェックポイントになる', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'C3' }], seats: { 0: { hand: [card] } } });
    const s = playStill(s0, card);
    expect(s.pending?.kind).toBe('overlapChoice');
    expect(isCheckpoint(s, applyMove(s, 'overlap:continue'))).toBe(false);
    expect(isCheckpoint(s, applyMove(s, 'overlap:purge'))).toBe(true);
  });

  test('§5.4・§5.5 カードを選んだ後、対象を選ぶ前の段階はチェックポイントではない（U-03）', () => {
    const ids = cardIds();
    const g = ids.ghost('N');
    const b = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [g, b] } } });
    const afterGhost = applyMove(s0, play(g));
    const afterBarrier = applyMove(s0, play(b));
    expect(isCheckpoint(s0, afterGhost)).toBe(false);
    expect(isCheckpoint(s0, afterBarrier)).toBe(false);
    // 対象を選ぶとカードを引くためチェックポイントになる。
    expect(isCheckpoint(afterGhost, applyMove(afterGhost, 'ghost:c1'))).toBe(true);
    expect(isCheckpoint(afterBarrier, applyMove(afterBarrier, getOptions(afterBarrier)[0]!))).toBe(true);
  });
});

describe('undoLast（design §4.2、U-03）', () => {
  test('§5.4 カードの選択を取り消すと、カードの使用の選択待ちに戻る', () => {
    const ids = cardIds();
    const g = ids.ghost('N');
    const checkpoint = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [g] } } });
    const moves: OptionId[] = [play(g)];
    expect(replay(checkpoint, moves).pending?.kind).toBe('ghostTarget');
    const undone = undoLast(checkpoint, moves);
    expect(undone).toEqual([]);
    expect(replay(checkpoint, undone!)).toEqual(checkpoint);
  });

  test('moves が空なら null（取り消せない）', () => {
    expect(undoLast(createGame({ players: 2 }, 1), [])).toBeNull();
  });

  test('moves が空でなければ末尾を 1 つ除いた列を返し、引数は変更しない', () => {
    const moves: OptionId[] = ['overlap:continue', 'play:M000'];
    expect(undoLast(createGame({ players: 2 }, 1), moves)).toEqual(['overlap:continue']);
    expect(moves).toEqual(['overlap:continue', 'play:M000']);
  });

  test('§7.5 続行を取り消すと、重なりの選択待ちに戻る', () => {
    const ids = cardIds();
    const card = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'C3' }], seats: { 0: { hand: [card] } } });
    const checkpoint = playStill(s0, card);
    const moves: OptionId[] = ['overlap:continue'];
    expect(replay(checkpoint, moves).pending?.kind).toBe('playCard');
    const undone = undoLast(checkpoint, moves);
    expect(undone).toEqual([]);
    expect(replay(checkpoint, undone!)).toEqual(checkpoint);
  });
});
