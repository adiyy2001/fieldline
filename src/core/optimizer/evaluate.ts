import { type Complex, magnitude, multiply, sum } from '../complex';
import type { Point3 } from '../field-types';
import { type ProfileSpec, profilePositions } from '../profile/sampler';
import { phaseCurrentPhasors, phaseVoltagePhasors } from '../phasor';
import {
  type Arrangement,
  type Permutation,
  arrangementLabel,
  arrangementPhasing,
  classKey,
  classOfArrangement,
  classRepresentatives,
  isSelfMirrored,
  mirrorClass,
} from './arrangements';
import {
  BASIS_COMPONENTS,
  type BasisFieldSource,
  type BasisFields,
  basisOffset,
} from './basis-field-source';

export interface OptimizerSettings {
  readonly lineToLineVolts: number;
  readonly currentAmperes: number;
  readonly powerFactorAngleDegrees: number;
  readonly profile: ProfileSpec;
  readonly distance: number;
}

export interface ArrangementMetrics {
  readonly peakElectric: number;
  readonly peakMagnetic: number;
  readonly electricAtDistance: number;
  readonly magneticAtDistance: number;
}

export interface ArrangementMoments {
  readonly electric: number;
  readonly magnetic: number;
}

export interface ArrangementProfile {
  readonly x: readonly number[];
  readonly electric: Float64Array;
  readonly magnetic: Float64Array;
}

export interface ArrangementResult {
  readonly arrangement: Arrangement;
  readonly label: string;
  readonly classKey: string;
  readonly mirrorClassKey: string;
  readonly selfMirrored: boolean;
  readonly metrics: ArrangementMetrics;
  readonly moments: ArrangementMoments;
  readonly profile: ArrangementProfile;
}

function fieldRmsAt(
  basis: Float64Array,
  fields: BasisFields,
  weights: readonly Complex[],
  point: number,
): number {
  const sums = new Float64Array(BASIS_COMPONENTS);
  weights.forEach((weight, group) => {
    const offset = basisOffset(fields, group, point);
    for (let component = 0; component < BASIS_COMPONENTS; component += 2) {
      const re = basis[offset + component] ?? 0;
      const im = basis[offset + component + 1] ?? 0;
      sums[component] = (sums[component] ?? 0) + re * weight.re - im * weight.im;
      sums[component + 1] = (sums[component + 1] ?? 0) + re * weight.im + im * weight.re;
    }
  });
  let total = 0;
  for (const value of sums) {
    total += value * value;
  }
  return Math.sqrt(total);
}

function weightsFor(
  phasing: readonly number[],
  phasors: readonly Complex[],
  groupCount: number,
): readonly Complex[] {
  return Array.from({ length: groupCount }, (_, group) => {
    const phase = phasing[group];
    const phasor = phase === undefined ? undefined : phasors[phase];
    return phasor ?? { re: 0, im: 0 };
  });
}

function momentOf(weights: readonly Complex[], coefficients: readonly number[]): number {
  return magnitude(
    sum(weights.map((weight, group) => multiply(weight, { re: coefficients[group] ?? 0, im: 0 }))),
  );
}

function magneticMoment(source: BasisFieldSource, currents: readonly Complex[]): number {
  const xMoment = momentOf(
    currents,
    source.groupPositions.map((position) => position.x),
  );
  const yMoment = momentOf(
    currents,
    source.groupPositions.map((position) => position.y),
  );
  return Math.hypot(xMoment, yMoment);
}

export function optimizerPoints(settings: OptimizerSettings): readonly Point3[] {
  const { height, z } = settings.profile;
  const profilePoints = profilePositions(settings.profile).map((x) => ({ x, y: height, z }));
  return [
    ...profilePoints,
    { x: -settings.distance, y: height, z },
    { x: settings.distance, y: height, z },
  ];
}

function peakOf(values: Float64Array): number {
  return values.reduce((best, value) => Math.max(best, value), 0);
}

export function evaluateArrangements(
  source: BasisFieldSource,
  settings: OptimizerSettings,
  arrangements: readonly Arrangement[] = classRepresentatives(),
): readonly ArrangementResult[] {
  const points = optimizerPoints(settings);
  const fields = source.sample(points);
  const xs = profilePositions(settings.profile);
  const voltages = phaseVoltagePhasors(settings.lineToLineVolts);
  const currents = phaseCurrentPhasors(settings.currentAmperes, settings.powerFactorAngleDegrees);
  return arrangements.map((arrangement) => {
    const phasing = arrangementPhasing(arrangement);
    const voltageWeights = weightsFor(phasing, voltages, source.groupCount);
    const currentWeights = weightsFor(phasing, currents, source.groupCount);
    const electric = new Float64Array(points.length);
    const magnetic = new Float64Array(points.length);
    for (let point = 0; point < points.length; point += 1) {
      electric[point] = fieldRmsAt(fields.electric, fields, voltageWeights, point);
      magnetic[point] = fieldRmsAt(fields.magnetic, fields, currentWeights, point);
    }
    const lastIndex = points.length - 1;
    const metrics: ArrangementMetrics = {
      peakElectric: peakOf(electric.subarray(0, xs.length)),
      peakMagnetic: peakOf(magnetic.subarray(0, xs.length)),
      electricAtDistance: Math.max(electric[lastIndex - 1] ?? 0, electric[lastIndex] ?? 0),
      magneticAtDistance: Math.max(magnetic[lastIndex - 1] ?? 0, magnetic[lastIndex] ?? 0),
    };
    const permutation: Permutation = classOfArrangement(arrangement);
    return {
      arrangement,
      label: arrangementLabel(arrangement),
      classKey: classKey(permutation),
      mirrorClassKey: classKey(mirrorClass(permutation)),
      selfMirrored: isSelfMirrored(permutation),
      metrics,
      moments: {
        electric: momentOf(voltageWeights, source.electricDipolePerVolt),
        magnetic: magneticMoment(source, currentWeights),
      },
      profile: {
        x: xs,
        electric: electric.slice(0, xs.length),
        magnetic: magnetic.slice(0, xs.length),
      },
    };
  });
}
