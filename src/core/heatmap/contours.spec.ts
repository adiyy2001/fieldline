import { describe, expect, it } from 'vitest';
import { contourSegments, segmentCount } from './contours';

function cone(nx: number, nz: number): Float32Array {
  const scalars = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      scalars[ix + nx * iz] = Math.hypot(ix - (nx - 1) / 2, iz - (nz - 1) / 2);
    }
  }
  return scalars;
}

describe('marching squares contours', () => {
  it('traces a circle around the apex of a cone', () => {
    const nx = 41;
    const nz = 41;
    const radius = 12.3;
    const contour = contourSegments(cone(nx, nz), nx, nz, radius);
    expect(segmentCount(contour)).toBeGreaterThan(60);
    for (let index = 0; index < segmentCount(contour); index += 1) {
      for (const end of [0, 2]) {
        const ix = contour.coordinates[4 * index + end] ?? 0;
        const iz = contour.coordinates[4 * index + end + 1] ?? 0;
        expect(Math.hypot(ix - 20, iz - 20)).toBeCloseTo(radius, 0);
      }
    }
  });

  it('finds nothing above or below the data range', () => {
    const scalars = cone(8, 8);
    expect(segmentCount(contourSegments(scalars, 8, 8, 100))).toBe(0);
    expect(segmentCount(contourSegments(scalars, 8, 8, -1))).toBe(0);
  });

  it('places a straight front at the interpolated position', () => {
    const nx = 4;
    const nz = 3;
    const scalars = new Float32Array(nx * nz);
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        scalars[ix + nx * iz] = ix * 10;
      }
    }
    const contour = contourSegments(scalars, nx, nz, 12.5);
    expect(segmentCount(contour)).toBe(2);
    for (let index = 0; index < 2; index += 1) {
      expect(contour.coordinates[4 * index]).toBeCloseTo(1.25, 6);
      expect(contour.coordinates[4 * index + 2]).toBeCloseTo(1.25, 6);
    }
  });

  it('emits two segments for a saddle cell and picks the pairing by the centre', () => {
    const highCentre = contourSegments(Float32Array.from([4, 0, 0, 4]), 2, 2, 1);
    expect(segmentCount(highCentre)).toBe(2);
    const lowCentre = contourSegments(Float32Array.from([2, 0, 0, 2]), 2, 2, 1.5);
    expect(segmentCount(lowCentre)).toBe(2);
    const otherDiagonal = contourSegments(Float32Array.from([0, 4, 4, 0]), 2, 2, 1);
    expect(segmentCount(otherDiagonal)).toBe(2);
    const otherLow = contourSegments(Float32Array.from([0, 2, 2, 0]), 2, 2, 1.5);
    expect(segmentCount(otherLow)).toBe(2);
  });

  it('handles every single corner case with one segment', () => {
    for (let corner = 0; corner < 4; corner += 1) {
      const scalars = new Float32Array(4);
      scalars[corner] = 2;
      expect(segmentCount(contourSegments(scalars, 2, 2, 1))).toBe(1);
      const inverted = new Float32Array(4).fill(2);
      inverted[corner] = 0;
      expect(segmentCount(contourSegments(inverted, 2, 2, 1))).toBe(1);
    }
  });

  it('puts two adjacent high corners on one segment across the cell', () => {
    for (const high of [
      [0, 1],
      [1, 3],
      [2, 3],
      [0, 2],
    ]) {
      const scalars = new Float32Array(4);
      for (const corner of high) {
        scalars[corner] = 2;
      }
      expect(segmentCount(contourSegments(scalars, 2, 2, 1))).toBe(1);
    }
  });

  it('handles a flat field exactly at the level', () => {
    expect(segmentCount(contourSegments(new Float32Array(9).fill(1), 3, 3, 1))).toBe(0);
  });
});
