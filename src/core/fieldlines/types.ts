import type { Point3 } from '../field-types';

export type LineKind = 'electric' | 'magnetic';
export type LineEnd = 'running' | 'ground' | 'conductor' | 'domain' | 'stalled';

export const LINE_END_CODES: Readonly<Record<LineEnd, number>> = {
  running: 0,
  ground: 1,
  conductor: 2,
  domain: 3,
  stalled: 4,
};

export function lineEndFromCode(code: number): LineEnd {
  const found = (Object.keys(LINE_END_CODES) as LineEnd[]).find(
    (end) => LINE_END_CODES[end] === code,
  );
  return found ?? 'stalled';
}

export interface LineSeed {
  readonly kind: LineKind;
  readonly origin: Point3;
  readonly outward: Point3;
  readonly arcLength: number;
}

export interface TraceBox {
  readonly min: Point3;
  readonly max: Point3;
}

export interface TraceSettings {
  readonly stepCount: number;
  readonly box: TraceBox;
  readonly groundHeight: number;
}

export const TRACE_CONSTANTS = {
  stopRatio: 1.15,
  stepFraction: 0.4,
  minimumStep: 0.05,
  maximumStep: 1.5,
  vanishingField: 1e-9,
} as const;

export const DEFAULT_LINE_COUNT = 128;
export const DEFAULT_STEP_COUNT = 192;
export const LINE_COUNT_RANGE = { min: 16, max: 256, step: 16 } as const;
export const STEP_COUNT_RANGE = { min: 64, max: 384, step: 32 } as const;
export const SEED_RING_FACTOR = 2;
export const MAGNETIC_SEED_RADII: readonly number[] = [2, 4, 7];

export interface TracedLine {
  readonly kind: LineKind;
  readonly positions: Float64Array;
  readonly arcLengths: Float64Array;
  readonly magnitudes: Float64Array;
  readonly pointCount: number;
  readonly end: LineEnd;
}

export type VectorField = (point: Point3) => Point3;

export interface Clearance {
  readonly minimumDistance: number;
  readonly minimumClearance: number;
}

export type ClearanceField = (point: Point3) => Clearance;
