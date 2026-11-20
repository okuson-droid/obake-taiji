import { defineConfig, devices } from '@playwright/test';

// 受け入れ検査（design.md §9.3）。npm run build で作った dist/index.html を file:// で開いて検査する。
export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  fullyParallel: true,
  reporter: 'list',
  // 自動対戦は 1 局が長いため、1 本あたりの上限を広げる。
  timeout: 10 * 60 * 1000,
  use: {
    trace: 'off',
    // 1 回の操作が止まったときに、局全体の上限まで待たずに失敗させる。
    actionTimeout: 15 * 1000,
    // お化けの揺れ（CSS のアニメーション）を止める。揺れる要素は Playwright が「止まるまで」待つため。
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
