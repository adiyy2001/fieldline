import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { GPU_GRID_SIZE, VOLUME_SIZE } from '../src/core/backend/regions.ts';
import { TOWER_KINDS } from '../src/core/geometry/tower.ts';
import { PARITY_TARGET } from '../src/core/validation/parity.ts';
import { callAutomation } from './automation.ts';

const root = join(import.meta.dirname, '..');
const distribution = join(root, 'dist', 'fieldline', 'browser');
const results = join(root, 'bench', 'results');

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/?automation${query === '' ? '' : `&${query}`}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
}

async function type(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.blur();
  await callAutomation(page, 'settle');
}

async function electricPeak(page: Page): Promise<number> {
  return (await callAutomation(page, 'appState'))?.maxima?.electric ?? Number.NaN;
}

async function magneticPeak(page: Page): Promise<number> {
  return (await callAutomation(page, 'appState'))?.maxima?.magnetic ?? Number.NaN;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

async function distinctColours(page: Page, width: number, height: number): Promise<number> {
  const capture = await callAutomation(page, 'captureFrame', { width, height });
  const colours = new Set<number>();
  const pixels = capture?.pixels ?? new Uint8Array();
  for (let index = 0; index < pixels.length; index += 4) {
    colours.add(
      ((pixels[index] ?? 0) << 16) | ((pixels[index + 1] ?? 0) << 8) | (pixels[index + 2] ?? 0),
    );
  }
  return colours.size;
}

async function openScene(page: Page, query: string): Promise<void> {
  await open(page, query);
  await expect(page.getByTestId('scene-summary')).not.toBeEmpty({ timeout: 60_000 });
  const pause = page.getByTestId('scene-pause');
  if ((await pause.getAttribute('aria-pressed')) === 'false') {
    await pause.click();
  }
}

test.describe('must have: modelling', () => {
  test('parametric towers: horizontal, delta and double circuit with editable dimensions', async ({
    page,
  }) => {
    await open(page);
    for (const kind of TOWER_KINDS) {
      await page.selectOption('#fl-tower', kind);
      await callAutomation(page, 'settle');
      const state = await callAutomation(page, 'appState');
      expect(state?.parameters.tower.kind).toBe(kind);
      await expect(page.locator('#fl-phasing-0')).toBeVisible();
      await expect(page.locator('#fl-phasing-5')).toHaveCount(kind === 'double-circuit' ? 1 : 0);
      const dimension = page.getByRole('group', { name: 'Tower' }).getByRole('spinbutton').first();
      const before = JSON.stringify(state?.parameters.tower);
      const value = Number(await dimension.inputValue());
      await dimension.fill(String(value + 1));
      await dimension.blur();
      await callAutomation(page, 'settle');
      expect(JSON.stringify((await callAutomation(page, 'appState'))?.parameters.tower)).not.toBe(
        before,
      );
    }
  });

  test('two or three spans, catenary sag, bundles of one to four and shield wires', async ({
    page,
  }) => {
    await open(page);
    for (const count of [2, 3]) {
      await page.selectOption('#fl-spans', String(count));
      await callAutomation(page, 'settle');
      expect((await callAutomation(page, 'appState'))?.parameters.spanLengths).toHaveLength(count);
    }
    await type(page, 'Sag', '14');
    expect((await callAutomation(page, 'appState'))?.parameters.phaseSag).toBe(14);
    await type(page, 'Shield wire sag ratio', '0.8');
    expect((await callAutomation(page, 'appState'))?.parameters.shieldSagRatio).toBe(0.8);
    const peaks: number[] = [];
    for (const count of [1, 2, 3, 4]) {
      await type(page, 'Subconductors per bundle', String(count));
      expect((await callAutomation(page, 'appState'))?.parameters.bundleCount).toBe(count);
      peaks.push(await electricPeak(page));
    }
    expect(new Set(peaks.map((peak) => peak.toFixed(4))).size).toBe(4);
    const diameter = await page.getByLabel('Shield wire diameter', { exact: true }).inputValue();
    expect(Number(diameter)).toBeGreaterThan(0);
  });

  test('phasors with an rms display and a slowly animated instantaneous view', async ({ page }) => {
    await open(page, 'v=1&r=inst');
    const state = await callAutomation(page, 'appState');
    expect(state?.settings.mode).toBe('instantaneous');
    expect(state?.playing).toBe(true);
    const start = state?.settings.phaseDegrees ?? 0;
    await expect
      .poll(async () => (await callAutomation(page, 'appState'))?.settings.phaseDegrees)
      .not.toBe(start);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByLabel('Rms').check();
    expect((await callAutomation(page, 'appState'))?.settings.mode).toBe('rms');
  });

  test('2D Maxwell model with images, equivalent bundle radius and shield wires at 0 V', async ({
    page,
  }) => {
    await open(page, 'v=1&m=cross-section-2d');
    await expect(page.getByTestId('ground-caption')).toContainText('2D cross-section');
    const state = await callAutomation(page, 'appState');
    expect(state?.backend).toBe('cross-section');
    const peak = state?.maxima?.electric ?? Number.NaN;
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThan(10);
    const validation = readJson(join(results, 'physics-validation.json'));
    const report = validation['report'] as { summary: Record<string, unknown> };
    expect(report.summary['analyticPassed']).toBe(true);
    expect(report.summary['allWithinTolerance']).toBe(true);
  });

  test('3D charge simulation solved in a worker in float64', async ({ page }) => {
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    await open(page);
    expect(workers.length).toBeGreaterThan(0);
    const state = await callAutomation(page, 'appState');
    expect(state?.timings?.solveMilliseconds).toBeGreaterThan(0);
    expect(state?.status).toBe('ready');
    const solveTiming = readJson(join(results, 'solve-timing.json'));
    expect(Object.keys(solveTiming).length).toBeGreaterThan(0);
  });

  test('Biot-Savart on segments with the earth return ignored: B follows the current only', async ({
    page,
  }) => {
    await open(page, 'v=1&q=b');
    const base = await magneticPeak(page);
    expect(base).toBeGreaterThan(1);
    await type(page, 'Current per phase', '2000');
    expect(await magneticPeak(page)).toBeCloseTo(2 * base, 0);
    const physics = readFileSync(join(root, 'docs', 'physics.md'), 'utf8');
    expect(physics).toContain('earth return');
  });

  test('singularity clamp inside the conductor radius stays finite on both backends', async ({
    page,
  }) => {
    await open(page);
    const run = await callAutomation(page, 'runParity', {
      tower: 'horizontal',
      scenarios: ['clamp'],
    });
    const clamp = run.scenarios[0];
    expect(clamp?.finite).toBe(true);
    expect(clamp?.electric.maximum).toBeLessThan(PARITY_TARGET);
    expect(clamp?.magnetic.maximum).toBeLessThan(PARITY_TARGET);
  });
});

test.describe('must have: exposure and results', () => {
  test('exposure contours with ICNIRP 2010 by default, presets and custom levels', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByLabel('Emphasised standard')).toHaveValue('icnirp-2010');
    const presets = await page.locator('#fl-preset option').allTextContents();
    expect(presets.length).toBeGreaterThanOrEqual(4);
    await page.selectOption('#fl-preset', 'poland-residential');
    await expect(page.getByTestId('ground-summary')).toContainText('Poland residential');
    await page.getByLabel('Level', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Add level' }).click();
    await expect(page.getByTestId('level-message')).toContainText('Added 3 kV/m');
    await expect(page).toHaveURL(/cl=e/);
    await expect(page.getByRole('region', { name: /Electric/ }).first()).toBeVisible();
  });

  test('lateral profile at mid-span and 1 m with a chart, a table alternative and CSV', async ({
    page,
  }) => {
    await open(page, 'v=1&w=profile');
    await expect(page.getByRole('heading', { name: 'Lateral profile' })).toBeVisible();
    await expect(page.locator('fl-line-chart').first()).toBeVisible();
    await page.getByRole('button', { name: 'Data table' }).click();
    await expect(page.locator('[data-testid="profile-table"] tbody tr')).toHaveCount(241);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    expect((await downloading).suggestedFilename()).toBe('fieldline-profile.csv');
  });

  test('phasing optimizer for double circuits with a ranking, best against worst and an explanation', async ({
    page,
  }) => {
    await open(page, 'v=1&w=optimizer&t=dc');
    await expect(page.locator('[data-testid="optimizer-table"] tbody tr')).toHaveCount(6);
    await expect(page.locator('tr.worst')).toContainText('worst');
    await expect(page.getByTestId('optimizer-explanation')).not.toBeEmpty();
  });
});

test.describe('must have: compute and 3D views', () => {
  test('WGSL compute for a 1024 by 512 ground grid and a 128 by 64 by 64 volume with a tiled segment buffer', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await open(page);
    await expect(page.getByTestId('ground-caption')).toContainText(
      `${String(GPU_GRID_SIZE.nx)} by ${String(GPU_GRID_SIZE.nz)}`,
    );
    const rows = await callAutomation(page, 'runKernelBench', {
      tower: 'horizontal',
      segmentsPerSpan: [12],
      ground: [GPU_GRID_SIZE],
      volume: [VOLUME_SIZE],
      variants: [{ tiled: true, groundWorkgroup: 8 }],
      repeats: 1,
    });
    const ground = rows.find((row) => row.kernel === 'ground');
    const volume = rows.find((row) => row.kernel === 'volume');
    expect(ground?.pointCount).toBe(1024 * 512);
    expect(volume?.pointCount).toBe(128 * 64 * 64);
    expect(ground?.tiled).toBe(true);
    expect(volume?.tiled).toBe(true);
  });

  test('ground heatmap with contours', async ({ page }) => {
    await open(page);
    expect(await distinctColours(page, 256, 96)).toBeGreaterThan(30);
    await expect(page.getByRole('list', { name: 'Contour levels' })).toContainText('solid');
    await expect(page.getByTestId('ground-summary')).toContainText('peak E');
  });

  test('volume ray marching with a transfer function', async ({ page }) => {
    await openScene(page, 'v=1&w=volume');
    await expect(page.getByTestId('scene-summary')).toContainText('Volume rendering');
    await page.getByLabel('Threshold').fill('0.5');
    await expect(page.getByTestId('threshold-value')).toHaveText('50 percent');
    expect(await distinctColours(page, 160, 100)).toBeGreaterThan(30);
  });

  test('isosurfaces from a compute marching-cubes pass', async ({ page }) => {
    await openScene(page, 'v=1&w=isosurface');
    await expect(page.getByTestId('scene-summary')).toContainText('at 3 exposure levels');
    expect(await distinctColours(page, 160, 100)).toBeGreaterThan(30);
  });

  test('field lines traced by RK4 in compute and animated over the cycle', async ({ page }) => {
    test.setTimeout(150_000);
    await openScene(page, 'v=1&w=lines&ang=30');
    await expect(page.getByTestId('scene-summary')).toContainText('electric field lines');
    const before = (await callAutomation(page, 'appState'))?.settings.phaseDegrees;
    await page.getByTestId('scene-pause').click();
    await expect
      .poll(async () => (await callAutomation(page, 'appState'))?.settings.phaseDegrees)
      .not.toBe(before);
  });

  test('ADR for raw WebGPU against three.js', () => {
    const adr = readFileSync(join(root, 'docs', 'adr', '0006-raw-webgpu-no-threejs.md'), 'utf8');
    expect(adr).toMatch(/three\.js/i);
    const bundle = readdirSync(distribution)
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(join(distribution, name), 'utf8'))
      .join('');
    expect(bundle).not.toMatch(/WebGPURenderer/);
  });

  test('CPU fallback in a worker with a coarser grid behind the same interface', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
    await open(page);
    const state = await callAutomation(page, 'appState');
    expect(state?.backend).toBe('cpu');
    expect(state?.grid?.nx).toBeLessThan(GPU_GRID_SIZE.nx);
    await expect(page.getByTestId('fallback-notice')).toBeVisible();
    await expect(page.getByTestId('ground-caption')).toContainText('CPU');
  });
});

test.describe('must have: interface, validation and delivery', () => {
  test('UI with a parameter panel, view switcher, chart with table, optimizer table, URL state and keyboard', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByRole('form', { name: 'Line and display parameters' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(6);
    await page.getByRole('tab', { name: /Profile/ }).click();
    await expect(page.getByRole('button', { name: 'Data table' })).toBeVisible();
    await page.getByRole('tab', { name: /Phasing/ }).click();
    await expect(page.getByTestId('optimizer-unsupported')).toBeVisible();
    await expect.poll(() => page.url()).toContain('w=optimizer');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('validation list: analytic, convergence, symmetry, GPU against CPU and the published reference', async ({
    page,
  }) => {
    const validation = readJson(join(results, 'physics-validation.json'));
    const summary = (validation['report'] as { summary: Record<string, unknown> }).summary;
    expect(summary['analyticPassed']).toBe(true);
    expect(summary['publishedCases']).toBe(14);
    expect(summary['allWithinTolerance']).toBe(true);
    expect(summary['rankingViolations']).toBe(0);
    expect(existsSync(join(results, 'convergence.json'))).toBe(true);
    expect(existsSync(join(root, 'docs', 'img', 'convergence-segments.svg'))).toBe(true);
    await open(page);
    const run = await callAutomation(page, 'runMirror', {
      tower: 'double-circuit',
      ground: { nx: 64, nz: 128 },
    });
    expect(run.electric.maximum).toBeLessThan(PARITY_TARGET);
    const parity = readJson(join(results, 'gpu-parity-google-swiftshader.json'));
    expect((parity['summary'] as { withinTarget: boolean }).withinTarget).toBe(true);
  });

  test('tests: unit, properties, GPU parity, screenshot checks', () => {
    const manifest = readJson(join(root, 'package.json'));
    const dependencies = manifest['devDependencies'] as Record<string, string>;
    expect(dependencies['fast-check']).toBeDefined();
    expect(dependencies['vitest']).toBeDefined();
    expect(existsSync(join(root, 'e2e', 'gpu-parity.spec.ts'))).toBe(true);
    const baselines = readdirSync(join(root, 'e2e', 'baselines'));
    expect(baselines.filter((name) => name.endsWith('.png'))).toHaveLength(6);
  });

  test('targets measured and reported: under 200 ms and 60 fps on real adapters', () => {
    for (const slug of ['nvidia-ampere', 'intel-gen-12lp']) {
      const latency = readJson(join(results, `latency-${slug}.json`));
      const rows = latency['summary'] as { updateMedianMilliseconds: number }[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.updateMedianMilliseconds).toBeLessThan(200);
      }
      const frames = readJson(join(results, `frame-times-${slug}.json`));
      const views = frames['summary'] as { framesPerSecond: number }[];
      expect(views.length).toBeGreaterThan(0);
      for (const view of views) {
        expect(view.framesPerSecond).toBeGreaterThanOrEqual(59);
      }
    }
    expect(existsSync(join(results, 'latency-google-swiftshader.json'))).toBe(true);
    expect(existsSync(join(results, 'latency-cpu.json'))).toBe(true);
  });

  test('project specific done: physics document, plots from scripts and a static build for GitHub Pages', () => {
    const physics = readFileSync(join(root, 'docs', 'physics.md'), 'utf8');
    expect(physics).toContain('Biot');
    expect(physics.match(/\$\$/g)?.length ?? 0).toBeGreaterThan(20);
    expect(
      readdirSync(join(root, 'docs', 'img')).filter((name) => name.endsWith('.svg')),
    ).not.toHaveLength(0);
    const index = readFileSync(join(distribution, 'index.html'), 'utf8');
    expect(index).toContain('<base href="/">');
    expect(readFileSync(join(distribution, 'CNAME'), 'utf8').trim()).toBe(
      'fieldline.adrianturbinski.pl',
    );
    expect(readFileSync(join(root, '.github', 'workflows', 'pages.yml'), 'utf8')).toContain(
      '404.html',
    );
  });
});
