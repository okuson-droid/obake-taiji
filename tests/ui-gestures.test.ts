// design.md §8 の所作の対応表（gestures.ts）と、出来事の表示文（eventText.ts）
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { targetOf } from '../src/game/targets.ts';
import { maskEvents } from '../src/game/visibility.ts';
import { eventText } from '../src/ui/eventText.ts';
import { GESTURES, areaOf } from '../src/ui/gestures.ts';
import { randomPicker } from './helpers.ts';

describe('所作の対応表（design §8）', () => {
  test('Target.type ごとの領域：handCard→手札、chip・wraith・edge→盤面、heldChip→情報欄、button→ボタン', () => {
    expect(Object.fromEntries(Object.entries(GESTURES).map(([k, v]) => [k, v.area]))).toEqual({
      handCard: 'hand',
      chip: 'board',
      wraith: 'board',
      edge: 'board',
      heldChip: 'info',
      button: 'controls',
    });
  });

  test('乱択プレイアウトのすべての合法手が、いずれかの領域に割り当てられる', () => {
    const pick = randomPicker(3);
    let s = createGame({ players: 3 }, 3);
    for (let i = 0; i < 2000 && s.result === null; i++) {
      for (const o of getOptions(s)) expect(GESTURES[targetOf(s, o).type]).toBeDefined();
      for (const o of getOptions(s)) expect(['hand', 'board', 'info', 'controls']).toContain(areaOf(targetOf(s, o)));
      s = applyMove(s, pick(getOptions(s)));
    }
  });
});

describe('出来事の表示文（eventText.ts、rules v0.2 §3.4）', () => {
  test('すべての種類の出来事に文を返し、カード ID を含めない', () => {
    const pick = randomPicker(8);
    let s = createGame({ players: 4 }, 8);
    const seen = new Set<string>();
    for (let i = 0; i < 3000 && s.result === null; i++) {
      s = applyMove(s, pick(getOptions(s)));
      for (const e of s.events) {
        const text = eventText(e);
        expect(text).not.toBeNull();
        expect(text).not.toMatch(/M\d{3}/);
        seen.add(e.type);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  test('§3.4 他人の引いたカードは maskEvents で伏せられ、カードの種類も文に出ない', () => {
    const text = maskEvents([{ type: 'cardDrawn', seat: 1, card: 'M120' }], 0).map(eventText);
    expect(text).toEqual(['席 2 がカードを 1 枚引いた']);
    expect(maskEvents([{ type: 'cardDrawn', seat: 0, card: 'M120' }], 0).map(eventText)).toEqual(['席 1 が「お化け移動（北）」を引いた']);
  });
});
