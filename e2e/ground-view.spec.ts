import { expect, test, type Page } from '@playwright/test';
import { legendMaximum } from '../src/core/heatmap/ground-layout.ts';
import { paintScalarRaster } from '../src/core/heatmap/pixels.ts';
import { scalarGrid } from '../src/core/heatmap/scalar.ts';
import { callAutomation } from './automation.ts';

const CAPTURE = { width: 256, height: 96 };
const CHANNEL_TOLERANCE = 8;

async function openGround(page: Page, query = ''): Promise<void> {
  await page.goto(`/?automation${query === '' ? '' : `&${query}`}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
}

async function readbackAgreesWithCpu(page: Page): Promise<number> {
  const state = await callAutomation(page, 'appState');
  const frame = await callAutomation(page, 'groundFrame');
  const capture = await callAutomation(page, 'captureFrame', CAPTURE);
  expect(state?.maxima).not.toBeNull();
  expect(frame).not.toBeNull();
  expect(capture).not.toBeNull();
  const maxima = state?.maxima ?? null;
  if (state === null || maxima === null || frame === null || capture === null) {
    return 0;
  }
  const { quantity, mode, phaseDegrees } = state.settings;
  const scalars = scalarGrid(frame.values, {
    quantity,
    mode,
    phaseRadians: (phaseDegrees * Math.PI) / 180,
  });
  const expected = paintScalarRaster({
    scalars,
    nx: frame.grid.nx,
    nz: frame.grid.nz,
    width: CAPTURE.width,
    height: CAPTURE.height,
    maximum: legendMaximum(maxima[quantity], mode),
  });
  const probes = [
    [10, 10],
    [64, 30],
    [128, 48],
    [128, 20],
    [190, 70],
    [240, 85],
    [30, 48],
    [200, 48],
  ];
  const actual = Uint8Array.from(capture.pixels);
  for (const [column, row] of probes) {
    const offset = ((row ?? 0) * CAPTURE.width + (column ?? 0)) * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(
        (actual[offset + channel] ?? 0) - (expected[offset + channel] ?? 0),
      );
      expect(
        difference,
        `pixel ${String(column)},${String(row)} channel ${String(channel)}`,
      ).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
    }
  }
  const distinct = new Set<number>();
  for (let index = 0; index < actual.length; index += 4) {
    distinct.add(
      ((actual[index] ?? 0) << 16) | ((actual[index + 1] ?? 0) << 8) | (actual[index + 2] ?? 0),
    );
  }
  return distinct.size;
}

test.describe('the ground view on WebGPU', () => {
  test('draws a heatmap that is not blank and agrees with the CPU values', async ({ page }) => {
    await openGround(page);
    await expect(page.getByTestId('ground-caption')).toContainText('WebGPU, 512 by 1024');
    const distinct = await readbackAgreesWithCpu(page);
    expect(distinct).toBeGreaterThan(40);
  });

  test('the magnetic and instantaneous heatmaps also agree with the CPU values', async ({
    page,
  }) => {
    await openGround(page, 'v=1&q=b&r=inst&ang=60');
    await callAutomation(page, 'setPhase', 60);
    expect((await callAutomation(page, 'appState'))?.playing).toBe(false);
    expect(await readbackAgreesWithCpu(page)).toBeGreaterThan(40);
  });

  test('the electric field scales linearly with the line voltage', async ({ page }) => {
    await openGround(page);
    const base = await callAutomation(page, 'appState');
    await callAutomation(page, 'setParameters', { lineToLineKilovolts: 200 });
    const half = await callAutomation(page, 'appState');
    expect(base?.maxima?.electric).toBeGreaterThan(0);
    const ratio = (base?.maxima?.electric ?? 0) / (half?.maxima?.electric ?? 1);
    expect(ratio).toBeCloseTo(2, 3);
    const magneticRatio = (base?.maxima?.magnetic ?? 0) / (half?.maxima?.magnetic ?? 1);
    expect(magneticRatio).toBeCloseTo(1, 3);
  });

  test('a parameter change updates the grid', async ({ page }) => {
    await openGround(page);
    const before = await callAutomation(page, 'groundFrame');
    await callAutomation(page, 'setParameters', { currentAmperes: 2000 });
    const after = await callAutomation(page, 'groundFrame');
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    const changed = after?.values.some((value, index) => value !== before?.values[index]);
    expect(changed).toBe(true);
    expect(after?.grid.nx).toBe(before?.grid.nx);
  });

  test('typing in the panel recomputes the field and writes the link', async ({ page }) => {
    await openGround(page);
    const before = await page.getByTestId('ground-probe').textContent();
    const voltage = page.getByLabel('Line voltage', { exact: true });
    await voltage.fill('500');
    await voltage.blur();
    await callAutomation(page, 'settle');
    await expect(page.getByTestId('ground-probe')).not.toHaveText(before ?? '');
    await expect.poll(() => page.url()).toContain('kv=500');
  });

  test('reloading the link restores the state', async ({ page }) => {
    await openGround(page);
    await page.getByLabel('Line voltage', { exact: true }).fill('450');
    await page.getByLabel('Magnetic (B)').check();
    await page.getByLabel('Instantaneous').check();
    await callAutomation(page, 'settle');
    await expect.poll(() => page.url()).toContain('q=b');
    await page.reload();
    await page.waitForFunction(() => 'fieldline' in window);
    await callAutomation(page, 'settle');
    await expect(page.getByLabel('Line voltage', { exact: true })).toHaveValue('450');
    await expect(page.getByLabel('Magnetic (B)')).toBeChecked();
    await expect(page.getByLabel('Instantaneous')).toBeChecked();
  });

  test('the keyboard switches quantity, mode, phase and the help dialog', async ({ page }) => {
    await openGround(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('b');
    await expect(page.getByLabel('Magnetic (B)')).toBeChecked();
    await page.keyboard.press('e');
    await expect(page.getByLabel('Electric (E)')).toBeChecked();
    await page.keyboard.press('r');
    await expect(page.getByLabel('Instantaneous')).toBeChecked();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    const start = (await callAutomation(page, 'appState'))?.settings.phaseDegrees ?? 0;
    await page.keyboard.press(']');
    await page.keyboard.press(']');
    await expect
      .poll(async () => (await callAutomation(page, 'appState'))?.settings.phaseDegrees)
      .toBeCloseTo((start + 30) % 360, 3);
    await page.keyboard.press('[');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the arrow keys move the probe and the readout follows', async ({ page }) => {
    await openGround(page, 'v=1&r=rms');
    const stage = page.getByRole('group', { name: /Ground field map/ });
    await stage.focus();
    const before = await page.getByTestId('ground-probe').textContent();
    await stage.press('ArrowUp');
    await stage.press('ArrowRight');
    await stage.press('Shift+ArrowRight');
    await expect(page.getByTestId('ground-probe')).not.toHaveText(before ?? '');
  });

  test('exposes landmarks, a single roving tab and a live summary', async ({ page }) => {
    await openGround(page);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Parameters' })).toBeVisible();
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(6);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.first()).toHaveAttribute('tabindex', '0');
    await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');
    await expect(tabs.nth(2)).toHaveAttribute('tabindex', '-1');
    const summary = page.getByRole('status', { name: 'Ground field summary' });
    await expect(summary).toContainText('peak E');
    await expect(summary).toContainText('Poland residential');
  });

  test('the 2D cross-section model does not change the picture across the line', async ({
    page,
  }) => {
    await openGround(page, 'v=1&m=cross-section-2d');
    await expect(page.getByTestId('ground-caption')).toContainText('2D cross-section');
    const frame = await callAutomation(page, 'groundFrame');
    expect(frame?.grid.nz).toBe(2);
  });
});
