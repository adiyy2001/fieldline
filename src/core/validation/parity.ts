import { FIELD_COMPONENTS } from '../backend/types';

export const PARITY_FLOOR_FRACTION = 0.01;
export const PARITY_TARGET = 1e-3;

export interface ParityStatistics {
  readonly comparedPoints: number;
  readonly totalPoints: number;
  readonly maximum: number;
  readonly mean: number;
  readonly worstIndex: number;
}

export interface ParityReport {
  readonly electric: ParityStatistics;
  readonly magnetic: ParityStatistics;
  readonly finite: boolean;
}

interface ComponentRange {
  readonly first: number;
  readonly last: number;
}

export const ELECTRIC_COMPONENTS: ComponentRange = { first: 0, last: 6 };
export const MAGNETIC_COMPONENTS: ComponentRange = { first: 6, last: 12 };

function norm(values: ArrayLike<number>, offset: number, range: ComponentRange): number {
  let sum = 0;
  for (let component = range.first; component < range.last; component += 1) {
    const value = values[offset + component] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function distance(
  reference: ArrayLike<number>,
  candidate: ArrayLike<number>,
  offset: number,
  range: ComponentRange,
): number {
  let sum = 0;
  for (let component = range.first; component < range.last; component += 1) {
    const difference = (candidate[offset + component] ?? 0) - (reference[offset + component] ?? 0);
    sum += difference * difference;
  }
  return Math.sqrt(sum);
}

function statistics(
  reference: ArrayLike<number>,
  candidate: ArrayLike<number>,
  range: ComponentRange,
  floorFraction: number,
): ParityStatistics {
  const totalPoints = Math.floor(reference.length / FIELD_COMPONENTS);
  let largest = 0;
  for (let point = 0; point < totalPoints; point += 1) {
    largest = Math.max(largest, norm(reference, point * FIELD_COMPONENTS, range));
  }
  const floor = floorFraction * largest;
  let comparedPoints = 0;
  let sum = 0;
  let maximum = 0;
  let worstIndex = -1;
  for (let point = 0; point < totalPoints; point += 1) {
    const offset = point * FIELD_COMPONENTS;
    const magnitude = norm(reference, offset, range);
    if (magnitude > 0 && magnitude >= floor) {
      const error = distance(reference, candidate, offset, range) / magnitude;
      comparedPoints += 1;
      sum += error;
      if (error > maximum || worstIndex < 0) {
        maximum = error;
        worstIndex = point;
      }
    }
  }
  return {
    comparedPoints,
    totalPoints,
    maximum,
    mean: comparedPoints > 0 ? sum / comparedPoints : 0,
    worstIndex,
  };
}

function allFinite(values: Iterable<number>): boolean {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      return false;
    }
  }
  return true;
}

export function compareFields(
  reference: ArrayLike<number>,
  candidate: ArrayLike<number> & Iterable<number>,
  floorFraction = PARITY_FLOOR_FRACTION,
): ParityReport {
  if (reference.length !== candidate.length) {
    throw new RangeError(
      `The buffers differ in length: ${reference.length} against ${candidate.length}`,
    );
  }
  return {
    electric: statistics(reference, candidate, ELECTRIC_COMPONENTS, floorFraction),
    magnetic: statistics(reference, candidate, MAGNETIC_COMPONENTS, floorFraction),
    finite: allFinite(candidate),
  };
}

export interface MirrorDifference {
  readonly comparedPoints: number;
  readonly maximum: number;
}

function resultantMagnitudes(values: ArrayLike<number>, range: ComponentRange): Float64Array {
  const count = Math.floor(values.length / FIELD_COMPONENTS);
  return Float64Array.from({ length: count }, (_, point) =>
    norm(values, point * FIELD_COMPONENTS, range),
  );
}

export function mirrorDifference(
  original: ArrayLike<number>,
  mirrored: ArrayLike<number>,
  columns: number,
  range: ComponentRange = ELECTRIC_COMPONENTS,
  floorFraction = PARITY_FLOOR_FRACTION,
): MirrorDifference {
  const first = resultantMagnitudes(original, range);
  const second = resultantMagnitudes(mirrored, range);
  const floor = floorFraction * first.reduce((largest, value) => Math.max(largest, value), 0);
  let comparedPoints = 0;
  let maximum = 0;
  first.forEach((magnitude, index) => {
    const row = Math.floor(index / columns);
    const mirroredIndex = row * columns + (columns - 1 - (index % columns));
    if (magnitude > 0 && magnitude >= floor) {
      comparedPoints += 1;
      maximum = Math.max(maximum, Math.abs((second[mirroredIndex] ?? 0) - magnitude) / magnitude);
    }
  });
  return { comparedPoints, maximum };
}
