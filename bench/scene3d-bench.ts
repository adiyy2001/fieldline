import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { webGpuLaunchArguments } from '../scripts/chromium-flags';
import { openAutomation, callAutomation } from '../e2e/automation';
import { createDistServer, host } from '../scripts/serve-dist';
import type { AdapterReport } from '../src/app/automation/automation-types';
import { describeEnvironment } from './environment';
import { adapterSlug } from './gpu-plan';
import {
  CAPTURE_REPEATS,
  FRAME_SAMPLES,
  MEASURE_SOURCE,
  SCENE_VIEW_SPECS,
  type SceneViewRow,
} from './scene3d-measure';

const resultsDirectory = join(import.meta.dirname, 'results');
const BENCH_PORT = Number(process.env['FIELDLINE_BENCH_PORT'] ?? 4334);
const REAL_GPU_ARGUMENTS = [
  '--enable-unsafe-webgpu',
  '--force_high_performance_gpu',
  '--enable-webgpu-developer-features',
];

interface Payload {
  readonly browser: string;
  readonly adapter: AdapterReport;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly rows: readonly SceneViewRow[];
}

function valueOf(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarize(row: SceneViewRow) {
  const frames = row.frameIntervals;
  return {
    view: row.name,
    readyMilliseconds: round(row.readyMilliseconds),
    drawAndReadbackMedianMilliseconds: round(percentile(row.captureMilliseconds, 0.5)),
    drawAndReadbackMaximumMilliseconds: round(Math.max(...row.captureMilliseconds)),
    frameIntervalMedianMilliseconds: frames === null ? null : round(percentile(frames, 0.5)),
    frameIntervalP95Milliseconds: frames === null ? null : round(percentile(frames, 0.95)),
    framesPerSecond: frames === null ? null : round(1000 / percentile(frames, 0.5)),
  };
}

function writeResults(payload: Payload, hostLabel: string | null): void {
  const slug = adapterSlug(payload.adapter);
  const table = payload.rows.map(summarize);
  mkdirSync(resultsDirectory, { recursive: true });
  writeFileSync(
    join(resultsDirectory, `scene3d-${slug}.json`),
    `${JSON.stringify(
      {
        environment: describeEnvironment(),
        runHost: hostLabel ?? 'same machine as the environment block',
        browser: payload.browser,
        adapter: payload.adapter,
        viewport: payload.viewport,
        captureSize: { width: 800, height: 500 },
        rows: table,
        raw: payload.rows,
      },
      null,
      2,
    )}\n`,
  );
  console.table(table);
  console.log(`Wrote bench/results/scene3d-${slug}.json`);
}

async function measure(argv: readonly string[]): Promise<Payload> {
  const server = createDistServer(resolve('dist/fieldline/browser'));
  await new Promise<void>((done) => {
    server.listen(BENCH_PORT, host, done);
  });
  const channel = valueOf(argv, '--channel');
  const browser = await chromium.launch({
    ...(channel === null ? {} : { channel }),
    args: argv.includes('--real-gpu') ? REAL_GPU_ARGUMENTS : [...webGpuLaunchArguments],
  });
  try {
    const viewport = { width: 1280, height: 800 };
    const page = await browser.newPage({
      viewport,
      baseURL: `http://${host}:${String(BENCH_PORT)}`,
    });
    page.setDefaultTimeout(0);
    await openAutomation(page);
    const adapter = await callAutomation(page, 'adapter');
    if (adapter === null) {
      throw new Error('The browser exposed no WebGPU adapter');
    }
    const rows = await page.evaluate(
      ([source, input]) => {
        const run = (0, eval)(source) as (value: unknown) => Promise<SceneViewRow[]>;
        return run(input);
      },
      [
        MEASURE_SOURCE,
        { specs: SCENE_VIEW_SPECS, repeats: CAPTURE_REPEATS, frames: FRAME_SAMPLES },
      ] as const,
    );
    return {
      browser: `${browser.browserType().name()} ${browser.version()}`,
      adapter,
      viewport,
      rows,
    };
  } finally {
    await browser.close();
    server.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emit = valueOf(argv, '--emit-script');
  if (emit !== null) {
    writeFileSync(
      emit,
      `${JSON.stringify({ source: MEASURE_SOURCE, input: { specs: SCENE_VIEW_SPECS, repeats: CAPTURE_REPEATS, frames: FRAME_SAMPLES } }, null, 2)}\n`,
    );
    console.log(`Wrote the in-page script to ${emit}`);
    return;
  }
  const ingest = valueOf(argv, '--ingest');
  if (ingest !== null) {
    writeResults(
      JSON.parse(readFileSync(ingest, 'utf8')) as Payload,
      valueOf(argv, '--browser-label') ?? 'Windows host, headless system Chrome',
    );
    return;
  }
  writeResults(await measure(argv), null);
}

await main();
