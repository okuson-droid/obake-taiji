// 第 1 段階の受け入れ検査の雛形である。npm run build の後に実行する。
// 自動対戦などの本来の検査は第 4 段階で追加する（design.md §9.3）。
import { expect, test } from '@playwright/test';

test('ビルドした dist/index.html がエラーなく開ける', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('../dist/index.html', import.meta.url).href);
  await expect(page).toHaveTitle('お化け退治');
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(errors).toEqual([]);
});
