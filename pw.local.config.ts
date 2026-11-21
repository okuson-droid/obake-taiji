import base from './playwright.config.ts';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } } });
