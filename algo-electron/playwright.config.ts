import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.pw.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['line']] : [['list']],
  outputDir: 'tmp/playwright',
  use: {
    trace: 'retain-on-failure',
  },
})
