// CLAUDE.md・design.md §2 の依存の向きと、decisions.md D-03 の乱数の制約を確かめる。
// src/game/ は src/ui/・src/net/ を import せず、Math.random を使わない。
import { describe, expect, test } from 'vitest';

const sources = import.meta.glob<string>('../src/game/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('src/game の制約', () => {
  test('検査対象のファイルがある', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  test('src/ui・src/net を import しない', () => {
    for (const [path, text] of Object.entries(sources)) {
      const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
      for (const spec of specifiers) {
        expect(spec, `${path} が ${spec} を import している`).not.toMatch(/(^|\/)(ui|net)(\/|$)/);
      }
    }
  });

  test('Math.random を使わない', () => {
    for (const [path, text] of Object.entries(sources)) {
      expect(text, `${path} が Math.random を使っている`).not.toMatch(/Math\s*\.\s*random/);
    }
  });
});
