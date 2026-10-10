import { expect, test } from '@playwright/test';
import { PARITY_TARGET } from '../src/core/validation/parity.ts';
import { TOWER_KINDS } from '../src/core/geometry/tower.ts';
import { callAutomation, openAutomation } from './automation.ts';

const groundSize = { nx: 128, nz: 256 };
const volumeSize = { nx: 16, ny: 16, nz: 32 };

test.describe('GPU field kernels against the float64 reference', () => {
  test('the automation hook describes the adapter', async ({ page }) => {
    await openAutomation(page);
    const adapter = await callAutomation(page, 'adapter');
    expect(adapter).not.toBeNull();
    expect(adapter?.maxComputeInvocationsPerWorkgroup).toBeGreaterThanOrEqual(256);
    expect(adapter?.software).toBe(true);
  });

  for (const tower of TOWER_KINDS) {
    test(`${tower}: ground, volume, profile and clamp zone agree within ${String(PARITY_TARGET)}`, async ({
      page,
    }) => {
      await openAutomation(page);
      const run = await callAutomation(page, 'runParity', {
        tower,
        ground: groundSize,
        volume: volumeSize,
      });
      expect(run.scenarios.map((scenario) => scenario.scenario)).toEqual([
        'ground',
        'volume',
        'profile',
        'clamp',
      ]);
      for (const scenario of run.scenarios) {
        expect(scenario.finite, scenario.scenario).toBe(true);
        expect(scenario.electric.comparedPoints, scenario.scenario).toBeGreaterThan(0);
        expect(scenario.electric.maximum, `${scenario.scenario} E`).toBeLessThan(PARITY_TARGET);
        expect(scenario.magnetic.maximum, `${scenario.scenario} B`).toBeLessThan(PARITY_TARGET);
      }
    });

    test(`${tower}: mirrored phasing gives the mirrored grid`, async ({ page }) => {
      await openAutomation(page);
      const run = await callAutomation(page, 'runMirror', { tower, ground: groundSize });
      expect(run.electric.comparedPoints).toBeGreaterThan(1000);
      expect(run.electric.maximum).toBeLessThan(PARITY_TARGET);
      expect(run.magnetic.maximum).toBeLessThan(PARITY_TARGET);
    });
  }

  test('the profile line has 241 points', async ({ page }) => {
    await openAutomation(page);
    const run = await callAutomation(page, 'runParity', {
      tower: 'horizontal',
      scenarios: ['profile'],
    });
    expect(run.scenarios[0]?.pointCount).toBe(241);
  });

  test('the kernel timing run reports one row per size and variant', async ({ page }) => {
    await openAutomation(page);
    const rows = await callAutomation(page, 'runKernelBench', {
      tower: 'horizontal',
      segmentsPerSpan: [6],
      ground: [{ nx: 64, nz: 128 }],
      volume: [{ nx: 8, ny: 8, nz: 16 }],
      variants: [
        { tiled: true, groundWorkgroup: 8 },
        { tiled: false, groundWorkgroup: 16 },
      ],
      repeats: 2,
    });
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.wallMedianMilliseconds).toBeGreaterThan(0);
      expect(row.gpuMedianMilliseconds).not.toBeNull();
    }
  });
});
