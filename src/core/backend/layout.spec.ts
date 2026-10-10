import { describe, expect, it } from 'vitest';
import {
  gridIndex,
  layoutBounds,
  layoutCenter,
  layoutPointCount,
  layoutRowLength,
  nodeSpacing,
  pointAt,
  splitIntoRows,
  volumeIndex,
} from './layout';
import type { GridSpec, PointLayout, VolumeSpec } from './types';

const grid: GridSpec = { height: 1, xMin: -6, xMax: 6, zMin: 10, zMax: 40, nx: 5, nz: 4 };
const volume: VolumeSpec = {
  xMin: -4,
  xMax: 4,
  yMin: 0,
  yMax: 6,
  zMin: 0,
  zMax: 9,
  nx: 3,
  ny: 4,
  nz: 2,
};

describe('point layouts', () => {
  it('places grid nodes on both edges with x running fastest', () => {
    const layout: PointLayout = { kind: 'grid', spec: grid };
    expect(layoutPointCount(layout)).toBe(20);
    expect(pointAt(layout, 0)).toEqual({ x: -6, y: 1, z: 10 });
    expect(pointAt(layout, 4)).toEqual({ x: 6, y: 1, z: 10 });
    expect(pointAt(layout, 5)).toEqual({ x: -6, y: 1, z: 20 });
    expect(pointAt(layout, 19)).toEqual({ x: 6, y: 1, z: 40 });
    expect(pointAt(layout, gridIndex(grid, 2, 3))).toEqual({ x: 0, y: 1, z: 40 });
  });

  it('orders volume nodes as ix + nx * (iy + ny * iz)', () => {
    const layout: PointLayout = { kind: 'volume', spec: volume };
    expect(layoutPointCount(layout)).toBe(24);
    expect(pointAt(layout, 0)).toEqual({ x: -4, y: 0, z: 0 });
    expect(pointAt(layout, 1)).toEqual({ x: 0, y: 0, z: 0 });
    expect(pointAt(layout, 3)).toEqual({ x: -4, y: 2, z: 0 });
    expect(pointAt(layout, 12)).toEqual({ x: -4, y: 0, z: 9 });
    expect(pointAt(layout, volumeIndex(volume, 2, 3, 1))).toEqual({ x: 4, y: 6, z: 9 });
  });

  it('reads explicit points from the coordinate triples', () => {
    const layout: PointLayout = { kind: 'points', coordinates: Float64Array.of(1, 2, 3, 4, 5, 6) };
    expect(layoutPointCount(layout)).toBe(2);
    expect(pointAt(layout, 1)).toEqual({ x: 4, y: 5, z: 6 });
    expect(layoutRowLength(layout)).toBe(1);
  });

  it('returns zero spacing for a single node', () => {
    expect(nodeSpacing(3, 9, 1)).toBe(0);
    expect(nodeSpacing(0, 9, 4)).toBe(3);
  });

  it('reports bounds and the centre of every layout kind', () => {
    const points: PointLayout = {
      kind: 'points',
      coordinates: Float64Array.of(1, 2, 3, 5, -2, 9),
    };
    expect(layoutBounds(points)).toEqual({
      min: { x: 1, y: -2, z: 3 },
      max: { x: 5, y: 2, z: 9 },
    });
    expect(layoutCenter(points)).toEqual({ x: 3, y: 0, z: 6 });
    expect(layoutCenter({ kind: 'grid', spec: grid })).toEqual({ x: 0, y: 1, z: 25 });
    expect(layoutCenter({ kind: 'volume', spec: volume })).toEqual({ x: 0, y: 3, z: 4.5 });
    expect(layoutBounds({ kind: 'points', coordinates: new Float64Array(0) }).min).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });
});

describe('splitting into rows', () => {
  it('covers every point once with ranges that start on a row', () => {
    const layout: PointLayout = { kind: 'grid', spec: grid };
    const ranges = splitIntoRows(layout, 3);
    expect(ranges[0]?.start).toBe(0);
    expect(ranges[ranges.length - 1]?.end).toBe(20);
    ranges.forEach((range, index) => {
      expect(range.start % 5).toBe(0);
      if (index > 0) {
        expect(range.start).toBe(ranges[index - 1]?.end);
      }
    });
  });

  it('never makes more parts than there are rows', () => {
    expect(splitIntoRows({ kind: 'grid', spec: grid }, 16)).toHaveLength(4);
    expect(splitIntoRows({ kind: 'points', coordinates: Float64Array.of(1, 2, 3) }, 4)).toEqual([
      { start: 0, end: 1 },
    ]);
  });

  it('returns no range for an empty layout', () => {
    expect(splitIntoRows({ kind: 'points', coordinates: new Float64Array(0) }, 4)).toEqual([]);
  });
});
