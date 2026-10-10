import type { Point3 } from '../field-types';
import type { Point2 } from '../geometry/bundle';

export const BASIS_COMPONENTS = 6;

export interface BasisFields {
  readonly pointCount: number;
  readonly groupCount: number;
  readonly electric: Float64Array;
  readonly magnetic: Float64Array;
}

export interface BasisFieldSource {
  readonly groupCount: number;
  readonly groupPositions: readonly Point2[];
  readonly electricDipolePerVolt: readonly number[];
  sample(points: readonly Point3[]): BasisFields;
}

export function basisOffset(fields: BasisFields, group: number, point: number): number {
  return (group * fields.pointCount + point) * BASIS_COMPONENTS;
}
