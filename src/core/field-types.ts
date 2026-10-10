import type { ComplexVector3 } from './phasor';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FieldPair {
  readonly electric: ComplexVector3;
  readonly magnetic: ComplexVector3;
}

export type FieldEvaluator = (point: Point3) => FieldPair;
