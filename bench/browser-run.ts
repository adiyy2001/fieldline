import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { openAutomation } from '../e2e/automation';
import { webGpuLaunchArguments } from '../scripts/chromium-flags';
import { createDistServer, host } from '../scripts/serve-dist';

export const REAL_GPU_ARGUMENTS: readonly string[] = [
  '--enable-unsafe-webgpu',
  '--force_high_performance_gpu',
  '--enable-webgpu-developer-features',
];

export type BackendMode = 'gpu' | 'cpu';

export interface BrowserOptions {
  readonly channel: string | null;
  readonly realGpu: boolean;
  readonly mode: BackendMode;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly port: number;
}

export interface BrowserSession {
  readonly page: Page;
  readonly browserName: string;
}

export function valueOf(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

export function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function launchArguments(options: BrowserOptions): string[] {
  if (options.mode === 'cpu') {
    return [];
  }
  return options.realGpu ? [...REAL_GPU_ARGUMENTS] : [...webGpuLaunchArguments];
}

export async function withAutomationPage<T>(
  options: BrowserOptions,
  run: (session: BrowserSession) => Promise<T>,
): Promise<T> {
  const server = createDistServer(resolve('dist/fieldline/browser'));
  await new Promise<void>((done) => {
    server.listen(options.port, host, done);
  });
  const browser = await chromium.launch({
    ...(options.channel === null ? {} : { channel: options.channel }),
    args: launchArguments(options),
  });
  try {
    const page = await browser.newPage({
      viewport: options.viewport,
      baseURL: `http://${host}:${String(options.port)}`,
    });
    page.setDefaultTimeout(0);
    await openAutomation(page);
    return await run({
      page,
      browserName: `${browser.browserType().name()} ${browser.version()}`,
    });
  } finally {
    await browser.close();
    server.close();
  }
}

export async function evaluateScript<T>(page: Page, source: string, input: unknown): Promise<T> {
  return page.evaluate(
    ([code, argument]) => {
      const run = (0, eval)(code) as (value: unknown) => Promise<T>;
      return run(argument);
    },
    [source, input] as const,
  );
}
