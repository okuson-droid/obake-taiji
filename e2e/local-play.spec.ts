// ローカル対戦の自動対戦（design.md §9.3）。固定シードで、data-option を持つ要素のタップだけで終局まで打つ。
import { expect, test } from '@playwright/test';
import { appUrl, collectErrors, playToEnd, screenshotPath } from './app.ts';

/** [人数, ゲームのシード, 画面の幅] */
const GAMES: [2 | 3 | 4, number, number][] = [
  [2, 101, 375],
  [3, 202, 1280],
  [4, 303, 375],
];

for (const [players, seed, width] of GAMES) {
  test(`${players} 人・シード ${seed}・幅 ${width}px：タップだけで終局まで打てる`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(appUrl(`#/local/${players}?seed=${seed}`));
    const started = Date.now();
    let shot = false;
    const result = await playToEnd(page, seed, async (moves) => {
      if (!shot && moves >= 40) {
        shot = true;
        await page.screenshot({ path: screenshotPath(`local-${players}p-${width}-mid`), fullPage: true });
      }
    });
    await expect(page.getByTestId('game-result')).toBeVisible();
    await page.screenshot({ path: screenshotPath(`local-${players}p-${width}-end`), fullPage: true });
    console.log(`${players} 人・シード ${seed}：タップ ${result.moves} 回・目隠し解除 ${result.reveals} 回・${((Date.now() - started) / 1000).toFixed(1)} 秒`);
    expect(await page.evaluate(() => window.__fallbackCount)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('幅 375px と 1280px：通せん棒の選択中もはみ出さず、選べないカードのタップで理由を表示し、選び直せる', async ({ page }) => {
  const errors = collectErrors(page);
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    // 通せん棒カードが手札に来るまで、人間移動カード以外を優先せずに打ち進める。
    await page.goto(appUrl('#/local/2?seed=55'));
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      if (await page.getByTestId('blind-reveal').count()) await page.getByTestId('blind-reveal').click();
      const cards = page.locator('[data-testid=hand-card].kind-barrier[data-option]');
      if ((await cards.count()) > 0) {
        await cards.first().click();
        found = true;
        break;
      }
      await page.locator('[data-option]').first().click();
    }
    expect(found).toBe(true);
    await expect(page.locator('.edge-hit.place').first()).toBeVisible();
    // 辺の当たり判定の幅は 16px 以上（design.md §8）。
    const box = await page.locator('.edge-hit').first().boundingBox();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.screenshot({ path: screenshotPath(`barrier-${width}`), fullPage: true });
    // 対象を選ぶ前は「選び直す」で取り消せる（U-03）。
    await expect(page.getByTestId('undo')).toBeVisible();
    // 手札のカードは選べない（aria-disabled）。タップすると理由を表示する。
    // Playwright は aria-disabled の要素を押せないものとして待つため、force で押す。
    await page.getByTestId('hand-card').first().click({ force: true });
    await expect(page.getByTestId('explain-message')).toHaveText('通せん棒を置く辺か、取り除く通せん棒を選んでください');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('undo')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test.describe('タッチ操作（U-02）', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test('人間移動カードは 1 回目のタップで移動先を予告し、2 回目のタップで決定する', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(appUrl('#/local/2?seed=101'));
    await page.getByTestId('blind-reveal').tap();
    const human = page.locator('[data-testid=hand-card].kind-human[data-option]').first();
    const option = await human.getAttribute('data-option');
    await human.tap();
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('blind-reveal')).toHaveCount(0);
    await page.locator(`[data-option="${option}"]`).tap();
    // 決定すると手番が席 2 に移り、目隠し画面になる。
    await expect(page.getByTestId('blind-reveal')).toHaveText(/席 2 の番です。/);
    expect(errors).toEqual([]);
  });
});
