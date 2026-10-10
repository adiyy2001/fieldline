import { expect, test } from '@playwright/test';
import { callAutomation, openAutomation } from './automation.ts';

const LINE_END = { running: 0, ground: 1, conductor: 2, domain: 3 } as const;
const END_DISTANCE_FRACTION = 1e-3;
const COLOUR_TOLERANCE = 6;
const SADDLE_LINES = 2;

test.describe('GPU isosurfaces', () => {
  test('a sphere gives the same triangles as the CPU extraction and the analytic area', async ({
    page,
  }) => {
    await openAutomation(page);
    const run = await callAutomation(page, 'runIsosurface', { source: 'sphere' });
    expect(run.levels).toHaveLength(3);
    for (const level of run.levels) {
      expect(level.triangleDifference, `level ${String(level.level)}`).toBe(0);
      expect(level.relativeAreaDifference).toBeLessThan(1e-3);
      expect(level.analyticArea).not.toBeNull();
      const analytic = level.analyticArea ?? 1;
      expect(Math.abs(level.gpuArea - analytic) / analytic).toBeLessThan(0.01);
      expect(level.produced).toBeLessThanOrEqual(level.capacity);
      expect(level.produced).toBe(level.gpuTriangles * 3);
    }
  });

  test('the field of a line gives the same triangles as the CPU extraction', async ({ page }) => {
    await openAutomation(page);
    const run = await callAutomation(page, 'runIsosurface', {
      source: 'line',
      tower: 'horizontal',
    });
    expect(run.peak).toBeGreaterThan(5);
    for (const level of run.levels) {
      expect(level.gpuTriangles).toBeGreaterThan(100);
      expect(level.triangleDifference).toBeLessThanOrEqual(Math.ceil(level.cpuTriangles * 1e-3));
      expect(level.relativeAreaDifference).toBeLessThan(1e-3);
    }
  });
});

test.describe('GPU ray marcher', () => {
  test('a synthetic sphere renders symmetrically with the expected centre colour', async ({
    page,
  }) => {
    await openAutomation(page);
    const run = await callAutomation(page, 'runVolumeImage', {});
    expect(run.mirrorDifference).toBeLessThanOrEqual(1);
    run.centre.slice(0, 3).forEach((channel, index) => {
      expect(Math.abs(channel - (run.expectedCentre[index] ?? 0))).toBeLessThanOrEqual(
        COLOUR_TOLERANCE,
      );
    });
    expect(run.corner.slice(0, 3)).toEqual(run.background);
    expect(run.centre.slice(0, 3)).not.toEqual(run.background);
  });

  test('viewing the sphere from the side gives the same centre colour', async ({ page }) => {
    await openAutomation(page);
    const front = await callAutomation(page, 'runVolumeImage', {});
    const side = await callAutomation(page, 'runVolumeImage', { yaw: Math.PI / 2 });
    side.centre.slice(0, 3).forEach((channel, index) => {
      expect(Math.abs(channel - (front.centre[index] ?? 0))).toBeLessThanOrEqual(COLOUR_TOLERANCE);
    });
  });
});

test.describe('GPU field lines', () => {
  test('electric lines follow the float64 tracer and start on the conductors', async ({ page }) => {
    await openAutomation(page);
    const run = await callAutomation(page, 'runFieldLines', {
      tower: 'horizontal',
      kind: 'electric',
      lineCount: 12,
      phaseDegrees: 30,
    });
    expect(run.lines).toHaveLength(12);
    const converged = run.lines.filter((line) => line.endFraction < END_DISTANCE_FRACTION);
    expect(converged.length).toBeGreaterThanOrEqual(run.lines.length - SADDLE_LINES);
    for (const line of run.lines) {
      expect(line.gpuEnd).toBe(line.cpuEnd);
      expect(line.gpuPointCount).toBe(line.cpuPointCount);
      expect(line.startClearance).toBeGreaterThan(1.9);
      expect(line.startClearance).toBeLessThan(2.1);
      if (line.startsDownward) {
        expect([LINE_END.ground, LINE_END.conductor]).toContain(line.gpuEnd);
      }
    }
  });

  test('magnetic lines wind around the conductors and agree with the CPU', async ({ page }) => {
    await openAutomation(page);
    const run = await callAutomation(page, 'runFieldLines', {
      tower: 'delta',
      kind: 'magnetic',
      lineCount: 12,
      phaseDegrees: 0,
    });
    for (const line of run.lines) {
      expect(line.endFraction).toBeLessThan(END_DISTANCE_FRACTION);
      expect(line.gpuEnd).toBe(LINE_END.running);
      expect(Math.abs(line.gpuClosure - line.cpuClosure)).toBeLessThan(
        END_DISTANCE_FRACTION * run.domainSize,
      );
    }
    const closest = Math.min(
      ...run.lines.filter((line) => line.arcLength < 13).map((line) => line.gpuClosure),
    );
    expect(closest).toBeLessThan(0.25 * 12.6);
  });

  test('a different phase traces different lines', async ({ page }) => {
    await openAutomation(page);
    const first = await callAutomation(page, 'runFieldLines', {
      tower: 'horizontal',
      kind: 'electric',
      lineCount: 6,
      phaseDegrees: 0,
    });
    const second = await callAutomation(page, 'runFieldLines', {
      tower: 'horizontal',
      kind: 'electric',
      lineCount: 6,
      phaseDegrees: 90,
    });
    const lengths = (run: typeof first) => run.lines.map((line) => line.gpuPointCount).join(',');
    expect(lengths(first)).not.toBe(lengths(second));
  });
});
