import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { webGpuLaunchArguments } from './chromium-flags';
import {
  ACCESSIBILITY_THRESHOLD,
  type AuditResult,
  CATEGORIES,
  type Category,
  FORM_FACTORS,
  type FormFactor,
  type Renderer,
  belowThreshold,
  describeScores,
} from './lighthouse-scores';
import { createDistServer, host } from './serve-dist';

const SERVER_PORT = Number(process.env['FIELDLINE_LIGHTHOUSE_PORT'] ?? 4332);
const DEBUGGING_PORT = Number(process.env['FIELDLINE_LIGHTHOUSE_DEBUG_PORT'] ?? 4337);
const resultPath = join('bench', 'results', 'lighthouse.json');

interface RendererSetup {
  readonly renderer: Renderer;
  readonly flags: readonly string[];
}

const SETUPS: readonly RendererSetup[] = [
  { renderer: 'webgpu', flags: webGpuLaunchArguments },
  { renderer: 'fallback', flags: [] },
];

const SCREENS = {
  mobile: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  desktop: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
} as const;

async function audit(
  renderer: Renderer,
  formFactor: FormFactor,
  url: string,
): Promise<AuditResult> {
  const run = await lighthouse(url, {
    port: DEBUGGING_PORT,
    output: 'json',
    logLevel: 'error',
    onlyCategories: [...CATEGORIES],
    formFactor,
    screenEmulation: SCREENS[formFactor],
    throttlingMethod: 'provided',
    maxWaitForLoad: 60_000,
  });
  if (run === undefined) {
    throw new Error('Lighthouse returned no result');
  }
  const { lhr } = run;
  const scoreOf = (id: Category): number | null => lhr.categories[id]?.score ?? null;
  const failed = (['accessibility', 'best-practices'] as const).flatMap((category) =>
    (lhr.categories[category]?.auditRefs ?? []).flatMap((reference) => {
      const entry = lhr.audits[reference.id];
      return entry?.score !== null && entry?.score !== undefined && entry.score < 1
        ? [{ category, id: entry.id, title: entry.title, score: entry.score }]
        : [];
    }),
  );
  return {
    renderer,
    formFactor,
    scores: {
      accessibility: scoreOf('accessibility'),
      'best-practices': scoreOf('best-practices'),
      seo: scoreOf('seo'),
      performance: scoreOf('performance'),
    },
    failedAudits: failed,
  };
}

async function main(): Promise<void> {
  const server = createDistServer(resolve('dist/fieldline/browser'));
  await new Promise<void>((done) => {
    server.listen(SERVER_PORT, host, done);
  });
  try {
    const results: AuditResult[] = [];
    const browsers: { renderer: Renderer; chromium: string; flags: readonly string[] }[] = [];
    for (const setup of SETUPS) {
      const browser = await chromium.launch({
        args: [...setup.flags, `--remote-debugging-port=${String(DEBUGGING_PORT)}`],
      });
      try {
        browsers.push({
          renderer: setup.renderer,
          chromium: browser.version(),
          flags: setup.flags,
        });
        for (const formFactor of FORM_FACTORS) {
          results.push(
            await audit(setup.renderer, formFactor, `http://${host}:${String(SERVER_PORT)}/`),
          );
        }
      } finally {
        await browser.close();
      }
    }
    mkdirSync('bench/results', { recursive: true });
    writeFileSync(
      resultPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          node: process.version,
          platform: `${platform()} ${release()} ${arch()}`,
          cpu: cpus()[0]?.model ?? 'unknown',
          browsers,
          threshold: ACCESSIBILITY_THRESHOLD,
          note: 'The webgpu runs use the software adapter and the fallback runs have no adapter at all, so the page renders on the worker pool. Performance runs with simulated throttling off and says nothing about real GPUs.',
          results,
        },
        null,
        2,
      )}\n`,
    );
    for (const result of results) {
      console.log(describeScores(result));
    }
    const failing = belowThreshold(results);
    if (failing.length > 0) {
      console.error(
        `Accessibility below ${String(ACCESSIBILITY_THRESHOLD)}: ${failing.join(', ')}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
    });
  }
}

await main();
