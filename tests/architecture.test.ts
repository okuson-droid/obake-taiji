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

const uiSources = import.meta.glob<string>('../src/ui/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** src/ui が使ってよい src/game のモジュール（公開 API と型）。ルールの内部（executor・board-ops・rng）は使わない。 */
const UI_ALLOWED_GAME = ['engine', 'history', 'queries', 'targets', 'explain', 'visibility', 'types'];

describe('src/ui の制約（CLAUDE.md：ルールを再実装しない）', () => {
  test('検査対象のファイルがある', () => {
    expect(Object.keys(uiSources).length).toBeGreaterThan(0);
  });

  test('src/game は公開 API（engine・history・queries・targets・explain・visibility・types）だけを import する', () => {
    for (const [path, text] of Object.entries(uiSources)) {
      for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1] ?? '';
        const game = /\/game\/([\w-]+)\.ts$/.exec(spec);
        if (game !== null) expect(UI_ALLOWED_GAME, `${path} が ${spec} を import している`).toContain(game[1]);
      }
    }
  });

  test('Math.random を使わない（シードと部屋コードは crypto.getRandomValues、D-03・D-17）', () => {
    for (const [path, text] of Object.entries(uiSources)) {
      expect(text, `${path} が Math.random を使っている`).not.toMatch(/Math\s*\.\s*random/);
    }
  });
});

const netSources = import.meta.glob<string>('../src/net/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('src/net の制約（design.md §2）', () => {
  test('検査対象のファイルがある', () => {
    expect(Object.keys(netSources).length).toBeGreaterThan(0);
  });

  test('src/ui を import せず、src/game は公開 API（engine・history・types）だけを import する', () => {
    for (const [path, text] of Object.entries(netSources)) {
      for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1] ?? '';
        expect(spec, `${path} が ${spec} を import している`).not.toMatch(/(^|\/)ui\//);
        const game = /\/game\/([\w-]+)\.ts$/.exec(spec);
        if (game !== null) expect(['engine', 'history', 'types'], `${path} が ${spec} を import している`).toContain(game[1]);
      }
    }
  });

  test('Math.random を使わない', () => {
    for (const [path, text] of Object.entries(netSources)) {
      expect(text, `${path} が Math.random を使っている`).not.toMatch(/Math\s*\.\s*random/);
    }
  });
});
