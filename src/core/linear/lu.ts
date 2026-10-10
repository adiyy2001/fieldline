export interface LuFactors {
  readonly size: number;
  readonly lu: Float64Array;
  readonly pivots: Int32Array;
}

export class SingularMatrixError extends Error {
  constructor(readonly column: number) {
    super(`The matrix is singular at column ${column}`);
    this.name = 'SingularMatrixError';
  }
}

export function factorLu(matrix: Float64Array, size: number): LuFactors {
  if (matrix.length !== size * size) {
    throw new RangeError(`Expected ${size * size} entries, received ${matrix.length}`);
  }
  const pivots = new Int32Array(size);
  for (let column = 0; column < size; column += 1) {
    const pivotRow = findPivotRow(matrix, size, column);
    if (matrix[pivotRow * size + column] === 0) {
      throw new SingularMatrixError(column);
    }
    pivots[column] = pivotRow;
    swapRows(matrix, size, column, pivotRow);
    eliminateBelow(matrix, size, column);
  }
  return { size, lu: matrix, pivots };
}

function findPivotRow(matrix: Float64Array, size: number, column: number): number {
  let best = column;
  let bestMagnitude = Math.abs(matrix[column * size + column] ?? 0);
  for (let row = column + 1; row < size; row += 1) {
    const magnitude = Math.abs(matrix[row * size + column] ?? 0);
    if (magnitude > bestMagnitude) {
      best = row;
      bestMagnitude = magnitude;
    }
  }
  return best;
}

function swapRows(matrix: Float64Array, size: number, first: number, second: number): void {
  if (first === second) {
    return;
  }
  for (let column = 0; column < size; column += 1) {
    const upper = matrix[first * size + column] ?? 0;
    matrix[first * size + column] = matrix[second * size + column] ?? 0;
    matrix[second * size + column] = upper;
  }
}

function eliminateBelow(matrix: Float64Array, size: number, column: number): void {
  const pivot = matrix[column * size + column] ?? 1;
  for (let row = column + 1; row < size; row += 1) {
    const factor = (matrix[row * size + column] ?? 0) / pivot;
    matrix[row * size + column] = factor;
    if (factor !== 0) {
      for (let k = column + 1; k < size; k += 1) {
        matrix[row * size + k] =
          (matrix[row * size + k] ?? 0) - factor * (matrix[column * size + k] ?? 0);
      }
    }
  }
}

export function solveLu(factors: LuFactors, rightHandSides: Float64Array, columns = 1): void {
  const { size, lu, pivots } = factors;
  if (rightHandSides.length !== size * columns) {
    throw new RangeError(`Expected ${size * columns} entries, received ${rightHandSides.length}`);
  }
  applyRowSwaps(rightHandSides, pivots, size, columns);
  forwardSubstitute(lu, rightHandSides, size, columns);
  backSubstitute(lu, rightHandSides, size, columns);
}

function applyRowSwaps(rhs: Float64Array, pivots: Int32Array, size: number, columns: number): void {
  for (let row = 0; row < size; row += 1) {
    const target = pivots[row] ?? row;
    if (target !== row) {
      for (let c = 0; c < columns; c += 1) {
        const held = rhs[row * columns + c] ?? 0;
        rhs[row * columns + c] = rhs[target * columns + c] ?? 0;
        rhs[target * columns + c] = held;
      }
    }
  }
}

function forwardSubstitute(lu: Float64Array, rhs: Float64Array, size: number, columns: number) {
  for (let row = 1; row < size; row += 1) {
    for (let k = 0; k < row; k += 1) {
      const factor = lu[row * size + k] ?? 0;
      if (factor !== 0) {
        for (let c = 0; c < columns; c += 1) {
          rhs[row * columns + c] =
            (rhs[row * columns + c] ?? 0) - factor * (rhs[k * columns + c] ?? 0);
        }
      }
    }
  }
}

function backSubstitute(lu: Float64Array, rhs: Float64Array, size: number, columns: number) {
  for (let row = size - 1; row >= 0; row -= 1) {
    for (let k = row + 1; k < size; k += 1) {
      const factor = lu[row * size + k] ?? 0;
      if (factor !== 0) {
        for (let c = 0; c < columns; c += 1) {
          rhs[row * columns + c] =
            (rhs[row * columns + c] ?? 0) - factor * (rhs[k * columns + c] ?? 0);
        }
      }
    }
    const diagonal = lu[row * size + row] ?? 1;
    for (let c = 0; c < columns; c += 1) {
      rhs[row * columns + c] = (rhs[row * columns + c] ?? 0) / diagonal;
    }
  }
}
