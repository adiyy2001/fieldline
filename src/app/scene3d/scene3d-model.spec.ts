import { describe, expect, it } from 'vitest';
import type { GridSpec, VolumeSpec } from '../../core/backend/types';
import { contourLevels } from '../../core/exposure/contour-levels';
import { NO_LEVEL_EDITS } from '../../core/exposure/level-edits';
import { DEFAULT_PRESET_ID } from '../../core/exposure/levels';
import type { FieldEvaluator } from '../../core/field-types';
import type { LineSeed } from '../../core/fieldlines/types';
import { DEFAULT_TRANSFER, buildTransferTable } from '../../core/volume/transfer-function';
import type { ReadLine } from '../../gpu/trace-params';
import {
  GRADIENT_STOPS,
  HARDWARE_VOLUME_SIZE,
  SOFTWARE_VOLUME_SIZE,
  countEnds,
  describePosition,
  displayPeak,
  isoLegend,
  isoLevelsFrom,
  isosurfaceSummary,
  lineGradient,
  lineScaleMaximum,
  linesSummary,
  peakOfVolume,
  peakOnGround,
  quantityName,
  scaleTicks,
  swatchColor,
  transferGradient,
  volumeSizeFor,
  volumeSummary,
} from './scene3d-model';

const SPEC: VolumeSpec = {
  xMin: -10,
  xMax: 10,
  yMin: 0,
  yMax: 40,
  zMin: 100,
  zMax: 200,
  nx: 5,
  ny: 5,
  nz: 5,
};

const electricLevels = contourLevels('electric', DEFAULT_PRESET_ID, NO_LEVEL_EDITS);

function lineEndingAt(end: number): ReadLine {
  return {
    pointCount: 2,
    end,
    positions: new Float32Array(6),
    arcLengths: new Float32Array(2),
    magnitudes: new Float32Array(2),
  };
}

describe('the 3D view model', () => {
  it('uses a coarser volume on software adapters', () => {
    expect(volumeSizeFor(false)).toBe(HARDWARE_VOLUME_SIZE);
    expect(volumeSizeFor(true)).toBe(SOFTWARE_VOLUME_SIZE);
    expect(SOFTWARE_VOLUME_SIZE.nx).toBeLessThan(HARDWARE_VOLUME_SIZE.nx);
  });

  it('names the quantities', () => {
    expect(quantityName('electric')).toBe('electric field');
    expect(quantityName('magnetic')).toBe('magnetic flux density');
  });

  it('finds the strongest voxel and its position', () => {
    const values = new Float32Array(SPEC.nx * SPEC.ny * SPEC.nz);
    const index = 3 + SPEC.nx * (1 + SPEC.ny * 4);
    values[index] = 7.5;
    const peak = peakOfVolume(values, SPEC);
    expect(peak.value).toBe(7.5);
    expect(peak.position).toEqual({ x: 5, y: 10, z: 200 });
  });

  it('reports a zero peak for an empty volume', () => {
    expect(peakOfVolume(new Float32Array(SPEC.nx * SPEC.ny * SPEC.nz), SPEC).value).toBe(0);
  });

  it('finds the ground peak inside the window only', () => {
    const grid: GridSpec = { height: 1, xMin: -4, xMax: 4, zMin: 0, zMax: 30, nx: 3, nz: 4 };
    const values = new Float32Array(grid.nx * grid.nz * 12);
    const set = (ix: number, iz: number, amount: number) => {
      values[(ix + grid.nx * iz) * 12] = amount * 1000;
    };
    set(0, 3, 9);
    set(2, 1, 4);
    const everywhere = peakOnGround(values, grid, 'electric');
    expect(everywhere.value).toBeCloseTo(9, 5);
    expect(everywhere.position).toEqual({ x: -4, y: 1, z: 30 });
    const windowed = peakOnGround(values, grid, 'electric', { min: 0, max: 20 });
    expect(windowed.value).toBeCloseTo(4, 5);
    expect(windowed.position).toEqual({ x: 4, y: 1, z: 10 });
  });

  it('describes a position in metres', () => {
    expect(describePosition({ x: 1.234, y: 27.15, z: 323 })).toBe(
      'x = 1.23 m, height 27.1 m, z = 323 m',
    );
  });

  it('scales instantaneous peaks by the square root of two', () => {
    expect(displayPeak(10, 'rms')).toBe(10);
    expect(displayPeak(10, 'instantaneous')).toBeCloseTo(14.142, 3);
  });

  it('summarises the volume in words', () => {
    const rms = volumeSummary({
      quantity: 'electric',
      mode: 'rms',
      phaseDegrees: 0,
      peak: { value: 36.4, position: { x: 1.6, y: 27.1, z: 323 } },
      transfer: DEFAULT_TRANSFER,
      height: 60,
    });
    expect(rms).toContain('Volume rendering of the electric field up to 60 m above ground');
    expect(rms).toContain('36.4 kV/m');
    expect(rms).toContain('height 27.1 m');
    expect(rms).toContain('below 25 percent');
    const instantaneous = volumeSummary({
      quantity: 'magnetic',
      mode: 'instantaneous',
      phaseDegrees: 45,
      peak: { value: 12, position: { x: 0, y: 20, z: 300 } },
      transfer: { ...DEFAULT_TRANSFER, threshold: 0.5 },
      height: 60,
    });
    expect(instantaneous).toContain('instantaneous values at 45 degrees');
    expect(instantaneous).toContain('12 µT');
    expect(instantaneous).toContain('below 50 percent');
  });

  it('keeps the lowest exposure levels below the peak, at most three', () => {
    const levels = isoLevelsFrom(electricLevels, 100);
    expect(levels.length).toBeLessThanOrEqual(3);
    expect(levels.map((level) => level.value)).toEqual(
      [...levels.map((level) => level.value)].sort((a, b) => a - b),
    );
    const low = isoLevelsFrom(electricLevels, 2);
    expect(low.every((level) => level.value < 2)).toBe(true);
    expect(isoLevelsFrom(electricLevels, 0.5)).toEqual([]);
  });

  it('builds a legend with a swatch for each drawn level and a note for the rest', () => {
    const legend = isoLegend(electricLevels, 6);
    const reached = legend.filter((entry) => entry.reached);
    const missed = legend.filter((entry) => !entry.reached);
    expect(reached.length).toBeGreaterThan(0);
    expect(missed.length).toBeGreaterThan(0);
    expect(reached.every((entry) => entry.swatch.startsWith('rgb('))).toBe(true);
    expect(missed.every((entry) => entry.swatch === 'transparent')).toBe(true);
    expect(new Set(reached.map((entry) => entry.swatch)).size).toBe(reached.length);
    expect(swatchColor(99)).toBe(swatchColor(3));
  });

  it('summarises the isosurfaces in words', () => {
    const text = isosurfaceSummary(
      'electric',
      { value: 36.4, position: { x: 0, y: 25, z: 320 } },
      electricLevels,
    );
    expect(text).toContain('Isosurfaces of the electric field at 3 exposure levels');
    expect(text).toContain('36.4 kV/m');
    const quiet = isosurfaceSummary(
      'electric',
      { value: 0.2, position: { x: 0, y: 25, z: 320 } },
      electricLevels,
    );
    expect(quiet).toContain('No isosurface is drawn');
    const single = isosurfaceSummary(
      'electric',
      { value: 1.5, position: { x: 0, y: 25, z: 320 } },
      electricLevels,
    );
    expect(single).toContain('at 1 exposure level:');
  });

  it('counts where the lines end', () => {
    const counts = countEnds([
      lineEndingAt(1),
      lineEndingAt(1),
      lineEndingAt(2),
      lineEndingAt(3),
      lineEndingAt(0),
      lineEndingAt(4),
    ]);
    expect(counts).toEqual({ total: 6, ground: 2, conductor: 1, domain: 1, open: 2 });
  });

  it('summarises the field lines in words', () => {
    const peak = { value: 2.26, position: { x: -1, y: 1, z: 450 } };
    const electric = linesSummary({
      quantity: 'electric',
      phaseDegrees: 30,
      lineCount: 128,
      peak,
      ends: { total: 128, ground: 60, conductor: 60, domain: 4, open: 4 },
    });
    expect(electric).toContain('128 electric field lines at 30 degrees');
    expect(electric).toContain('60 end on the ground, 60 on a conductor, 8 leave');
    expect(electric).toContain('2.26 kV/m');
    const magnetic = linesSummary({
      quantity: 'magnetic',
      phaseDegrees: 0,
      lineCount: 64,
      peak: null,
      ends: null,
    });
    expect(magnetic).toContain('close on themselves');
    expect(magnetic).not.toContain('strongest');
  });

  it('labels the scale from zero to the maximum', () => {
    const ticks = scaleTicks(100);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.label).toBe('0');
    expect(ticks[4]?.label).toBe('100');
    expect(Number(ticks[2]?.label)).toBeCloseTo(25, 1);
  });

  it('builds colour gradients with one stop per step', () => {
    const ramp = transferGradient(buildTransferTable(DEFAULT_TRANSFER));
    expect(ramp.startsWith('linear-gradient(to right, transparent 0%')).toBe(true);
    expect(ramp.split('rgb(').length - 1).toBeGreaterThan(5);
    expect(ramp.split('%').length - 1).toBe(GRADIENT_STOPS);
    expect(lineGradient().split('rgb(').length - 1).toBe(GRADIENT_STOPS);
  });

  it('scales the line colours to the strongest seed', () => {
    const evaluator: FieldEvaluator = (point) => ({
      electric: {
        x: { re: 1000 * point.x, im: 0 },
        y: { re: 0, im: 0 },
        z: { re: 0, im: 0 },
      },
      magnetic: {
        x: { re: 0, im: 0 },
        y: { re: 2e-6, im: 0 },
        z: { re: 0, im: 0 },
      },
    });
    const seeds: LineSeed[] = [1, 3, 2].map((x) => ({
      kind: 'electric',
      origin: { x, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 0,
    }));
    expect(lineScaleMaximum(seeds, evaluator, 'electric')).toBeCloseTo(3 * Math.SQRT2, 6);
    expect(lineScaleMaximum(seeds, evaluator, 'magnetic')).toBeCloseTo(2 * Math.SQRT2, 6);
    expect(lineScaleMaximum([], evaluator, 'electric')).toBeGreaterThan(0);
  });
});
