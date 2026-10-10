import fc from 'fast-check';
import { complex } from '../complex';
import { MAGNETIC_CONSTANT } from '../constants';
import { resultantRms } from '../phasor';
import { defaultParameters } from '../model/parameters';
import { groupExcitation } from '../model/excitation';
import { singleConductorField } from '../validation/analytic';
import { longHorizontalConductor } from '../testing/segments';
import { createFieldEvaluator3D } from './evaluate';
import { solveLine } from './solve-line';

const parameters = defaultParameters('horizontal');
const { system } = solveLine(parameters);
const midZ = system.reference.midZ;

function evaluatorFor(phasing: readonly number[]) {
  const excitation = groupExcitation(parameters, phasing);
  return createFieldEvaluator3D(system, excitation.voltages, excitation.currents);
}

describe('fields of one long conductor above ground', () => {
  const voltage = 230940;
  const long = longHorizontalConductor(12, 0.015, 40000, 40);
  const evaluate = createFieldEvaluator3D(long, [complex(voltage, 0)], [complex(1000, 0)]);

  it('matches the analytic electric field of an infinite line charge at 1 m and at the ground', () => {
    for (const [x, y] of [
      [0, 1],
      [7, 1],
      [-20, 1],
      [3, 0],
    ] as const) {
      const analytic = singleConductorField({ voltage, height: 12, radius: 0.015 }, x, y);
      const field = evaluate({ x, y, z: 0 });
      expect(Math.abs(field.electric.x.re - analytic.x)).toBeLessThan(
        3e-3 * Math.hypot(analytic.x, analytic.y),
      );
      expect(Math.abs(field.electric.y.re - analytic.y)).toBeLessThan(
        3e-3 * Math.hypot(analytic.x, analytic.y),
      );
      expect(field.electric.z.re / analytic.y).toBeLessThan(1e-3);
    }
  });

  it('matches mu0 I over 2 pi r for the magnetic field', () => {
    const field = evaluate({ x: 10, y: 12, z: 0 });
    const expected = (2 * MAGNETIC_CONSTANT * 1000) / 10;
    expect(Math.abs(field.magnetic.y.re - expected)).toBeLessThan(1e-4 * expected);
    expect(Math.abs(field.magnetic.x.re)).toBeLessThan(1e-4 * expected);
    expect(field.magnetic.y.im).toBe(0);
  });
});

describe('fields of a three-phase line at mid-span', () => {
  const balanced = evaluatorFor([0, 1, 2]);

  it('is finite and mostly vertical for E and mostly horizontal for B under the conductors', () => {
    const field = balanced({ x: 8, y: 1, z: midZ });
    const e = resultantRms(field.electric);
    const b = resultantRms(field.magnetic);
    expect(e).toBeGreaterThan(1000);
    expect(e).toBeLessThan(10000);
    expect(b).toBeGreaterThan(5e-6);
    expect(Math.hypot(field.electric.y.re, field.electric.y.im)).toBeGreaterThan(0.9 * e);
  });

  it('has no tangential electric field at the ground', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -40, max: 40, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (x, dz) => {
          const field = balanced({ x, y: 0, z: midZ + dz });
          const normal = Math.hypot(field.electric.y.re, field.electric.y.im);
          expect(Math.hypot(field.electric.x.re, field.electric.x.im)).toBeLessThan(1e-9 * normal);
          expect(Math.hypot(field.electric.z.re, field.electric.z.im)).toBeLessThan(1e-9 * normal);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('gives a symmetric field for equal voltages on a symmetric tower', () => {
    const excitation = groupExcitation(parameters);
    const equal = createFieldEvaluator3D(
      system,
      excitation.voltages.map(() => complex(1000, 0)),
      excitation.currents.map(() => complex(100, 0)),
    );
    fc.assert(
      fc.property(
        fc.double({ min: 0.2, max: 60, noNaN: true }),
        fc.double({ min: 0.5, max: 40, noNaN: true }),
        fc.double({ min: -150, max: 150, noNaN: true }),
        (x, y, dz) => {
          const right = equal({ x, y, z: midZ + dz });
          const left = equal({ x: -x, y, z: midZ + dz });
          const e = resultantRms(right.electric);
          expect(Math.abs(resultantRms(left.electric) - e)).toBeLessThan(1e-9 * e);
          expect(left.electric.x.re).toBeCloseTo(-right.electric.x.re, 6);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('mirrors the profile when the phasing is mirrored', () => {
    const mirrored = evaluatorFor([2, 1, 0]);
    fc.assert(
      fc.property(
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.double({ min: 0.5, max: 30, noNaN: true }),
        (x, y) => {
          const direct = balanced({ x, y, z: midZ });
          const flipped = mirrored({ x: -x, y, z: midZ });
          const e = resultantRms(direct.electric);
          const b = resultantRms(direct.magnetic);
          expect(Math.abs(resultantRms(flipped.electric) - e)).toBeLessThan(1e-9 * e);
          expect(Math.abs(resultantRms(flipped.magnetic) - b)).toBeLessThan(1e-9 * b);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('adds up in the voltage phasors: scaling every voltage and current scales the field', () => {
    const excitation = groupExcitation(parameters);
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        (re, im, x) => {
          const factor = complex(re, im);
          const scale = (value: { re: number; im: number }) => ({
            re: value.re * factor.re - value.im * factor.im,
            im: value.re * factor.im + value.im * factor.re,
          });
          const scaled = createFieldEvaluator3D(
            system,
            excitation.voltages.map(scale),
            excitation.currents.map(scale),
          );
          const base = balanced({ x, y: 1, z: midZ });
          const field = scaled({ x, y: 1, z: midZ });
          const reference = resultantRms(base.electric);
          const magnitude = Math.hypot(re, im);
          expect(Math.abs(resultantRms(field.electric) - magnitude * reference)).toBeLessThan(
            1e-9 * (reference + 1),
          );
          const expected = scale(base.electric.y);
          expect(field.electric.y.re).toBeCloseTo(expected.re, 6);
          expect(field.electric.y.im).toBeCloseTo(expected.im, 6);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('superposes: the field of the sum of two voltage sets is the sum of the fields', () => {
    const excitation = groupExcitation(parameters);
    const only = (group: number) =>
      createFieldEvaluator3D(
        system,
        excitation.voltages.map((voltage, index) => (index === group ? voltage : complex(0, 0))),
        excitation.currents.map((current, index) => (index === group ? current : complex(0, 0))),
      );
    const parts = [0, 1, 2].map(only);
    const point = { x: 6, y: 1, z: midZ + 12 };
    const whole = balanced(point);
    for (const axis of ['x', 'y', 'z'] as const) {
      const summedE = parts.reduce((total, part) => total + part(point).electric[axis].re, 0);
      const summedB = parts.reduce((total, part) => total + part(point).magnetic[axis].im, 0);
      expect(whole.electric[axis].re).toBeCloseTo(summedE, 6);
      expect(whole.magnetic[axis].im).toBeCloseTo(summedB, 12);
    }
  });
});
