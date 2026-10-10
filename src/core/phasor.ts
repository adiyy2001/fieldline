import { DEGREES_TO_RADIANS, SQRT2, SQRT3 } from './constants';
import { type Complex, add, fromPolar, magnitudeSquared, multiply, scale, ZERO } from './complex';

export interface ComplexVector3 {
  readonly x: Complex;
  readonly y: Complex;
  readonly z: Complex;
}

export interface RealVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PolarizationEllipse {
  readonly semiMajor: number;
  readonly semiMinor: number;
}

export const ZERO_VECTOR: ComplexVector3 = { x: ZERO, y: ZERO, z: ZERO };
export const PHASE_ANGLES_DEGREES: readonly [number, number, number] = [0, -120, 120];

export type PhaseTriple = readonly [Complex, Complex, Complex];

function perPhase(build: (angleDegrees: number) => Complex): PhaseTriple {
  const [first, second, third] = PHASE_ANGLES_DEGREES;
  return [build(first), build(second), build(third)];
}

export function phaseVoltagePhasors(lineToLineVolts: number): PhaseTriple {
  const phaseVolts = lineToLineVolts / SQRT3;
  return perPhase((angle) => fromPolar(phaseVolts, angle * DEGREES_TO_RADIANS));
}

export function phaseCurrentPhasors(amperes: number, powerFactorAngleDegrees: number): PhaseTriple {
  return perPhase((angle) =>
    fromPolar(amperes, (angle - powerFactorAngleDegrees) * DEGREES_TO_RADIANS),
  );
}

export function addVectors(a: ComplexVector3, b: ComplexVector3): ComplexVector3 {
  return { x: add(a.x, b.x), y: add(a.y, b.y), z: add(a.z, b.z) };
}

export function scaleVector(vector: ComplexVector3, factor: Complex): ComplexVector3 {
  return {
    x: multiply(vector.x, factor),
    y: multiply(vector.y, factor),
    z: multiply(vector.z, factor),
  };
}

export function scaleVectorReal(vector: ComplexVector3, factor: number): ComplexVector3 {
  return { x: scale(vector.x, factor), y: scale(vector.y, factor), z: scale(vector.z, factor) };
}

export function resultantRms(vector: ComplexVector3): number {
  return Math.sqrt(
    magnitudeSquared(vector.x) + magnitudeSquared(vector.y) + magnitudeSquared(vector.z),
  );
}

export function instantaneousVector(vector: ComplexVector3, angleRadians: number): RealVector3 {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const component = (value: Complex): number => SQRT2 * (value.re * cos - value.im * sin);
  return { x: component(vector.x), y: component(vector.y), z: component(vector.z) };
}

export function instantaneousMagnitude(vector: ComplexVector3, angleRadians: number): number {
  const real = instantaneousVector(vector, angleRadians);
  return Math.hypot(real.x, real.y, real.z);
}

function nonConjugatedSquareMagnitude(vector: ComplexVector3): number {
  const square = (value: Complex): Complex => multiply(value, value);
  const total = add(add(square(vector.x), square(vector.y)), square(vector.z));
  return Math.hypot(total.re, total.im);
}

export function polarizationEllipse(vector: ComplexVector3): PolarizationEllipse {
  const power =
    magnitudeSquared(vector.x) + magnitudeSquared(vector.y) + magnitudeSquared(vector.z);
  const asymmetry = nonConjugatedSquareMagnitude(vector);
  return {
    semiMajor: Math.sqrt(power + asymmetry),
    semiMinor: Math.sqrt(Math.max(power - asymmetry, 0)),
  };
}
