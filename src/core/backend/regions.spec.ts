import { describe, expect, it } from 'vitest';
import { defaultParameters, lineGeometryFromParameters } from '../model/parameters';
import { gridSpacing } from './layout';
import { CPU_GRID_SIZE, defaultGridSpec, defaultVolumeSpec } from './regions';

const geometry = lineGeometryFromParameters(defaultParameters('horizontal'));

describe('default regions', () => {
  it('puts the ground grid at 1 m, 60 m beside the line and 60 m beyond both end towers', () => {
    const spec = defaultGridSpec(geometry);
    expect(spec).toMatchObject({ height: 1, xMin: -60, xMax: 60, zMin: -60, zMax: 960 });
    expect(spec.nx).toBe(512);
    expect(spec.nz).toBe(1024);
  });

  it('uses fewer cells for the CPU grid', () => {
    const spec = defaultGridSpec(geometry, CPU_GRID_SIZE);
    expect([spec.nx, spec.nz]).toEqual([128, 256]);
    const { dx } = gridSpacing(spec);
    expect(dx).toBeCloseTo(120 / 127, 12);
  });

  it('spans the reference span plus 20 m on each side for the volume', () => {
    const spec = defaultVolumeSpec(geometry, 1);
    expect(spec).toMatchObject({ xMin: -50, xMax: 50, yMin: 0, yMax: 60, zMin: 280, zMax: 620 });
    expect([spec.nx, spec.ny, spec.nz]).toEqual([64, 64, 128]);
  });
});
