import { defineConfig, devices } from '@playwright/test';

const today = new Date();
const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
  today.getDate()
).padStart(2, '0')}`;
const localMock = process.env.PLAYER_MOCK_ENABLED === '1';
const baseURL = localMock ? 'http://127.0.0.1:4174' : 'http://127.0.0.1:4173';
const reuseBuild = process.env.PLAYWRIGHT_REUSE_BUILD === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 1,
  reporter: localMock ? 'line' : 'html',
  use: {
    baseURL,
    trace: localMock ? 'off' : 'on-first-retry',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: 'hsrarchive:changelog-dismissed-date', value: localDate }]
        }
      ]
    }
  },
  webServer: {
    command: localMock
      ? 'pnpm dev --host 127.0.0.1 --port 4174'
      : `${reuseBuild ? '' : 'pnpm build && '}pnpm preview --host 127.0.0.1 --port 4173`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: '**/ci-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      testIgnore: '**/ci-smoke.spec.ts',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'ci-smoke',
      testMatch: '**/ci-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
