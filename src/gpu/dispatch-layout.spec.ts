import { describe, expect, it } from 'vitest';
import type { GridSpec, PointLayout, VolumeSpec } from '../core/backend/types';
import {
  PARAMS_BYTES,
  kernelKindOf,
  packParams,
  packPointsRelativeTo,
  workgroupCounts,
} from './dispatch-layout';

const grid: GridSpec = { height: 1, xMin: -60, xMax: 60, zMin: -60, zMax: 960, nx: 512, nz: 1024 };
const volume: VolumeSpec = {
  xMin: -50,
  xMax: 50,
  yMin: 0,
  yMax: 60,
  zMin: 280,
  zMax: 620,
  nx: 64,
  ny: 64,
  nz: 128,
};

function view(buffer: ArrayBuffer): DataView {
  return new DataView(buffer);
}

describe('uniform parameters', () => {
  it('is 48 bytes with the fields at the offsets of the WGSL struct', () => {
    expect(PARAMS_BYTES).toBe(48);
    const layout: PointLayout = { kind: 'grid', spec: grid };
    const data = view(packParams(layout, { x: 0, y: 1, z: 450 }, 210));
    expect(data.byteLength).toBe(48);
    expect(data.getFloat32(0, true)).toBe(-60);
    expect(data.getFloat32(4, true)).toBe(0);
    expect(data.getFloat32(8, true)).toBe(-510);
    expect(data.getUint32(12, true)).toBe(210);
    expect(data.getFloat32(16, true)).toBeCloseTo(120 / 511, 6);
    expect(data.getFloat32(20, true)).toBe(0);
    expect(data.getFloat32(24, true)).toBeCloseTo(1020 / 1023, 6);
    expect(data.getUint32(28, true)).toBe(512 * 1024);
    expect([32, 36, 40].map((offset) => data.getUint32(offset, true))).toEqual([512, 1, 1024]);
    expect(data.getFloat32(44, true)).toBe(-1);
  });

  it('carries the three volume dimensions and steps', () => {
    const data = view(packParams({ kind: 'volume', spec: volume }, { x: 0, y: 30, z: 450 }, 336));
    expect(data.getFloat32(4, true)).toBe(-30);
    expect(data.getFloat32(20, true)).toBeCloseTo(60 / 63, 6);
    expect([32, 36, 40].map((offset) => data.getUint32(offset, true))).toEqual([64, 64, 128]);
    expect(data.getUint32(28, true)).toBe(64 * 64 * 128);
  });

  it('describes a point list by its count only', () => {
    const layout: PointLayout = { kind: 'points', coordinates: Float64Array.of(1, 2, 3, 4, 5, 6) };
    const data = view(packParams(layout, { x: 0, y: 0, z: 0 }, 10));
    expect(data.getUint32(28, true)).toBe(2);
    expect(data.getFloat32(0, true)).toBe(0);
    expect(data.getFloat32(16, true)).toBe(0);
    expect(data.getUint32(32, true)).toBe(2);
  });
});

describe('dispatch sizes', () => {
  it('rounds up to whole workgroups', () => {
    expect(workgroupCounts({ kind: 'grid', spec: grid }, { x: 8, y: 8, z: 1 })).toEqual([
      64, 128, 1,
    ]);
    expect(workgroupCounts({ kind: 'grid', spec: grid }, { x: 16, y: 16, z: 1 })).toEqual([
      32, 64, 1,
    ]);
    expect(workgroupCounts({ kind: 'volume', spec: volume }, { x: 4, y: 4, z: 4 })).toEqual([
      16, 16, 32,
    ]);
    const points: PointLayout = { kind: 'points', coordinates: new Float64Array(3 * 65) };
    expect(workgroupCounts(points, { x: 64, y: 1, z: 1 })).toEqual([2, 1, 1]);
  });

  it('selects the kernel of the layout', () => {
    expect(kernelKindOf({ kind: 'grid', spec: grid })).toBe('ground');
    expect(kernelKindOf({ kind: 'volume', spec: volume })).toBe('volume');
    expect(kernelKindOf({ kind: 'points', coordinates: new Float64Array(0) })).toBe('points');
  });
});

describe('point packing', () => {
  it('writes vec4 entries relative to the origin', () => {
    const packed = packPointsRelativeTo(Float64Array.of(10, 2, 450, 11, 3, 452), {
      x: 10,
      y: 2,
      z: 450,
    });
    expect(Array.from(packed)).toEqual([0, 0, 0, 0, 1, 1, 2, 0]);
  });
});
