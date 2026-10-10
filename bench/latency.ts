import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callAutomation } from '../e2e/automation';
import type { AdapterReport } from '../src/app/automation/automation-types';
import { type BackendMode, evaluateScript, valueOf, withAutomationPage } from './browser-run';
import { describeEnvironment } from './environment';
import { adapterSlug } from './gpu-plan';
import {
  LATENCY_CASES,
  LATENCY_REPEATS,
  LATENCY_SOURCE,
  LATENCY_WARMUPS,
  UPDATE_TARGET_MILLISECONDS,
  summarizeLatency,
  type LatencyInput,
  type LatencyRow,
} from './latency-measure';

const resultsDirectory = join(import.meta.dirname, 'results');
const BENCH_PORT = Number(process.env['FIELDLINE_BENCH_PORT'] ?? 4335);
const VIEWPORT = { width: 1280, height: 800 };

interface Payload {
  readonly browser: string;
  readonly adapter: AdapterReport | null;
  readonly viewport: typeof VIEWPORT;
  readonly rows: readonly LatencyRow[];
}

const input: LatencyInput = {
  cases: LATENCY_CASES,
  warmups: LATENCY_WARMUPS,
  repeats: LATENCY_REPEATS,
};

function fileSlug(payload: Payload, mode: BackendMode): string {
  return mode === 'cpu' || payload.adapter === null ? 'cpu' : adapterSlug(payload.adapter);
}

function writeResults(payload: Payload, mode: BackendMode, hostLabel: string | null): void {
  const slug = fileSlug(payload, mode);
  const summaries = payload.rows.map(summarizeLatency);
  mkdirSync(resultsDirectory, { recursive: true });
  writeFileSync(
    join(resultsDirectory, `latency-${slug}.json`),
    `${JSON.stringify(
      {
        environment: describeEnvironment(),
        runHost: hostLabel ?? 'same machine as the environment block',
        browser: payload.browser,
        backend: mode,
        adapter: mode === 'gpu' ? payload.adapter : null,
        viewport: payload.viewport,
        target: { updateMillisecondsBelow: UPDATE_TARGET_MILLISECONDS },
        warmups: LATENCY_WARMUPS,
        repeats: LATENCY_REPEATS,
        summary: summaries,
        raw: payload.rows,
      },
      null,
      2,
    )}\n`,
  );
  console.table(summaries);
  console.log(`Wrote bench/results/latency-${slug}.json`);
  const missed = summaries.filter((summary) => !summary.withinTarget);
  console.log(
    missed.length === 0
      ? `Every case updated the fields in under ${String(UPDATE_TARGET_MILLISECONDS)} ms (median).`
      : `Cases at or above ${String(UPDATE_TARGET_MILLISECONDS)} ms (median): ${missed.map((summary) => summary.name).join(', ')}`,
  );
}

async function measure(argv: readonly string[], mode: BackendMode): Promise<Payload> {
  return withAutomationPage(
    {
      channel: valueOf(argv, '--channel'),
      realGpu: argv.includes('--real-gpu'),
      mode,
      viewport: VIEWPORT,
      port: BENCH_PORT,
    },
    async ({ page, browserName }) => {
      const adapter = mode === 'gpu' ? await callAutomation(page, 'adapter') : null;
      if (mode === 'gpu' && adapter === null) {
        throw new Error('The browser exposed no WebGPU adapter');
      }
      const rows = await evaluateScript<readonly LatencyRow[]>(page, LATENCY_SOURCE, input);
      return { browser: browserName, adapter, viewport: VIEWPORT, rows };
    },
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emit = valueOf(argv, '--emit-script');
  if (emit !== null) {
    writeFileSync(emit, `${JSON.stringify({ source: LATENCY_SOURCE, input }, null, 2)}\n`);
    console.log(`Wrote the in-page script to ${emit}`);
    return;
  }
  const ingest = valueOf(argv, '--ingest');
  if (ingest !== null) {
    const payload = JSON.parse(readFileSync(ingest, 'utf8')) as Payload;
    writeResults(
      payload,
      payload.adapter === null ? 'cpu' : 'gpu',
      valueOf(argv, '--browser-label') ?? 'Windows host, headless system Chrome',
    );
    return;
  }
  const requested = valueOf(argv, '--backend');
  const modes: readonly BackendMode[] =
    requested === 'gpu' || requested === 'cpu' ? [requested] : ['gpu', 'cpu'];
  for (const mode of modes) {
    console.log(`\nLatency on the ${mode} backend`);
    writeResults(await measure(argv, mode), mode, null);
  }
}

await main();
