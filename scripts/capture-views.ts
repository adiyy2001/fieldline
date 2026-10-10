import { mkdirSync, writeFileSync } from 'node:fs';
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
  readonly scene?: boolean;
  readonly cpuOnly?: boolean;
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
  { name: 'ground-high-voltage', search: '?v=1&kv=1100&a=2000' },
  { name: 'profile', search: '?v=1&w=profile' },
  { name: 'profile-overlay', search: '?v=1&w=profile&o2=1&sec=0.25' },
  { name: 'profile-custom-level', search: '?v=1&w=profile&cl=e:3:Site%20limit&hl=e:10' },
  { name: 'profile-table', search: '?v=1&w=profile', prepare: showTable },
  { name: 'optimizer', search: '?v=1&w=optimizer&t=dc' },
  { name: 'optimizer-magnetic', search: '?v=1&w=optimizer&t=dc&rk=pb' },
  { name: 'optimizer-single-circuit', search: '?v=1&w=optimizer' },
  { name: 'volume-electric', search: '?v=1&w=volume', scene: true },
  { name: 'volume-bands', search: '?v=1&w=volume', scene: true, prepare: chooseBands },
  { name: 'volume-magnetic', search: '?v=1&w=volume&q=b', scene: true },
  { name: 'volume-instantaneous', search: '?v=1&w=volume&r=inst&ang=90', scene: true },
  { name: 'volume-orbited', search: '?v=1&w=volume&t=dc', scene: true, prepare: orbitAround },
  { name: 'isosurface-electric', search: '?v=1&w=isosurface', scene: true },
  { name: 'isosurface-magnetic', search: '?v=1&w=isosurface&q=b', scene: true },
  { name: 'isosurface-delta-tower', search: '?v=1&w=isosurface&t=d', scene: true },
  { name: 'lines-electric', search: '?v=1&w=lines&ang=30', scene: true },
  { name: 'lines-magnetic', search: '?v=1&w=lines&q=b&ang=30', scene: true },
  { name: 'lines-double-circuit', search: '?v=1&w=lines&t=dc&ang=60', scene: true },
  { name: 'lines-orbited', search: '?v=1&w=lines&ang=30', scene: true, prepare: orbitAround },
  { name: 'scene-unavailable', search: '?v=1&w=volume', cpuOnly: true },
  {
    name: 'help',
    search: '',
    prepare: async (page) => {
      await page.keyboard.press('?');
      await page.getByRole('dialog').waitFor();
    },
  },
];

async function pauseAnimation(page: Page): Promise<void> {
  const pause = page.getByTestId('scene-pause');
  if ((await pause.getAttribute('aria-pressed')) === 'false') {
    await pause.click();
  }
  await page.waitForTimeout(400);
}

async function chooseBands(page: Page): Promise<void> {
  await page.getByLabel('Exposure bands').check();
  await page.waitForTimeout(400);
}

async function orbitAround(page: Page): Promise<void> {
  await page.getByRole('group', { name: /Arrow keys orbit/ }).focus();
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press('ArrowRight');
  }
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press('ArrowUp');
  }
  await page.waitForTimeout(400);
}

async function waitForScene(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (document.querySelector('[data-testid="scene-summary"]')?.textContent ?? '').trim().length >
      0,
    undefined,
    { timeout: 60_000 },
  );
  await pauseAnimation(page);
}

async function showTable(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Data table' }).click();
  await page.getByTestId('profile-table').waitFor();
}

const READBACK = { width: 512, height: 192 };

const SCENE_READBACK = { width: 800, height: 500 };

async function readbackPng(
  page: Page,
  size: { width: number; height: number },
): Promise<Buffer | null> {
  const dataUrl = await page.evaluate(async (size) => {
    const api = (
      window as unknown as {
        fieldline: {
          captureFrame(request: {
            width: number;
            height: number;
          }): Promise<{ width: number; height: number; pixels: Uint8Array } | null>;
        };
      }
    ).fieldline;
    const frame = await api.captureFrame(size);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (frame === null || context === null) {
      return null;
    }
    canvas.width = frame.width;
    canvas.height = frame.height;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height),
      0,
      0,
    );
    return canvas.toDataURL('image/png');
  }, size);
  return dataUrl === null ? null : Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

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
  if (shot.scene === true) {
    await waitForScene(page);
  }
  await shot.prepare?.(page);
  await page.screenshot({
    path: join(outputDirectory, `${group}-${viewport.name}-${shot.name}.png`),
    fullPage: true,
  });
  const readsBack =
    shot.scene === true || (shot.prepare === undefined && !shot.search.includes('w='));
  if (viewport.name === 'desktop' && readsBack) {
    const png = await readbackPng(page, shot.scene === true ? SCENE_READBACK : READBACK);
    if (png !== null) {
      writeFileSync(join(outputDirectory, `${group}-readback-${shot.name}.png`), png);
    }
  }
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
          const skip = group === 'cpu' ? shot.scene === true : shot.cpuOnly === true;
          if (skip) {
            continue;
          }
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
