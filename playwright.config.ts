import { defineConfig, devices } from '@playwright/test';
import { webGpuLaunchArguments } from './scripts/chromium-flags.ts';

const port = 4331;
const origin = `http://127.0.0.1:${String(port)}`;
const cpuSpecPattern = /\.cpu\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'gpu',
      testIgnore: cpuSpecPattern,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: [...webGpuLaunchArguments] },
      },
    },
    {
      name: 'cpu',
      testMatch: cpuSpecPattern,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec tsx scripts/serve-dist.ts',
    url: origin,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
