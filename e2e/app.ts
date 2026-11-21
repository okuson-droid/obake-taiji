// 受け入れ検査の共通部品。
import { expect, type Page } from '@playwright/test';

/** ビルド済みの画面の URL */
export const appUrl = (hash: string): string => new URL(`../dist/index.html${hash}`, import.meta.url).href;

/** スクリーンショットの保存先（CI の成果物として保存する。リポジトリには入れない） */
export const screenshotPath = (name: string): string =>
  new URL(`../e2e-screenshots/${name}.png`, import.meta.url).pathname;

/** ページのエラー（未捕捉の例外とコンソールのエラー）を集める。 */
export const collectErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};

/** テスト側の決定的な乱択（mulberry32）。ゲームの乱数とは独立している。 */
export const picker = (seed: number) => {
  let a = seed >>> 0;
  return (n: number): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
};

export type Snapshot = {
  screen: 'result' | 'blind' | 'game' | 'other';
  options: number;
  overflow: boolean;
  /** 自分の手札（data-option の play:）以外に DOM に現れた移動カード ID */
  leaked: string[];
  fallback: number;
};

/** 1 回の往復で、画面の種類と検査項目をまとめて調べる。 */
export const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const q = (sel: string) => document.querySelector(sel) !== null;
    const screen = q('[data-testid=game-result]')
      ? 'result'
      : q('[data-testid=blind-reveal]')
        ? 'blind'
        : q('[data-testid=board]')
          ? 'game'
          : 'other';
    const own = new Set(
      [...document.querySelectorAll('[data-option^="play:"]')].map((e) => e.getAttribute('data-option')!.slice(5)),
    );
    const ids = /* 画面は body の中だけにある。head には埋め込んだスクリプトがあり、調べる必要がない。 */ document.body.outerHTML.match(/M\d{3}/g) ?? [];
    return {
      screen,
      options: document.querySelectorAll('[data-option]').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      leaked: [...new Set(ids)].filter((id) => !own.has(id)),
      fallback: window.__fallbackCount,
    } as const;
  });

export type PlayResult = { moves: number; reveals: number };

/**
 * data-option を持つ要素のタップだけで終局まで打つ。「選び直す」は選ばない。目隠し画面は解除する。
 * 局面ごとに、横方向のはみ出し・他人の手札の漏れ・安全網の件数を確かめる。
 */
export const playToEnd = async (
  page: Page,
  seed: number,
  /** 対局画面（目隠し画面でない）が表示されるたびに、それまでのタップ数を渡して呼ぶ。 */
  onGameScreen?: (moves: number) => Promise<void>,
): Promise<PlayResult> => {
  const pick = picker(seed);
  let moves = 0;
  let reveals = 0;
  for (;;) {
    const s = await snapshot(page);
    expect(s.overflow, '横方向のはみ出し').toBe(false);
    expect(s.leaked, 'viewer 以外の手札のカード ID').toEqual([]);
    expect(s.fallback, '安全網の件数').toBe(0);
    if (s.screen === 'result') return { moves, reveals };
    if (s.screen === 'blind') {
      await page.getByTestId('blind-reveal').click();
      reveals++;
      continue;
    }
    expect(s.screen).toBe('game');
    expect(s.options).toBeGreaterThan(0);
    if (onGameScreen) await onGameScreen(moves);
    await page.locator('[data-option]').nth(pick(s.options)).click();
    moves++;
  }
};
