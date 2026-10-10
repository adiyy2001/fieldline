import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Browser, type BrowserContext, type Page, chromium } from '@playwright/test';
import { createDistServer, host } from './serve-dist';
import { webGpuLaunchArguments } from './chromium-flags';

const CAPTURE_PORT = Number(process.env['FIELDLINE_CAPTURE_PORT'] ?? 4334);
const outputDirectory = resolve('.artifacts/screens');

interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

interface Shot {
  readonly name: string;
  readonly search: string;
  readonly prepare?: (page: Page) => Promise<void>;
}

const VIEWPORTS: readonly Viewport[] = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

const SHOTS: readonly Shot[] = [
  { name: 'ground-electric', search: '' },
  { name: 'ground-magnetic', search: '?v=1&q=b' },
  { name: 'ground-instantaneous', search: '?v=1&r=inst&ang=90' },
  { name: 'ground-delta-tower', search: '?v=1&t=d' },
  { name: 'ground-cross-section', search: '?v=1&m=cross-section-2d' },
  { name: 'ground-high-voltage', search: '?v=1&kv=765&a=2000' },
  {
    name: 'help',
    search: '',
    prepare: async (page) => {
      await page.keyboard.press('?');
      await page.getByRole('dialog').waitFor();
    },
  },
];

async function capture(
  context: BrowserContext,
  origin: string,
  group: string,
  viewport: Viewport,
  shot: Shot,
): Promise<void> {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${origin}/${shot.search}${shot.search === '' ? '?' : '&'}automation`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(() =>
    (window as unknown as { fieldline: { settle(): Promise<void> } }).fieldline.settle(),
  );
  await page.waitForTimeout(400);
  await shot.prepare?.(page);
  await page.screenshot({
    path: join(outputDirectory, `${group}-${viewport.name}-${shot.name}.png`),
    fullPage: true,
  });
  await page.close();
}

async function run(): Promise<void> {
  mkdirSync(outputDirectory, { recursive: true });
  const server = createDistServer(resolve('dist/fieldline/browser'));
  await new Promise<void>((done) => {
    server.listen(CAPTURE_PORT, host, done);
  });
  const origin = `http://${host}:${String(CAPTURE_PORT)}`;
  const browsers: Browser[] = [];
  try {
    const gpu = await chromium.launch({ args: [...webGpuLaunchArguments] });
    const cpu = await chromium.launch();
    browsers.push(gpu, cpu);
    for (const [group, browser] of [
      ['gpu', gpu],
      ['cpu', cpu],
    ] as const) {
      const context = await browser.newContext();
      for (const viewport of VIEWPORTS) {
        for (const shot of SHOTS) {
          await capture(context, origin, group, viewport, shot);
        }
      }
      await context.close();
    }
  } finally {
    for (const browser of browsers) {
      await browser.close();
    }
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
    });
  }
}

await run();
