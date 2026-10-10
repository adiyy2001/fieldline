import { describe, expect, it } from 'vitest';
import { instantaneousMagnitude, resultantRms } from '../phasor';
import { maximum, rmsMaxima, scalarAt, scalarGrid, scalarOfVector } from './scalar';

function point(electric: number[], magnetic: number[]): Float32Array {
  return Float32Array.from([...electric, ...magnetic]);
}

describe('scalar selection', () => {
  const values = point([3000, 0, 4000, 0, 0, 0], [1, 0, 0, 2, 0, 0]);

  it('reports the rms electric field in kV/m', () => {
    expect(scalarAt(values, 0, { quantity: 'electric', mode: 'rms', phaseRadians: 0 })).toBeCloseTo(
      5,
      6,
    );
  });

  it('reports the rms magnetic flux density in microtesla', () => {
    expect(scalarAt(values, 0, { quantity: 'magnetic', mode: 'rms', phaseRadians: 1 })).toBeCloseTo(
      Math.hypot(1, 2) * 1,
      6,
    );
  });

  it('follows the instantaneous value over the cycle', () => {
    const selection = (phaseRadians: number) => ({
      quantity: 'magnetic' as const,
      mode: 'instantaneous' as const,
      phaseRadians,
    });
    expect(scalarAt(values, 0, selection(0))).toBeCloseTo(Math.SQRT2, 6);
    expect(scalarAt(values, 0, selection(Math.PI / 2))).toBeCloseTo(2 * Math.SQRT2, 6);
    expect(scalarAt(values, 0, selection(Math.PI))).toBeCloseTo(Math.SQRT2, 6);
  });

  it('converts the SI vectors of the evaluator to display units', () => {
    const vector = {
      x: { re: 3, im: -1 },
      y: { re: 0.5, im: 2 },
      z: { re: -2, im: 0.25 },
    };
    const packed = point(
      [vector.x.re, vector.y.re, vector.z.re, vector.x.im, vector.y.im, vector.z.im],
      [0, 0, 0, 0, 0, 0],
    );
    const rms = { quantity: 'magnetic' as const, mode: 'rms' as const, phaseRadians: 0 };
    expect(scalarOfVector(vector, rms)).toBeCloseTo(resultantRms(vector) * 1e6, 6);
    expect(scalarOfVector(vector, { ...rms, quantity: 'electric' })).toBeCloseTo(
      resultantRms(vector) / 1000,
      12,
    );
    expect(scalarAt(packed, 0, { ...rms, quantity: 'electric' })).toBeCloseTo(
      resultantRms(vector) / 1000,
      6,
    );
    const instant = {
      quantity: 'magnetic' as const,
      mode: 'instantaneous' as const,
      phaseRadians: 0.7,
    };
    expect(scalarOfVector(vector, instant)).toBeCloseTo(
      instantaneousMagnitude(vector, 0.7) * 1e6,
      6,
    );
  });

  it('builds a grid of scalars and finds its maximum', () => {
    const grid = Float32Array.from([
      ...values,
      ...point([1000, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]),
    ]);
    const scalars = scalarGrid(grid, { quantity: 'electric', mode: 'rms', phaseRadians: 0 });
    expect(Array.from(scalars)).toEqual([5, 1]);
    expect(maximum(scalars)).toBe(5);
    expect(maximum(new Float32Array(0))).toBe(0);
  });

  it('finds the rms maxima of both quantities over all points', () => {
    const grid = Float32Array.from([
      ...values,
      ...point([1000, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 6]),
    ]);
    const maxima = rmsMaxima(grid);
    expect(maxima.electric).toBeCloseTo(5, 6);
    expect(maxima.magnetic).toBeCloseTo(6, 6);
    expect(rmsMaxima(new Float32Array(0))).toEqual({ electric: 0, magnetic: 0 });
  });
});
