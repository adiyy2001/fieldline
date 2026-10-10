import { describe, expect, it } from 'vitest';
import { compareFields, mirrorDifference } from './parity';

function field(values: readonly number[][]): Float32Array {
  return Float32Array.from(values.flat());
}

const unit = [1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0];

describe('field parity metrics', () => {
  it('reports zero error for identical buffers', () => {
    const buffer = field([unit, unit]);
    const report = compareFields(buffer, buffer);
    expect(report.electric.maximum).toBe(0);
    expect(report.magnetic.mean).toBe(0);
    expect(report.electric.comparedPoints).toBe(2);
    expect(report.finite).toBe(true);
  });

  it('measures the norm of the difference over the norm of the reference per point', () => {
    const reference = field([unit, unit]);
    const candidate = field([unit, [1.5, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]]);
    const report = compareFields(reference, candidate);
    expect(report.electric.maximum).toBeCloseTo(0.5, 12);
    expect(report.electric.mean).toBeCloseTo(0.25, 12);
    expect(report.electric.worstIndex).toBe(1);
    expect(report.magnetic.maximum).toBe(0);
  });

  it('leaves out reference points below the floor', () => {
    const tiny = [1e-4, 0, 0, 0, 0, 0, 0, 1e-4, 0, 0, 0, 0];
    const reference = field([unit, tiny]);
    const candidate = field([unit, [5e-4, 0, 0, 0, 0, 0, 0, 1e-4, 0, 0, 0, 0]]);
    const report = compareFields(reference, candidate);
    expect(report.electric.comparedPoints).toBe(1);
    expect(report.electric.totalPoints).toBe(2);
    expect(compareFields(reference, candidate, 0).electric.comparedPoints).toBe(2);
  });

  it('flags non finite candidates', () => {
    const reference = field([unit]);
    const candidate = field([[Number.NaN, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]]);
    expect(compareFields(reference, candidate).finite).toBe(false);
  });

  it('rejects buffers of different length', () => {
    expect(() => compareFields(new Float32Array(12), new Float32Array(24))).toThrow(RangeError);
  });

  it('handles an all zero reference', () => {
    const report = compareFields(new Float32Array(12), new Float32Array(12));
    expect(report.electric.comparedPoints).toBe(0);
    expect(report.electric.worstIndex).toBe(-1);
  });
});

describe('mirror difference', () => {
  const columns = 3;
  const row = (value: number) => [value, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it('is zero when the second grid is the mirror image of the first', () => {
    const original = field([row(1), row(2), row(3)]);
    const mirrored = field([row(3), row(2), row(1)]);
    expect(mirrorDifference(original, mirrored, columns).maximum).toBe(0);
  });

  it('reports the relative difference of the magnitudes at mirrored nodes', () => {
    const original = field([row(1), row(2), row(4)]);
    const mirrored = field([row(4), row(2), row(1.5)]);
    const difference = mirrorDifference(original, mirrored, columns);
    expect(difference.maximum).toBeCloseTo(0.5, 12);
    expect(difference.comparedPoints).toBe(3);
  });
});
