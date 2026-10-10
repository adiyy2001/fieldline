import { expect, test } from '@playwright/test';
import { TOWER_KINDS } from '../src/core/geometry/tower.ts';
import { callAutomation, openAutomation } from './automation.ts';

test.describe('the CPU backend in a browser without WebGPU', () => {
  test('the hook is installed and reports no adapter', async ({ page }) => {
    await openAutomation(page);
    expect(await callAutomation(page, 'adapter')).toBeNull();
  });

  for (const tower of TOWER_KINDS) {
    test(`${tower}: the worker pool produces the grid of a single evaluation`, async ({ page }) => {
      await openAutomation(page);
      const run = await callAutomation(page, 'runCpuPool', {
        tower,
        grid: { nx: 64, nz: 128 },
      });
      expect(run.pointCount).toBe(64 * 128);
      expect(run.identical).toBe(true);
      expect(run.electric.comparedPoints).toBeGreaterThan(1000);
    });
  }

  test('a parity run is refused without an adapter', async ({ page }) => {
    await openAutomation(page);
    const message = await page.evaluate(async () => {
      const api = (window as unknown as { fieldline: { runParity(r: unknown): Promise<unknown> } })
        .fieldline;
      try {
        await api.runParity({ tower: 'horizontal' });
        return 'accepted';
      } catch (error) {
        return error instanceof Error ? error.message : 'failed';
      }
    });
    expect(message).toContain('No WebGPU device');
  });
});
