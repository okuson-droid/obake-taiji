import { defineConfig, devices } from '@playwright/test';

// 受け入れ検査（design.md §9.3）。第 1 段階では、ビルド済みの dist/index.html を開く検査 1 本だけを置く。
export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  reporter: 'list',
  use: {
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
