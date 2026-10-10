import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSFER,
  OPAQUE_ALPHA,
  TRANSFER_ENTRIES,
  bandEdges,
  buildTransferTable,
  compositeFrontToBack,
  lookup,
  normalizedValue,
  stepAlpha,
  valueOfNormalized,
} from './transfer-function';

describe('the transfer function', () => {
  it('maps values to the unit interval with a square root scale', () => {
    expect(normalizedValue(25, 100)).toBeCloseTo(0.5, 12);
    expect(normalizedValue(0, 100)).toBe(0);
    expect(normalizedValue(400, 100)).toBe(1);
    expect(normalizedValue(5, 0)).toBe(0);
    expect(valueOfNormalized(0.5, 100)).toBeCloseTo(25, 12);
    expect(valueOfNormalized(normalizedValue(37, 120), 120)).toBeCloseTo(37, 9);
  });

  it('builds a viridis ramp that is transparent below the threshold and grows above it', () => {
    const table = buildTransferTable({ preset: 'ramp', opacity: 0.8, threshold: 0.3 });
    expect(table).toHaveLength(TRANSFER_ENTRIES * 4);
    expect(lookup(table, 0.2)[3]).toBe(0);
    expect(lookup(table, 0.31)[3]).toBeGreaterThan(0);
    expect(lookup(table, 1)[3]).toBeCloseTo(0.8, 6);
    expect(lookup(table, 0.5)[3]).toBeLessThan(lookup(table, 0.9)[3]);
    const low = lookup(table, 0.5);
    const high = lookup(table, 1);
    expect(high[1]).toBeGreaterThan(low[1]);
  });

  it('builds bands that start at the lowest level and get more opaque with each one', () => {
    const edges = bandEdges([200, 5, 100, 5], 400);
    expect(edges).toHaveLength(4);
    expect(edges[0]).toBeCloseTo(Math.sqrt(5 / 400), 12);
    const table = buildTransferTable({ preset: 'bands', opacity: 1, threshold: 0 }, edges);
    expect(lookup(table, (edges[0] ?? 0) / 2)[3]).toBe(0);
    const first = lookup(table, (edges[0] ?? 0) + 0.001)[3];
    const last = lookup(table, 0.999)[3];
    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(first);
  });

  it('drops levels outside the visible range', () => {
    expect(bandEdges([0, -1, 500], 400)).toEqual([]);
    expect(buildTransferTable({ ...DEFAULT_TRANSFER, preset: 'bands' }, [])).toHaveLength(
      TRANSFER_ENTRIES * 4,
    );
  });

  it('corrects the opacity for the step length', () => {
    expect(stepAlpha(0.5, 1)).toBeCloseTo(0.5, 12);
    expect(stepAlpha(0.5, 2)).toBeCloseTo(0.75, 12);
    expect(stepAlpha(0.5, 0.5)).toBeCloseTo(1 - Math.sqrt(0.5), 12);
    expect(stepAlpha(1, 1)).toBeLessThan(1);
  });

  it('composites front to back and stops once the ray is opaque', () => {
    const table = buildTransferTable({ preset: 'ramp', opacity: 1, threshold: 0 });
    const empty = compositeFrontToBack([0, 0, 0], table, 1);
    expect(empty.alpha).toBe(0);
    const thick = compositeFrontToBack(
      Array.from({ length: 200 }, () => 1),
      table,
      1,
    );
    expect(thick.alpha).toBeGreaterThanOrEqual(OPAQUE_ALPHA);
    expect(thick.alpha).toBeLessThanOrEqual(1);
    const single = compositeFrontToBack([1], table, 1);
    const [red, green, blue, alpha] = lookup(table, 1);
    expect(single.alpha).toBeCloseTo(stepAlpha(alpha, 1), 9);
    expect(single.green).toBeCloseTo(single.alpha * green, 9);
    expect(single.red).toBeCloseTo(single.alpha * red, 9);
    expect(single.blue).toBeCloseTo(single.alpha * blue, 9);
  });

  it('weights a front sample more than the same sample behind it', () => {
    const table = buildTransferTable({ preset: 'ramp', opacity: 0.6, threshold: 0 });
    const frontHigh = compositeFrontToBack([1, 0.4], table, 1);
    const backHigh = compositeFrontToBack([0.4, 1], table, 1);
    expect(frontHigh.green).not.toBeCloseTo(backHigh.green, 3);
  });
});
