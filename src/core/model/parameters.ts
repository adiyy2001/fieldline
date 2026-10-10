import { DEFAULT_FREQUENCY_HZ } from '../constants';
import type { BundleSpec } from '../geometry/bundle';
import { type LineGeometry, buildLineGeometry, midSpanHeight } from '../geometry/line-geometry';
import {
  DEFAULT_TOWERS,
  type TowerDimensions,
  type TowerKind,
  phasePositionCount,
} from '../geometry/tower';

export interface NumberRange {
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface LineParameters {
  readonly tower: TowerDimensions;
  readonly lineToLineKilovolts: number;
  readonly currentAmperes: number;
  readonly powerFactorAngleDegrees: number;
  readonly frequencyHz: number;
  readonly spanLengths: readonly number[];
  readonly phaseSag: number;
  readonly shieldSagRatio: number;
  readonly segmentsPerSpan: number;
  readonly bundleCount: number;
  readonly bundleSpacingMetres: number;
  readonly subconductorDiameterMillimetres: number;
  readonly shieldDiameterMillimetres: number;
  readonly phasing: readonly number[];
}

export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
}

export const MINIMUM_GROUND_CLEARANCE = 2;
export const DEFAULT_SEGMENTS_PER_SPAN = 12;
export const DRAFT_SEGMENTS_PER_SPAN = 8;

export const ELECTRICAL_RANGES = {
  lineToLineKilovolts: { label: 'Line voltage', unit: 'kV', min: 10, max: 1200, step: 1 },
  currentAmperes: { label: 'Current per phase', unit: 'A', min: 0, max: 5000, step: 10 },
  powerFactorAngleDegrees: { label: 'Power factor angle', unit: '°', min: -90, max: 90, step: 1 },
  frequencyHz: { label: 'Frequency', unit: 'Hz', min: 50, max: 60, step: 10 },
} as const satisfies Record<string, NumberRange>;

export const CONDUCTOR_RANGES = {
  spanLength: { label: 'Span length', unit: 'm', min: 50, max: 800, step: 10 },
  phaseSag: { label: 'Sag', unit: 'm', min: 0, max: 40, step: 0.5 },
  shieldSagRatio: { label: 'Shield wire sag ratio', unit: '', min: 0.5, max: 1.2, step: 0.05 },
  segmentsPerSpan: { label: 'Segments per span', unit: '', min: 4, max: 24, step: 1 },
  bundleCount: { label: 'Subconductors per bundle', unit: '', min: 1, max: 4, step: 1 },
  bundleSpacingMetres: { label: 'Bundle spacing', unit: 'm', min: 0.1, max: 1, step: 0.05 },
  subconductorDiameterMillimetres: {
    label: 'Subconductor diameter',
    unit: 'mm',
    min: 8,
    max: 60,
    step: 0.1,
  },
  shieldDiameterMillimetres: {
    label: 'Shield wire diameter',
    unit: 'mm',
    min: 6,
    max: 40,
    step: 0.1,
  },
} as const satisfies Record<string, NumberRange>;

export const TOWER_RANGES: Readonly<Record<string, NumberRange>> = {
  phaseHeight: { label: 'Phase height', unit: 'm', min: 8, max: 80, step: 0.5 },
  phaseSpacing: { label: 'Phase spacing', unit: 'm', min: 1, max: 30, step: 0.5 },
  lowerHeight: { label: 'Lower phase height', unit: 'm', min: 8, max: 80, step: 0.5 },
  lowerSpacing: { label: 'Lower phase spacing', unit: 'm', min: 1, max: 30, step: 0.5 },
  apexRise: { label: 'Apex rise', unit: 'm', min: 1, max: 20, step: 0.5 },
  bottomHeight: { label: 'Bottom phase height', unit: 'm', min: 8, max: 80, step: 0.5 },
  levelSpacing: { label: 'Level spacing', unit: 'm', min: 2, max: 20, step: 0.5 },
  circuitHalfSpacing: { label: 'Circuit half spacing', unit: 'm', min: 1, max: 20, step: 0.5 },
  shieldRise: { label: 'Shield wire rise', unit: 'm', min: 1, max: 20, step: 0.5 },
  shieldHalfSpacing: { label: 'Shield wire half spacing', unit: 'm', min: 0.5, max: 20, step: 0.5 },
};

export function defaultPhasing(kind: TowerKind): readonly number[] {
  return phasePositionCount(kind) === 6 ? [0, 1, 2, 0, 1, 2] : [0, 1, 2];
}

export function defaultParameters(kind: TowerKind = 'horizontal'): LineParameters {
  return {
    tower: DEFAULT_TOWERS[kind],
    lineToLineKilovolts: 400,
    currentAmperes: 1000,
    powerFactorAngleDegrees: 0,
    frequencyHz: DEFAULT_FREQUENCY_HZ,
    spanLengths: [300, 300, 300],
    phaseSag: 10,
    shieldSagRatio: 0.9,
    segmentsPerSpan: DEFAULT_SEGMENTS_PER_SPAN,
    bundleCount: 3,
    bundleSpacingMetres: 0.4,
    subconductorDiameterMillimetres: 30,
    shieldDiameterMillimetres: 19,
    phasing: defaultPhasing(kind),
  };
}

function rangeIssue(field: string, value: number, range: NumberRange): ValidationIssue | undefined {
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    return {
      field,
      message: `${range.label} must be between ${range.min} and ${range.max} ${range.unit}`.trim(),
    };
  }
  return undefined;
}

function integerIssues(parameters: LineParameters): readonly ValidationIssue[] {
  const whole: readonly (readonly [string, number, NumberRange])[] = [
    ['segmentsPerSpan', parameters.segmentsPerSpan, CONDUCTOR_RANGES.segmentsPerSpan],
    ['bundleCount', parameters.bundleCount, CONDUCTOR_RANGES.bundleCount],
  ];
  return whole
    .filter(([, value]) => !Number.isInteger(value))
    .map(([field, , range]) => ({ field, message: `${range.label} must be a whole number` }));
}

function towerIssues(tower: TowerDimensions): readonly ValidationIssue[] {
  return Object.entries(tower).flatMap(([key, value]) => {
    const range = TOWER_RANGES[key];
    if (range === undefined || typeof value !== 'number') {
      return [];
    }
    return rangeIssue(`tower.${key}`, value, range) ?? [];
  });
}

function phasingIssues(parameters: LineParameters): readonly ValidationIssue[] {
  const expected = phasePositionCount(parameters.tower.kind);
  const phasing = parameters.phasing;
  const triples = expected === 6 ? [phasing.slice(0, 3), phasing.slice(3, 6)] : [phasing];
  const valid =
    phasing.length === expected && triples.every((t) => [...t].sort().join('') === '012');
  return valid ? [] : [{ field: 'phasing', message: 'Each circuit needs phases A, B and C once' }];
}

function spanIssues(parameters: LineParameters): readonly ValidationIssue[] {
  const lengthRange = CONDUCTOR_RANGES.spanLength;
  const countIssue: ValidationIssue[] =
    parameters.spanLengths.length >= 2 && parameters.spanLengths.length <= 3
      ? []
      : [{ field: 'spanLengths', message: 'A line has two or three spans' }];
  const lengthIssues = parameters.spanLengths.flatMap(
    (length, index) => rangeIssue(`spanLengths.${index}`, length, lengthRange) ?? [],
  );
  const shortest = Math.min(...parameters.spanLengths);
  const sagIssue: ValidationIssue[] =
    parameters.phaseSag > shortest / 4
      ? [{ field: 'phaseSag', message: 'The sag must not exceed a quarter of the shortest span' }]
      : [];
  return [...countIssue, ...lengthIssues, ...sagIssue];
}

function clearanceIssues(parameters: LineParameters): readonly ValidationIssue[] {
  const geometry = lineGeometryFromParameters(parameters);
  const span = geometry.spans.reduce((a, b) => (a.length <= b.length ? a : b));
  const lowest = Math.min(...geometry.conductors.map((c) => midSpanHeight(c, span)));
  return lowest < MINIMUM_GROUND_CLEARANCE
    ? [
        {
          field: 'phaseSag',
          message: `The lowest conductor must stay at least ${MINIMUM_GROUND_CLEARANCE} m above ground at mid-span`,
        },
      ]
    : [];
}

export function validateParameters(parameters: LineParameters): readonly ValidationIssue[] {
  const ranges: readonly (readonly [string, number, NumberRange])[] = [
    ['lineToLineKilovolts', parameters.lineToLineKilovolts, ELECTRICAL_RANGES.lineToLineKilovolts],
    ['currentAmperes', parameters.currentAmperes, ELECTRICAL_RANGES.currentAmperes],
    [
      'powerFactorAngleDegrees',
      parameters.powerFactorAngleDegrees,
      ELECTRICAL_RANGES.powerFactorAngleDegrees,
    ],
    ['phaseSag', parameters.phaseSag, CONDUCTOR_RANGES.phaseSag],
    ['shieldSagRatio', parameters.shieldSagRatio, CONDUCTOR_RANGES.shieldSagRatio],
    ['segmentsPerSpan', parameters.segmentsPerSpan, CONDUCTOR_RANGES.segmentsPerSpan],
    ['bundleCount', parameters.bundleCount, CONDUCTOR_RANGES.bundleCount],
    ['bundleSpacingMetres', parameters.bundleSpacingMetres, CONDUCTOR_RANGES.bundleSpacingMetres],
    [
      'subconductorDiameterMillimetres',
      parameters.subconductorDiameterMillimetres,
      CONDUCTOR_RANGES.subconductorDiameterMillimetres,
    ],
    [
      'shieldDiameterMillimetres',
      parameters.shieldDiameterMillimetres,
      CONDUCTOR_RANGES.shieldDiameterMillimetres,
    ],
  ];
  const frequencyIssue: ValidationIssue[] = [50, 60].includes(parameters.frequencyHz)
    ? []
    : [{ field: 'frequencyHz', message: 'The frequency is 50 Hz or 60 Hz' }];
  const rangeIssues = ranges.flatMap(
    ([field, value, range]) => rangeIssue(field, value, range) ?? [],
  );
  const structural = [
    ...rangeIssues,
    ...frequencyIssue,
    ...integerIssues(parameters),
    ...towerIssues(parameters.tower),
    ...phasingIssues(parameters),
    ...spanIssues(parameters),
  ];
  return structural.length > 0 ? structural : clearanceIssues(parameters);
}

export function bundleFromParameters(parameters: LineParameters): BundleSpec {
  return {
    count: parameters.bundleCount,
    spacing: parameters.bundleSpacingMetres,
    subconductorDiameter: parameters.subconductorDiameterMillimetres / 1000,
  };
}

export function lineGeometryFromParameters(parameters: LineParameters): LineGeometry {
  return buildLineGeometry({
    tower: parameters.tower,
    spans: parameters.spanLengths.map((length) => ({ length, sag: parameters.phaseSag })),
    phaseBundle: bundleFromParameters(parameters),
    shieldDiameter: parameters.shieldDiameterMillimetres / 1000,
    shieldSagRatio: parameters.shieldSagRatio,
  });
}
