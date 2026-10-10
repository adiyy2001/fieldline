import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { webGpuLaunchArguments } from '../scripts/chromium-flags';
import { openAutomation } from '../e2e/automation';
import { createDistServer, host } from '../scripts/serve-dist';
import { PARITY_TARGET } from '../src/core/validation/parity';
import { describeEnvironment } from './environment';
import {
  adapterSlug,
  buildPlan,
  collectResults,
  summarizeParity,
  type PlanResults,
  type PlanStep,
} from './gpu-plan';

const resultsDirectory = join(import.meta.dirname, 'results');
const BENCH_PORT = Number(process.env['FIELDLINE_BENCH_PORT'] ?? 4333);
const REAL_GPU_ARGUMENTS = [
  '--enable-unsafe-webgpu',
  '--force_high_performance_gpu',
  '--enable-webgpu-developer-features',
];

interface Options {
  readonly channel: string | null;
  readonly realGpu: boolean;
  readonly emitPlan: string | null;
  readonly ingest: string | null;
  readonly browserLabel: string | null;
}

function parseOptions(argv: readonly string[]): Options {
  const valueOf = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };
  return {
    channel: valueOf('--channel'),
    realGpu: argv.includes('--real-gpu'),
    emitPlan: valueOf('--emit-plan'),
    ingest: valueOf('--ingest'),
    browserLabel: valueOf('--browser-label'),
  };
}

async function runStep(page: Page, step: PlanStep): Promise<unknown> {
  return page.evaluate(
    ([method, request]) => {
      const api = (
        window as unknown as { fieldline: Record<string, (value: unknown) => Promise<unknown>> }
      ).fieldline;
      const call = api[method];
      if (call === undefined) {
        throw new Error(`fieldline.${method} is missing`);
      }
      return call(request);
    },
    [step.method, 'request' in step ? step.request : undefined] as const,
  );
}

async function runPlanInBrowser(options: Options): Promise<{
  readonly outputs: readonly unknown[];
  readonly browser: string;
}> {
  const root = resolve('dist/fieldline/browser');
  const server = createDistServer(root);
  await new Promise<void>((done) => {
    server.listen(BENCH_PORT, host, done);
  });
  const browser = await chromium.launch({
    ...(options.channel === null ? {} : { channel: options.channel }),
    args: options.realGpu ? REAL_GPU_ARGUMENTS : [...webGpuLaunchArguments],
  });
  try {
    const page = await browser.newPage({ baseURL: `http://${host}:${String(BENCH_PORT)}` });
    page.setDefaultTimeout(0);
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    await openAutomation(page);
    const outputs: unknown[] = [];
    for (const step of buildPlan()) {
      const started = performance.now();
      outputs.push(await runStep(page, step));
      console.log(
        `${step.method} finished in ${((performance.now() - started) / 1000).toFixed(1)} s`,
      );
    }
    if (failures.length > 0) {
      throw new Error(`The page raised errors: ${failures.join('; ')}`);
    }
    return { outputs, browser: `${browser.browserType().name()} ${browser.version()}` };
  } finally {
    await browser.close();
    server.close();
  }
}

function writeResults(results: PlanResults, browser: string, hostLabel: string | null): boolean {
  if (results.adapter === null) {
    console.error('The browser exposed no WebGPU adapter, nothing to write.');
    return false;
  }
  const slug = adapterSlug(results.adapter);
  const environment = describeEnvironment();
  const summary = summarizeParity(results);
  const common = {
    environment,
    runHost: hostLabel ?? 'same machine as the environment block',
    browser,
    adapter: results.adapter,
  };
  mkdirSync(resultsDirectory, { recursive: true });
  writeFileSync(
    join(resultsDirectory, `gpu-kernels-${slug}.json`),
    `${JSON.stringify({ ...common, rows: results.kernelRows }, null, 2)}\n`,
  );
  writeFileSync(
    join(resultsDirectory, `gpu-parity-${slug}.json`),
    `${JSON.stringify(
      {
        ...common,
        target: PARITY_TARGET,
        summary,
        runs: results.parityRuns,
        mirrorRuns: results.mirrorRuns,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nAdapter ${slug} (${results.adapter.description || results.adapter.device})`);
  console.log(
    `Maximum relative error: E ${summary.electricMaximum.toExponential(2)}, B ${summary.magneticMaximum.toExponential(2)}, mirror ${summary.mirrorMaximum.toExponential(2)} (target ${PARITY_TARGET.toExponential(0)})`,
  );
  console.log(`Wrote bench/results/gpu-kernels-${slug}.json and gpu-parity-${slug}.json`);
  return summary.withinTarget;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.emitPlan !== null) {
    writeFileSync(options.emitPlan, `${JSON.stringify(buildPlan(), null, 2)}\n`);
    console.log(`Wrote the plan to ${options.emitPlan}`);
    return;
  }
  const plan = buildPlan();
  if (options.ingest !== null) {
    const payload = JSON.parse(readFileSync(options.ingest, 'utf8')) as {
      readonly browser: string;
      readonly outputs: readonly unknown[];
    };
    const ok = writeResults(
      collectResults(plan, payload.outputs),
      payload.browser,
      options.browserLabel ?? 'Windows host, headless system Chrome',
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }
  const { outputs, browser } = await runPlanInBrowser(options);
  const ok = writeResults(collectResults(plan, outputs), browser, null);
  process.exitCode = ok ? 0 : 1;
}

await main();
