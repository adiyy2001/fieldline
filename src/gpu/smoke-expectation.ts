export interface SmokeReport {
  correct: number;
  total: number;
}

export const smokeElementCount = 1000;

export const smokeWorkgroupSize = 64;

export function workgroupCount(elementCount: number, workgroupSize: number): number {
  return Math.ceil(elementCount / workgroupSize);
}

export function expectedSmokeValues(elementCount: number): Uint32Array {
  return Uint32Array.from({ length: elementCount }, (_, index) => index * index + 7);
}

export function compareSmokeValues(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
): SmokeReport {
  let correct = 0;
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] === expected[index]) {
      correct += 1;
    }
  }
  return { correct, total: expected.length };
}
