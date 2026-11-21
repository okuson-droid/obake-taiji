// トップ画面の受け入れ検査（design.md §7.5・§9.3）。npm run build の後に実行する。
import { expect, test } from '@playwright/test';
import { appUrl, collectErrors, screenshotPath } from './app.ts';

for (const width of [375, 1280]) {
  test(`トップ画面（幅 ${width}px）：ローカル対戦の入口があり、オンライン対戦の入口はない`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(appUrl('#/'));
    await expect(page).toHaveTitle('お化け退治');
    for (const n of [2, 3, 4]) await expect(page.getByTestId(`start-local-${n}`)).toBeVisible();
    // Firebase の設定がないため、オンライン対戦の入口を出さない（decisions.md D-08 の考え方）。
    await expect(page.getByTestId('online-entry')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.screenshot({ path: screenshotPath(`top-${width}`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('人数を選ぶとシード付きの URL でローカル対戦が始まり、目隠し画面が出る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(appUrl('#/'));
  await page.getByTestId('start-local-3').click();
  await expect(page).toHaveURL(/#\/local\/3\?seed=\d+$/);
  await expect(page.getByTestId('blind-reveal')).toHaveText(/席 1 の番です。/);
  expect(errors).toEqual([]);
});

test('同じシードなら同じ配置から始まる（decisions.md D-17）', async ({ page }) => {
  const read = async () => {
    await page.goto(appUrl('#/local/2?seed=12345'));
    await page.getByTestId('blind-reveal').click();
    return page.getByTestId('board').innerHTML();
  };
  const first = await read();
  await page.goto(appUrl('#/'));
  expect(await read()).toBe(first);
});
