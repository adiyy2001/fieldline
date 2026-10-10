import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callAutomation } from '../e2e/automation';
import type { AdapterReport } from '../src/app/automation/automation-types';
import { evaluateScript, valueOf, withAutomationPage } from './browser-run';
import { describeEnvironment } from './environment';
import {
  FRAME_SOURCE,
  FRAME_VIEWPORT,
  frameInputFor,
  summarizeFrames,
  type FrameViewRow,
} from './frame-measure';
import { adapterSlug } from './gpu-plan';

const resultsDirectory = join(import.meta.dirname, 'results');
const BENCH_PORT = Number(process.env['FIELDLINE_BENCH_PORT'] ?? 4336);

interface Payload {
  readonly browser: string;
  readonly adapter: AdapterReport;
  readonly viewport: typeof FRAME_VIEWPORT;
  readonly warmupFrames?: number;
  readonly rows: readonly FrameViewRow[];
}

function writeResults(payload: Payload, hostLabel: string | null): void {
  const slug = adapterSlug(payload.adapter);
  const summaries = payload.rows.map(summarizeFrames);
  mkdirSync(resultsDirectory, { recursive: true });
  writeFileSync(
    join(resultsDirectory, `frame-times-${slug}.json`),
    `${JSON.stringify(
      {
        environment: describeEnvironment(),
        runHost: hostLabel ?? 'same machine as the environment block',
        browser: payload.browser,
        adapter: payload.adapter,
        viewport: payload.viewport,
        frames: payload.rows[0]?.frameIntervals.length ?? 0,
        warmupFrames: payload.warmupFrames ?? frameInputFor(payload.adapter.software).warmupFrames,
        drivers: {
          phase: 'the phase clock advances the instantaneous field once per frame',
          orbit: 'a camera key press is sent before every frame',
        },
        summary: summaries,
        raw: payload.rows,
      },
      null,
      2,
    )}\n`,
  );
  console.table(summaries);
  console.log(`Wrote bench/results/frame-times-${slug}.json`);
}

async function measure(argv: readonly string[]): Promise<Payload> {
  return withAutomationPage(
    {
      channel: valueOf(argv, '--channel'),
      realGpu: argv.includes('--real-gpu'),
      mode: 'gpu',
      viewport: FRAME_VIEWPORT,
      port: BENCH_PORT,
    },
    async ({ page, browserName }) => {
      const adapter = await callAutomation(page, 'adapter');
      if (adapter === null) {
        throw new Error('The browser exposed no WebGPU adapter');
      }
      const input = frameInputFor(adapter.software);
      const rows = await evaluateScript<readonly FrameViewRow[]>(page, FRAME_SOURCE, input);
      return {
        browser: browserName,
        adapter,
        viewport: FRAME_VIEWPORT,
        warmupFrames: input.warmupFrames,
        rows,
      };
    },
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emit = valueOf(argv, '--emit-script');
  if (emit !== null) {
    writeFileSync(
      emit,
      `${JSON.stringify({ source: FRAME_SOURCE, input: frameInputFor(false) }, null, 2)}\n`,
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
