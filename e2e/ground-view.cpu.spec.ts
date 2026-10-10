import { expect, test, type Page } from '@playwright/test';
import { callAutomation } from './automation.ts';

async function openCpu(page: Page, query = ''): Promise<void> {
  await page.goto(`/?automation${query === '' ? '' : `&${query}`}`);
  await page.waitForFunction(() => 'fieldline' in window);
  await page.evaluate(
    () => (window as unknown as { fieldline: { ready: Promise<void> } }).fieldline.ready,
  );
  await callAutomation(page, 'settle');
}

test.describe('the ground view without a graphics adapter', () => {
  test('explains the fallback and still draws the heatmap on Canvas2D', async ({ page }) => {
    await openCpu(page);
    await expect(page.getByTestId('fallback-notice')).toContainText('computed on the CPU');
    await expect(page.getByTestId('ground-caption')).toContainText('CPU fallback, 128 by 256');
    const colours = await page.locator('canvas.heat').evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        return 0;
      }
      const context = canvas.getContext('2d');
      const data = context?.getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Set<number>();
      for (let index = 0; data !== undefined && index < data.length; index += 4) {
        seen.add(
          ((data[index] ?? 0) << 16) | ((data[index + 1] ?? 0) << 8) | (data[index + 2] ?? 0),
        );
      }
      return seen.size;
    });
    expect(colours).toBeGreaterThan(40);
  });

  test('the probe and the summary carry the profile numbers', async ({ page }) => {
    await openCpu(page);
    const probe = page.getByTestId('ground-probe');
    await expect(probe).toContainText('Probe at x = 0 m, z = 450 m, 1 m above ground (rms)');
    await expect(probe).toContainText('E 0.76 kV/m');
    await expect(probe).toContainText('B 7.75 µT');
    const summary = page.getByTestId('ground-summary');
    await expect(summary).toContainText('peak E 2.26 kV/m');
    await expect(summary).toContainText('peak B 7.75 µT');
    await expect(summary).toContainText('1 kV/m (Poland residential): exceeded at x from');
  });

  test('a parameter change recomputes on the CPU', async ({ page }) => {
    await openCpu(page);
    const before = await page.getByTestId('ground-summary').textContent();
    await callAutomation(page, 'setParameters', { lineToLineKilovolts: 220 });
    await expect(page.getByTestId('ground-summary')).not.toHaveText(before ?? '');
    const state = await callAutomation(page, 'appState');
    expect(state?.backend).toBe('cpu');
    expect(state?.status).toBe('ready');
  });

  test('the legend lists dashed levels so colour is not the only cue', async ({ page }) => {
    await openCpu(page);
    const levels = page.getByRole('list', { name: 'Contour levels' });
    await expect(levels).toContainText('solid');
    await expect(levels).toContainText('long dashes');
    await expect(levels).toContainText('short dashes');
  });
});
