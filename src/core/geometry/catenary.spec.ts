import fc from 'fast-check';
import {
  catenaryLength,
  catenaryParameter,
  createCatenary,
  heightAboveLowPoint,
  heightAt,
} from './catenary';

describe('catenary', () => {
  it('reproduces the reference case of a 300 m span with 10 m sag', () => {
    const catenary = createCatenary(300, 10);
    expect(catenary.parameter).toBeCloseTo(1126.6627, 3);
    expect(catenaryLength(catenary)).toBeCloseTo(300.8871, 3);
  });

  it('puts the attachment at the given height and the low point one sag below', () => {
    const catenary = createCatenary(300, 10);
    expect(heightAt(catenary, 30, 0)).toBeCloseTo(30, 9);
    expect(heightAt(catenary, 30, 300)).toBeCloseTo(30, 9);
    expect(heightAt(catenary, 30, 150)).toBeCloseTo(20, 9);
  });

  it('is symmetric about the middle of the span', () => {
    const catenary = createCatenary(250, 7);
    expect(heightAboveLowPoint(catenary, 60)).toBeCloseTo(heightAboveLowPoint(catenary, 190), 10);
  });

  it('stays close to the parabola at small sag ratios', () => {
    const catenary = createCatenary(300, 10);
    const parabola = (z: number): number => (4 * 10 * (z - 150) ** 2) / 300 ** 2;
    expect(Math.abs(heightAboveLowPoint(catenary, 60) - parabola(60))).toBeLessThan(0.01);
  });

  it('gives a straight conductor and the span as length for zero sag', () => {
    const catenary = createCatenary(300, 0);
    expect(catenary.parameter).toBe(Number.POSITIVE_INFINITY);
    expect(heightAt(catenary, 25, 77)).toBe(25);
    expect(catenaryLength(catenary)).toBe(300);
  });

  it('rejects a non positive span and a negative sag', () => {
    expect(() => catenaryParameter(0, 1)).toThrow(RangeError);
    expect(() => catenaryParameter(100, -1)).toThrow(RangeError);
  });

  it('round trips the sag through the parameter for any span and sag ratio', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 50, max: 800, noNaN: true }),
        fc.double({ min: 0.001, max: 0.12, noNaN: true }),
        (span, ratio) => {
          const sag = span * ratio;
          const catenary = createCatenary(span, sag);
          expect(heightAt(catenary, sag, 0)).toBeCloseTo(sag, 8);
          expect(heightAboveLowPoint(catenary, 0)).toBeCloseTo(sag, 8);
          expect(catenaryLength(catenary)).toBeGreaterThan(span);
        },
      ),
      { numRuns: 200 },
    );
  });
});
