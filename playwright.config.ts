import { defineConfig } from '@playwright/test';

// E2E-test van de volledige flow tegen `npm run dev` (Vite + Worker met lokale D1). Lokaal: `npm run test:e2e`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    // lokaal het geïnstalleerde Chrome gebruiken; in CI de door Playwright geïnstalleerde Chromium
    channel: process.env.CI ? undefined : 'chrome',
  },
  // /api/me geeft 401 zodra de Worker draait (502 zolang de API nog opstart)
  webServer: { command: 'npm run dev', url: 'http://localhost:5173/api/me', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
