import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/components',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite --config tests/fixtures/image-fallback/vite.config.ts',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI
  }
});
