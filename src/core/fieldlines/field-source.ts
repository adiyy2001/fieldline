import { SQRT2 } from '../constants';
import type { FieldEvaluator, Point3 } from '../field-types';
import type { ComplexVector3 } from '../phasor';
import type { LineKind, VectorField } from './types';

export function instantaneousVector(vector: ComplexVector3, phaseRadians: number): Point3 {
  const cos = Math.cos(phaseRadians);
  const sin = Math.sin(phaseRadians);
  return {
    x: SQRT2 * (vector.x.re * cos - vector.x.im * sin),
    y: SQRT2 * (vector.y.re * cos - vector.y.im * sin),
    z: SQRT2 * (vector.z.re * cos - vector.z.im * sin),
  };
}

export function instantaneousVectorField(
  evaluator: FieldEvaluator,
  kind: LineKind,
  phaseRadians: number,
): VectorField {
  return (point) => {
    const pair = evaluator(point);
    return instantaneousVector(kind === 'electric' ? pair.electric : pair.magnetic, phaseRadians);
  };
}
