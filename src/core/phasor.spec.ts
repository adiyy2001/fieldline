import { complex, magnitude, argument, ZERO } from './complex';
import {
  type ComplexVector3,
  addVectors,
  instantaneousMagnitude,
  instantaneousVector,
  phaseCurrentPhasors,
  phaseVoltagePhasors,
  polarizationEllipse,
  resultantRms,
  scaleVector,
  scaleVectorReal,
} from './phasor';

const DEGREES = Math.PI / 180;

function vector(x: [number, number], y: [number, number], z: [number, number]): ComplexVector3 {
  return { x: complex(...x), y: complex(...y), z: complex(...z) };
}

describe('phase phasors', () => {
  it('gives phase voltages of V_LL over root three at 0, -120 and +120 degrees', () => {
    const [first, second, third] = phaseVoltagePhasors(400e3);
    expect(magnitude(first)).toBeCloseTo(230940.1076, 3);
    expect(argument(first)).toBeCloseTo(0, 12);
    expect(argument(second)).toBeCloseTo(-120 * DEGREES, 12);
    expect(argument(third)).toBeCloseTo(120 * DEGREES, 12);
    expect(magnitude(second)).toBeCloseTo(magnitude(first), 6);
  });

  it('subtracts the power factor angle from the voltage angle for a lagging current', () => {
    const [first, second] = phaseCurrentPhasors(1000, 30);
    expect(magnitude(first)).toBeCloseTo(1000, 9);
    expect(argument(first)).toBeCloseTo(-30 * DEGREES, 12);
    expect(argument(second)).toBeCloseTo(-150 * DEGREES, 12);
  });

  it('sums the three voltages to zero', () => {
    const [first, second, third] = phaseVoltagePhasors(123e3);
    expect(first.re + second.re + third.re).toBeCloseTo(0, 6);
    expect(first.im + second.im + third.im).toBeCloseTo(0, 6);
  });
});

describe('vector helpers', () => {
  const a = vector([1, 2], [0, 0], [0, 0]);
  const b = vector([3, -1], [1, 1], [0, 0]);

  it('adds and scales vectors', () => {
    expect(addVectors(a, b).x).toEqual({ re: 4, im: 1 });
    expect(scaleVector(a, complex(0, 1)).x).toEqual({ re: -2, im: 1 });
    expect(scaleVectorReal(b, 2).y).toEqual({ re: 2, im: 2 });
    expect(addVectors(a, { x: ZERO, y: ZERO, z: ZERO })).toEqual(a);
  });
});

describe('resultant and instantaneous values', () => {
  it('uses the root of the summed squared magnitudes as the resultant rms', () => {
    expect(resultantRms(vector([3, 0], [0, 4], [0, 0]))).toBe(5);
    expect(resultantRms(vector([1, 1], [1, 1], [1, 1]))).toBeCloseTo(Math.sqrt(6), 14);
  });

  it('evaluates the real part at omega t of 0 and 90 degrees by hand', () => {
    const real = vector([1, 0], [0, 0], [0, 0]);
    const imaginary = vector([0, 1], [0, 0], [0, 0]);
    expect(instantaneousVector(real, 0).x).toBeCloseTo(Math.SQRT2, 14);
    expect(instantaneousVector(real, Math.PI / 2).x).toBeCloseTo(0, 14);
    expect(instantaneousVector(imaginary, 0).x).toBeCloseTo(0, 14);
    expect(instantaneousVector(imaginary, Math.PI / 2).x).toBeCloseTo(-Math.SQRT2, 14);
  });

  it('keeps the magnitude of a circularly polarized field constant over the cycle', () => {
    const circular = vector([1, 0], [0, 1], [0, 0]);
    for (const angle of [0, 0.4, 1.3, 2.9]) {
      expect(instantaneousMagnitude(circular, angle)).toBeCloseTo(Math.SQRT2, 12);
    }
  });

  it('gives a mean square over the cycle equal to the squared rms', () => {
    const field = vector([1, 0.5], [0.2, -0.7], [0.3, 0.1]);
    const samples = 360;
    let total = 0;
    for (let index = 0; index < samples; index += 1) {
      total += instantaneousMagnitude(field, (2 * Math.PI * index) / samples) ** 2;
    }
    expect(Math.sqrt(total / samples)).toBeCloseTo(resultantRms(field), 12);
  });
});

describe('polarization ellipse', () => {
  it('collapses to a line for a linearly polarized phasor', () => {
    const ellipse = polarizationEllipse(vector([3, 0], [0, 0], [4, 0]));
    expect(ellipse.semiMajor).toBeCloseTo(5 * Math.SQRT2, 12);
    expect(ellipse.semiMinor).toBeCloseTo(0, 6);
  });

  it('is a circle for equal quadrature components', () => {
    const ellipse = polarizationEllipse(vector([1, 0], [0, 1], [0, 0]));
    expect(ellipse.semiMajor).toBeCloseTo(Math.SQRT2, 12);
    expect(ellipse.semiMinor).toBeCloseTo(Math.SQRT2, 12);
  });

  it('matches the maximum of the instantaneous magnitude over the cycle', () => {
    const field = vector([1, 0.5], [0.2, -0.7], [0.3, 0.1]);
    let maximum = 0;
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 3600; index += 1) {
      const value = instantaneousMagnitude(field, (2 * Math.PI * index) / 3600);
      maximum = Math.max(maximum, value);
      minimum = Math.min(minimum, value);
    }
    const ellipse = polarizationEllipse(field);
    expect(ellipse.semiMajor).toBeCloseTo(maximum, 5);
    expect(ellipse.semiMinor).toBeCloseTo(minimum, 5);
  });
});
