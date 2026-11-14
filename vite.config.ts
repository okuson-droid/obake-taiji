import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// GitHub Pages の配下で動くよう相対パスで出力し、dist/index.html 1 枚にまとめる（design.md §10.1）。
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
