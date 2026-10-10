import {
  ONE,
  ZERO,
  add,
  argument,
  complex,
  conjugate,
  fromPolar,
  magnitude,
  magnitudeSquared,
  multiply,
  scale,
  subtract,
  sum,
} from './complex';

describe('complex arithmetic', () => {
  it('adds, subtracts and scales componentwise', () => {
    expect(add(complex(1, 2), complex(3, -4))).toEqual({ re: 4, im: -2 });
    expect(subtract(complex(1, 2), complex(3, -4))).toEqual({ re: -2, im: 6 });
    expect(scale(complex(1, -2), 3)).toEqual({ re: 3, im: -6 });
  });

  it('multiplies according to i squared equal to minus one', () => {
    expect(multiply(complex(0, 1), complex(0, 1))).toEqual({ re: -1, im: 0 });
    expect(multiply(complex(1, 2), complex(3, 4))).toEqual({ re: -5, im: 10 });
    expect(multiply(ONE, complex(2, 5))).toEqual({ re: 2, im: 5 });
  });

  it('computes magnitude, argument and the conjugate', () => {
    expect(magnitude(complex(3, 4))).toBe(5);
    expect(magnitudeSquared(complex(3, 4))).toBe(25);
    expect(argument(complex(0, 2))).toBeCloseTo(Math.PI / 2, 14);
    expect(conjugate(complex(1, 2))).toEqual({ re: 1, im: -2 });
  });

  it('builds a number from polar form', () => {
    const value = fromPolar(2, Math.PI / 3);
    expect(value.re).toBeCloseTo(1, 14);
    expect(value.im).toBeCloseTo(Math.sqrt(3), 14);
  });

  it('sums a list and returns zero for an empty list', () => {
    expect(sum([complex(1, 1), complex(2, -3)])).toEqual({ re: 3, im: -2 });
    expect(sum([])).toEqual(ZERO);
  });
});
