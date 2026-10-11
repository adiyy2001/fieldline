import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { callAutomation } from './automation.ts';

const baselineDirectory = join(import.meta.dirname, 'baselines');
const regenerate = process.env['UPDATE_VISUAL_BASELINES'] === '1';

const GROUND_SIZE = { width: 384, height: 144 };
const SCENE_SIZE = { width: 384, height: 240 };
const MEAN_CHANNEL_TOLERANCE = 2;
const DIFFERENT_CHANNEL_THRESHOLD = 32;
const DIFFERENT_PIXEL_FRACTION = 0.02;

interface VisualState {
  readonly name: string;
  readonly query: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly scene: boolean;
  readonly phaseDegrees?: number;
}

const STATES: readonly VisualState[] = [
  { name: 'ground-electric-rms', query: 'v=1', size: GROUND_SIZE, scene: false },
  {
    name: 'ground-magnetic-instantaneous',
    query: 'v=1&q=b&r=inst&ang=90',
    size: GROUND_SIZE,
    scene: false,
    phaseDegrees: 90,
  },
  { name: 'ground-delta-tower', query: 'v=1&t=d', size: GROUND_SIZE, scene: false },
  { name: 'volume-electric', query: 'v=1&w=volume', size: SCENE_SIZE, scene: true },
  { name: 'isosurface-electric', query: 'v=1&w=isosurface', size: SCENE_SIZE, scene: true },
  {
    name: 'lines-electric',
    query: 'v=1&w=lines',
    size: SCENE_SIZE,
    scene: true,
    phaseDegrees: 30,
  },
];

async function prepare(page: Page, state: VisualState): Promise<void> {
  await page.goto(`/?automation&${state.query}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
  if (state.scene) {
    await expect(page.getByTestId('scene-summary')).not.toBeEmpty({ timeout: 60_000 });
    const pause = page.getByTestId('scene-pause');
    if ((await pause.getAttribute('aria-pressed')) === 'false') {
      await pause.click();
    }
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
  }
  if (state.phaseDegrees !== undefined) {
    await callAutomation(page, 'setPhase', state.phaseDegrees);
  }
  await page.waitForTimeout(500);
  await callAutomation(page, 'settle');
}

interface Comparison {
  readonly meanChannelDifference: number;
  readonly differentPixelFraction: number;
  readonly width: number;
  readonly height: number;
}

async function compareWithBaseline(
  page: Page,
  size: VisualState['size'],
  baseline: string,
): Promise<Comparison> {
  return page.evaluate(
    async ([request, dataUrl, threshold]) => {
      const api = (
        window as unknown as {
          fieldline: {
            captureFrame(value: {
              width: number;
              height: number;
            }): Promise<{ width: number; height: number; pixels: Uint8Array } | null>;
          };
        }
      ).fieldline;
      const frame = await api.captureFrame(request);
      if (frame === null) {
        throw new Error('The readback returned no frame');
      }
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) {
        throw new Error('No 2D context');
      }
      context.drawImage(image, 0, 0);
      const expected = context.getImageData(0, 0, frame.width, frame.height).data;
      let sum = 0;
      let different = 0;
      for (let index = 0; index < frame.pixels.length; index += 4) {
        let worst = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const difference = Math.abs(
            (frame.pixels[index + channel] ?? 0) - (expected[index + channel] ?? 0),
          );
          sum += difference;
          worst = Math.max(worst, difference);
        }
        if (worst > threshold) {
          different += 1;
        }
      }
      const pixels = frame.pixels.length / 4;
      return {
        meanChannelDifference: sum / (pixels * 3),
        differentPixelFraction: different / pixels,
        width: frame.width,
        height: frame.height,
      };
    },
    [size, baseline, DIFFERENT_CHANNEL_THRESHOLD] as const,
  );
}

async function readbackPng(page: Page, size: VisualState['size']): Promise<Buffer> {
  const dataUrl = await page.evaluate(async (request) => {
    const api = (
      window as unknown as {
        fieldline: {
          captureFrame(value: {
            width: number;
            height: number;
          }): Promise<{ width: number; height: number; pixels: Uint8Array } | null>;
        };
      }
    ).fieldline;
    const frame = await api.captureFrame(request);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (frame === null || context === null) {
      throw new Error('The readback returned no frame');
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
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

test.describe('the readback of six fixed states against the stored baselines', () => {
  for (const state of STATES) {
    test(`${state.name} matches its baseline`, async ({ page }) => {
      await prepare(page, state);
      const file = join(baselineDirectory, `${state.name}.png`);
      if (regenerate) {
        mkdirSync(baselineDirectory, { recursive: true });
        writeFileSync(file, await readbackPng(page, state.size));
        return;
      }
      const baseline = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
      const comparison = await compareWithBaseline(page, state.size, baseline);
      expect(comparison.width).toBe(state.size.width);
      expect(comparison.height).toBe(state.size.height);
      expect(comparison.meanChannelDifference).toBeLessThanOrEqual(MEAN_CHANNEL_TOLERANCE);
      expect(comparison.differentPixelFraction).toBeLessThanOrEqual(DIFFERENT_PIXEL_FRACTION);
    });
  }
});
