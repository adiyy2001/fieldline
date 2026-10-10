import fc from 'fast-check';
import { SingularMatrixError, factorLu, solveLu } from './lu';

function multiplyMatrix(matrix: Float64Array, size: number, vector: Float64Array): Float64Array {
  return Float64Array.from({ length: size }, (_, row) => {
    let total = 0;
    for (let column = 0; column < size; column += 1) {
      total += (matrix[row * size + column] ?? 0) * (vector[column] ?? 0);
    }
    return total;
  });
}

describe('LU factorization', () => {
  it('solves a small system by hand', () => {
    const matrix = Float64Array.from([2, 1, 1, 3]);
    const factors = factorLu(matrix, 2);
    const rhs = Float64Array.from([3, 5]);
    solveLu(factors, rhs);
    expect(rhs[0]).toBeCloseTo(0.8, 14);
    expect(rhs[1]).toBeCloseTo(1.4, 14);
  });

  it('pivots when the leading entry is zero', () => {
    const matrix = Float64Array.from([0, 1, 1, 0]);
    const factors = factorLu(matrix, 2);
    const rhs = Float64Array.from([2, 3]);
    solveLu(factors, rhs);
    expect(Array.from(rhs)).toEqual([3, 2]);
  });

  it('solves several right-hand sides in one call', () => {
    const matrix = Float64Array.from([4, 1, 2, 3]);
    const original = Float64Array.from(matrix);
    const factors = factorLu(matrix, 2);
    const rhs = Float64Array.from([1, 0, 0, 1]);
    solveLu(factors, rhs, 2);
    const first = multiplyMatrix(original, 2, Float64Array.from([rhs[0] ?? 0, rhs[2] ?? 0]));
    const second = multiplyMatrix(original, 2, Float64Array.from([rhs[1] ?? 0, rhs[3] ?? 0]));
    expect(first[0]).toBeCloseTo(1, 14);
    expect(first[1]).toBeCloseTo(0, 14);
    expect(second[0]).toBeCloseTo(0, 14);
    expect(second[1]).toBeCloseTo(1, 14);
  });

  it('reports a singular matrix with the failing column', () => {
    expect(() => factorLu(Float64Array.from([1, 2, 2, 4]), 2)).toThrow(SingularMatrixError);
    expect(() => factorLu(Float64Array.from([1, 2, 2, 4]), 2)).toThrow(
      expect.objectContaining({ column: 1 }),
    );
  });

  it('rejects arrays of the wrong length', () => {
    expect(() => factorLu(new Float64Array(5), 2)).toThrow(RangeError);
    const factors = factorLu(Float64Array.from([1, 0, 0, 1]), 2);
    expect(() => {
      solveLu(factors, new Float64Array(3));
    }).toThrow(RangeError);
  });

  it('leaves a small residual on diagonally dominant random systems', () => {
    const size = 6;
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), {
          minLength: size * size,
          maxLength: size * size,
        }),
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), {
          minLength: size,
          maxLength: size,
        }),
        (entries, rightHandSide) => {
          const matrix = Float64Array.from(entries);
          for (let index = 0; index < size; index += 1) {
            matrix[index * size + index] = (matrix[index * size + index] ?? 0) + size + 1;
          }
          const original = Float64Array.from(matrix);
          const solution = Float64Array.from(rightHandSide);
          solveLu(factorLu(matrix, size), solution);
          const product = multiplyMatrix(original, size, solution);
          rightHandSide.forEach((value, index) => {
            expect(product[index]).toBeCloseTo(value, 9);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
