export function relativeError(value: number, reference: number): number {
  if (reference === 0) {
    return Math.abs(value);
  }
  return Math.abs(value - reference) / Math.abs(reference);
}

export function maximumRelativeError(
  values: readonly number[],
  references: readonly number[],
): number {
  return values.reduce(
    (worst, value, index) => Math.max(worst, relativeError(value, references[index] ?? 0)),
    0,
  );
}

export function maximumOf(values: readonly number[]): number {
  return values.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY);
}
