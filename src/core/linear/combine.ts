import type { Complex } from '../complex';
import type { ComplexSeries } from '../field-types';

export function combineColumns(
  basis: readonly Float64Array[],
  weights: readonly Complex[],
  count: number,
): ComplexSeries {
  const re = new Float64Array(count);
  const im = new Float64Array(count);
  basis.forEach((column, group) => {
    const weight = weights[group];
    if (weight === undefined) {
      return;
    }
    for (let row = 0; row < count; row += 1) {
      const value = column[row] ?? 0;
      re[row] = (re[row] ?? 0) + value * weight.re;
      im[row] = (im[row] ?? 0) + value * weight.im;
    }
  });
  return { re, im };
}
