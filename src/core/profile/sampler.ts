import type { FieldEvaluator } from '../field-types';
import type { FieldQuantity } from '../exposure/levels';
import { type ComplexVector3, resultantRms } from '../phasor';

export interface ProfileSpec {
  readonly xMin: number;
  readonly xMax: number;
  readonly step: number;
  readonly height: number;
  readonly z: number;
}

export interface ProfileSample {
  readonly x: number;
  readonly electricRms: number;
  readonly magneticRms: number;
  readonly electric: ComplexVector3;
  readonly magnetic: ComplexVector3;
}

export interface Profile {
  readonly spec: ProfileSpec;
  readonly samples: readonly ProfileSample[];
}

export interface ProfilePeak {
  readonly x: number;
  readonly value: number;
}

export const DEFAULT_PROFILE_SPEC: ProfileSpec = {
  xMin: -60,
  xMax: 60,
  step: 0.5,
  height: 1,
  z: 0,
};

export function profilePositions(spec: ProfileSpec): readonly number[] {
  if (!(spec.step > 0) || spec.xMax < spec.xMin) {
    throw new RangeError('The profile needs a positive step and xMax not below xMin');
  }
  const count = Math.floor((spec.xMax - spec.xMin) / spec.step + 1e-9) + 1;
  return Array.from({ length: count }, (_, index) => spec.xMin + index * spec.step);
}

export function sampleProfile(evaluate: FieldEvaluator, spec: ProfileSpec): Profile {
  const samples = profilePositions(spec).map((x): ProfileSample => {
    const field = evaluate({ x, y: spec.height, z: spec.z });
    return {
      x,
      electricRms: resultantRms(field.electric),
      magneticRms: resultantRms(field.magnetic),
      electric: field.electric,
      magnetic: field.magnetic,
    };
  });
  return { spec, samples };
}

export function profileValues(profile: Profile, quantity: FieldQuantity): readonly number[] {
  return profile.samples.map((sample) =>
    quantity === 'electric' ? sample.electricRms : sample.magneticRms,
  );
}

export function profilePeak(profile: Profile, quantity: FieldQuantity): ProfilePeak {
  let best: ProfilePeak = { x: Number.NaN, value: Number.NEGATIVE_INFINITY };
  for (const sample of profile.samples) {
    const value = quantity === 'electric' ? sample.electricRms : sample.magneticRms;
    if (value > best.value) {
      best = { x: sample.x, value };
    }
  }
  return best;
}
