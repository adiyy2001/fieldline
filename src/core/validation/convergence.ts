import { createFieldEvaluator2D } from '../field2d/evaluator';
import { crossSectionFromLine } from '../field2d/cross-section';
import { createCrossSectionSolver } from '../field2d/solver';
import { createFieldEvaluator3D } from '../field3d/evaluate';
import { solveLine } from '../field3d/solve-line';
import type { DiscretizationOptions } from '../geometry/discretize';
import { defaultParameters, lineGeometryFromParameters } from '../model/parameters';
import { TOWER_KINDS, TOWER_LABELS } from '../geometry/tower';
import { groupExcitation } from '../model/excitation';
import type { LineParameters } from '../model/parameters';
import { DEFAULT_PROFILE_SPEC, type Profile, profilePeak, sampleProfile } from '../profile/sampler';

export interface PeakPair {
  readonly electric: number;
  readonly magnetic: number;
}

export interface MidSpanComparison {
  readonly threeDimensional: PeakPair;
  readonly twoDimensional: PeakPair;
  readonly electricRatio: number;
  readonly magneticRatio: number;
  readonly segmentCount: number;
}

export interface ConvergenceSample {
  readonly value: number;
  readonly electricRatio: number;
  readonly magneticRatio: number;
  readonly segmentCount: number;
}

function peaks(profile: Profile): PeakPair {
  return {
    electric: profilePeak(profile, 'electric').value,
    magnetic: profilePeak(profile, 'magnetic').value,
  };
}

export function compareAtMidSpan(
  parameters: LineParameters,
  overrides: Partial<DiscretizationOptions> = {},
): MidSpanComparison {
  const { system } = solveLine(parameters, overrides);
  const excitation = groupExcitation(parameters);
  const spec = { ...DEFAULT_PROFILE_SPEC, z: system.reference.midZ };
  const threeDimensional = peaks(
    sampleProfile(createFieldEvaluator3D(system, excitation.voltages, excitation.currents), spec),
  );
  const section = crossSectionFromLine(lineGeometryFromParameters(parameters), {
    spanIndex: system.reference.index,
    bundleMode: 'equivalent',
  });
  const twoDimensional = peaks(
    sampleProfile(
      createFieldEvaluator2D(
        createCrossSectionSolver(section),
        excitation.voltages,
        excitation.currents,
      ),
      spec,
    ),
  );
  return {
    threeDimensional,
    twoDimensional,
    electricRatio: threeDimensional.electric / twoDimensional.electric,
    magneticRatio: threeDimensional.magnetic / twoDimensional.magnetic,
    segmentCount: system.set.count,
  };
}

function sweep(
  values: readonly number[],
  build: (value: number) => {
    parameters: LineParameters;
    options?: Partial<DiscretizationOptions>;
  },
): readonly ConvergenceSample[] {
  return values.map((value) => {
    const { parameters, options } = build(value);
    const comparison = compareAtMidSpan(parameters, options);
    return {
      value,
      electricRatio: comparison.electricRatio,
      magneticRatio: comparison.magneticRatio,
      segmentCount: comparison.segmentCount,
    };
  });
}

export function ratioVersusSegments(
  base: LineParameters,
  segmentCounts: readonly number[],
): readonly ConvergenceSample[] {
  return sweep(segmentCounts, (value) => ({
    parameters: { ...base, segmentsPerSpan: value },
  }));
}

export function ratioVersusSpanLength(
  base: LineParameters,
  spanLengths: readonly number[],
): readonly ConvergenceSample[] {
  return sweep(spanLengths, (value) => ({
    parameters: { ...base, spanLengths: base.spanLengths.map(() => value) },
  }));
}

export function ratioVersusSag(
  base: LineParameters,
  sags: readonly number[],
): readonly ConvergenceSample[] {
  return sweep(sags, (value) => ({ parameters: { ...base, phaseSag: value } }));
}

export interface ConvergenceGrid {
  readonly segmentCounts: readonly number[];
  readonly spanLengths: readonly number[];
  readonly sags: readonly number[];
  readonly referenceSegments: number;
}

export const DEFAULT_CONVERGENCE_GRID: ConvergenceGrid = {
  segmentCounts: [4, 6, 8, 10, 12, 16, 20, 24, 32, 48],
  spanLengths: [50, 75, 100, 150, 200, 300, 400, 600, 800],
  sags: [0, 2, 4, 6, 8, 10, 12, 15, 20, 25],
  referenceSegments: 48,
};

export interface ConvergenceCurves {
  readonly catenary: readonly ConvergenceSample[];
  readonly straight: readonly ConvergenceSample[];
}

export interface RunOutEffect {
  readonly electricChange: number;
  readonly magneticChange: number;
}

export interface DiscretizationError {
  readonly segmentsPerSpan: number;
  readonly referenceSegments: number;
  readonly electric: number;
  readonly magnetic: number;
}

export interface TowerRatio {
  readonly tower: string;
  readonly electricRatio: number;
  readonly magneticRatio: number;
}

export interface ConvergenceReport {
  readonly grid: ConvergenceGrid;
  readonly baseSag: number;
  readonly baseSpanLength: number;
  readonly segments: ConvergenceCurves;
  readonly spanLength: ConvergenceCurves;
  readonly sag: readonly ConvergenceSample[];
  readonly runOuts: RunOutEffect;
  readonly discretization: DiscretizationError;
  readonly towers: readonly TowerRatio[];
}

function relativeChange(value: number, reference: number): number {
  return Math.abs(value - reference) / Math.abs(reference);
}

function discretizationError(base: LineParameters, referenceSegments: number): DiscretizationError {
  const coarse = compareAtMidSpan(base);
  const fine = compareAtMidSpan({ ...base, segmentsPerSpan: referenceSegments });
  return {
    segmentsPerSpan: base.segmentsPerSpan,
    referenceSegments,
    electric: relativeChange(coarse.electricRatio, fine.electricRatio),
    magnetic: relativeChange(coarse.magneticRatio, fine.magneticRatio),
  };
}

function runOutEffect(base: LineParameters): RunOutEffect {
  const withRunOuts = compareAtMidSpan(base);
  const without = compareAtMidSpan(base, { runOuts: false });
  return {
    electricChange: relativeChange(without.electricRatio, withRunOuts.electricRatio),
    magneticChange: relativeChange(without.magneticRatio, withRunOuts.magneticRatio),
  };
}

function towerRatios(): readonly TowerRatio[] {
  return TOWER_KINDS.map((kind) => {
    const comparison = compareAtMidSpan(defaultParameters(kind));
    return {
      tower: TOWER_LABELS[kind],
      electricRatio: comparison.electricRatio,
      magneticRatio: comparison.magneticRatio,
    };
  });
}

export function buildConvergenceReport(
  grid: ConvergenceGrid = DEFAULT_CONVERGENCE_GRID,
): ConvergenceReport {
  const base = defaultParameters('horizontal');
  const straightBase = { ...base, phaseSag: 0 };
  return {
    grid,
    baseSag: base.phaseSag,
    baseSpanLength: base.spanLengths[0] ?? 300,
    segments: {
      catenary: ratioVersusSegments(base, grid.segmentCounts),
      straight: ratioVersusSegments(straightBase, grid.segmentCounts),
    },
    spanLength: {
      catenary: ratioVersusSpanLength(base, grid.spanLengths),
      straight: ratioVersusSpanLength(straightBase, grid.spanLengths),
    },
    sag: ratioVersusSag(base, grid.sags),
    runOuts: runOutEffect(base),
    discretization: discretizationError(base, grid.referenceSegments),
    towers: towerRatios(),
  };
}
