// design.md §4.6（maskEvents）。rules v0.1 §3.4（手札は持ち主以外に非公開、R-15）に対応する。
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { maskEvents } from '../src/game/visibility.ts';
import type { GameEvent } from '../src/game/types.ts';

describe('maskEvents（design §4.6、rules v0.1 §3.4）', () => {
  const events: GameEvent[] = [
    { type: 'cardPlayed', seat: 0, card: 'M001' },
    { type: 'cardDrawn', seat: 0, card: 'M050' },
    { type: 'cardDrawn', seat: 1, card: 'M100' },
    { type: 'turnStarted', seat: 1, turnNo: 2 },
  ];

  test('§3.4 他人が引いたカードを null に伏せ、自分が引いたカードはそのまま残す', () => {
    expect(maskEvents(events, 0)).toEqual([
      { type: 'cardPlayed', seat: 0, card: 'M001' },
      { type: 'cardDrawn', seat: 0, card: 'M050' },
      { type: 'cardDrawn', seat: 1, card: null },
      { type: 'turnStarted', seat: 1, turnNo: 2 },
    ]);
    expect(maskEvents(events, 1)[1]).toEqual({ type: 'cardDrawn', seat: 0, card: null });
    expect(maskEvents(events, 1)[2]).toEqual({ type: 'cardDrawn', seat: 1, card: 'M100' });
  });

  test('§4.3 使ったカードは公開情報なので伏せない（R-15）', () => {
    expect(maskEvents(events, 1)[0]).toEqual({ type: 'cardPlayed', seat: 0, card: 'M001' });
  });

  test('引数の配列と出来事を変更しない', () => {
    const before = JSON.stringify(events);
    maskEvents(events, 2);
    expect(JSON.stringify(events)).toBe(before);
  });

  test('§3.4 実際の手番の出来事で、他人の引いたカード ID が残らない', () => {
    const s0 = createGame({ players: 3 }, 4);
    const s1 = applyMove(s0, getOptions(s0)[0]!);
    for (const viewer of [1, 2] as const) {
      for (const e of maskEvents(s1.events, viewer)) {
        if (e.type === 'cardDrawn' && e.seat !== viewer) expect(e.card).toBeNull();
      }
    }
  });
});
