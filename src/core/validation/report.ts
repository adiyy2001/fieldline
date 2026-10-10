import { complex } from '../complex';
import { EXPOSURE_PRESETS, kilovoltsPerMetre, microtesla } from '../exposure/levels';
import { electricFieldAt, magneticFieldAt, potentialAt } from '../field2d/field';
import { createCrossSectionSolver } from '../field2d/solver';
import { equivalentRadius } from '../geometry/bundle';
import { resultantRms } from '../phasor';
import {
  lineCharge,
  longConductorFluxDensity,
  singleConductorField,
  singleConductorPotential,
} from './analytic';
import { relativeError } from './metrics';
import { limitHeight, peakField } from './published-limit';
import {
  PUBLISHED_BUNDLE,
  PUBLISHED_CASES,
  PUBLISHED_CITATION,
  PUBLISHED_TOLERANCE,
  type PublishedCase,
  type PublishedTower,
} from './published-reference';

export interface AnalyticCheck {
  readonly id: string;
  readonly description: string;
  readonly value: number;
  readonly reference: number;
  readonly relativeError: number;
  readonly tolerance: number;
  readonly passed: boolean;
}

export interface LimitComparison {
  readonly published: number;
  readonly reproduced: number;
  readonly deviation: number;
  readonly equivalentConductor: number;
  readonly equivalentShift: number;
}

export interface PublishedRow {
  readonly id: string;
  readonly tower: PublishedTower;
  readonly fitted: boolean;
  readonly electric: LimitComparison;
  readonly magnetic: LimitComparison;
  readonly withinTolerance: boolean;
}

export interface RankingCheck {
  readonly tower: PublishedTower;
  readonly clearance: number;
  readonly pairsChecked: number;
  readonly violations: number;
}

export interface ValidationReport {
  readonly citation: string;
  readonly tolerance: number;
  readonly analytic: readonly AnalyticCheck[];
  readonly published: readonly PublishedRow[];
  readonly ranking: readonly RankingCheck[];
  readonly summary: {
    readonly analyticPassed: boolean;
    readonly publishedCases: number;
    readonly fittedCases: number;
    readonly maximumDeviation: number;
    readonly meanDeviation: number;
    readonly allWithinTolerance: boolean;
    readonly maximumEquivalentShift: number;
    readonly rankingViolations: number;
  };
  readonly exposure: readonly {
    readonly id: string;
    readonly label: string;
    readonly electricKilovoltsPerMetre: number;
    readonly magneticMicrotesla: number;
    readonly source: string;
  }[];
}

const SINGLE = { voltage: 230940, height: 12, radius: 0.015 } as const;
const ANALYTIC_TOLERANCE = 1e-9;
const RANKING_CLEARANCE = 12;
const EQUIVALENT_BUNDLE_RADIUS = 0.1342;

function check(
  id: string,
  description: string,
  value: number,
  reference: number,
  tolerance: number,
): AnalyticCheck {
  const error = relativeError(value, reference);
  return {
    id,
    description,
    value,
    reference,
    relativeError: error,
    tolerance,
    passed: error <= tolerance,
  };
}

function scatterPoints(): readonly (readonly [number, number])[] {
  const points: (readonly [number, number])[] = [];
  for (let x = -30; x <= 30; x += 3) {
    for (const y of [0, 1, 1.8, 5, 11, 13, 20, 30]) {
      points.push([x, y]);
    }
  }
  return points;
}

export function analyticChecks(): readonly AnalyticCheck[] {
  const section = {
    wires: [{ x: 0, y: SINGLE.height, radius: SINGLE.radius, group: 0 }],
    groupCount: 1,
  };
  const solver = createCrossSectionSolver(section);
  const charges = solver.chargesFor([complex(SINGLE.voltage, 0)]);
  const points = scatterPoints();
  const fieldError = Math.max(
    ...points.map(([x, y]) => {
      const model = electricFieldAt(section, charges, x, y);
      const reference = singleConductorField(SINGLE, x, y);
      return (
        Math.hypot(model.x.re - reference.x, model.y.re - reference.y) /
        Math.max(Math.hypot(reference.x, reference.y), 1)
      );
    }),
  );
  const potentialError = Math.max(
    ...points.map(([x, y]) =>
      relativeError(potentialAt(section, charges, x, y).re, singleConductorPotential(SINGLE, x, y)),
    ),
  );
  const currentSection = { wires: [{ x: 5, y: 12, radius: 0.015, group: 0 }], groupCount: 1 };
  const currents = createCrossSectionSolver(currentSection).currentsFor([complex(1000, 0)]);
  return [
    check(
      'line-charge',
      'Line charge of one conductor above ground, C/m',
      charges.re[0] ?? 0,
      lineCharge(SINGLE),
      ANALYTIC_TOLERANCE,
    ),
    check(
      'field-ground',
      'Vertical E below the conductor at ground level, V/m',
      Math.abs(electricFieldAt(section, charges, 0, 0).y.re),
      Math.abs(singleConductorField(SINGLE, 0, 0).y),
      ANALYTIC_TOLERANCE,
    ),
    check(
      'field-one-metre',
      'Vertical E below the conductor at 1 m, V/m',
      Math.abs(electricFieldAt(section, charges, 0, 1).y.re),
      Math.abs(singleConductorField(SINGLE, 0, 1).y),
      ANALYTIC_TOLERANCE,
    ),
    check(
      'field-scatter',
      `Worst relative error of E over ${points.length} points`,
      fieldError,
      0,
      ANALYTIC_TOLERANCE,
    ),
    check(
      'potential-scatter',
      `Worst relative error of the potential over ${points.length} points`,
      potentialError,
      0,
      ANALYTIC_TOLERANCE,
    ),
    check(
      'flux-density',
      'B of 1000 A at 10 m, T (mu0 I over 2 pi r)',
      resultantRms(magneticFieldAt(currentSection, currents, 5, 22)),
      longConductorFluxDensity(1000, 10),
      1e-12,
    ),
    check(
      'flux-density-value',
      'B of 1000 A at 10 m against the textbook 20 microtesla',
      resultantRms(magneticFieldAt(currentSection, currents, 5, 22)) * 1e6,
      20,
      1e-8,
    ),
    check(
      'equivalent-radius',
      'Equivalent radius of three 30.2 mm subconductors at 0.4 m, m',
      equivalentRadius(PUBLISHED_BUNDLE),
      EQUIVALENT_BUNDLE_RADIUS,
      5e-4,
    ),
  ];
}

function compare(published: number, reproduced: number, equivalent: number): LimitComparison {
  return {
    published,
    reproduced,
    deviation: reproduced - published,
    equivalentConductor: equivalent,
    equivalentShift: equivalent - reproduced,
  };
}

function publishedRow(reference: PublishedCase): PublishedRow {
  const electric = compare(
    reference.electricLimitHeight,
    limitHeight(reference, 'electric', 'explicit'),
    limitHeight(reference, 'electric', 'equivalent'),
  );
  const magnetic = compare(
    reference.magneticLimitHeight,
    limitHeight(reference, 'magnetic', 'explicit'),
    limitHeight(reference, 'magnetic', 'equivalent'),
  );
  return {
    id: reference.id,
    tower: reference.tower,
    fitted: reference.fitted,
    electric,
    magnetic,
    withinTolerance:
      Math.abs(electric.deviation) <= PUBLISHED_TOLERANCE &&
      Math.abs(magnetic.deviation) <= PUBLISHED_TOLERANCE,
  };
}

function rankingCheck(tower: PublishedTower): RankingCheck {
  const cases = PUBLISHED_CASES.filter((reference) => reference.tower === tower);
  const peaks = cases.map((reference) =>
    peakField(reference, RANKING_CLEARANCE, 'electric', 'explicit'),
  );
  let pairs = 0;
  let violations = 0;
  cases.forEach((first, i) => {
    cases.forEach((second, j) => {
      if (first.electricLimitHeight < second.electricLimitHeight - 1e-9) {
        pairs += 1;
        if (!((peaks[i] ?? 0) < (peaks[j] ?? 0))) {
          violations += 1;
        }
      }
    });
  });
  return { tower, clearance: RANKING_CLEARANCE, pairsChecked: pairs, violations };
}

function exposureTable(): ValidationReport['exposure'] {
  return EXPOSURE_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    electricKilovoltsPerMetre: kilovoltsPerMetre(preset.electric.value),
    magneticMicrotesla: microtesla(preset.magnetic.value),
    source: preset.source,
  }));
}

export function buildValidationReport(): ValidationReport {
  const analytic = analyticChecks();
  const published = PUBLISHED_CASES.map(publishedRow);
  const ranking = (['barrel', 'danube'] as const).map(rankingCheck);
  const agreeing = published.filter((row) => !row.fitted);
  const deviations = agreeing.flatMap((row) => [
    Math.abs(row.electric.deviation),
    Math.abs(row.magnetic.deviation),
  ]);
  const shifts = published.flatMap((row) => [
    Math.abs(row.electric.equivalentShift),
    Math.abs(row.magnetic.equivalentShift),
  ]);
  return {
    citation: PUBLISHED_CITATION,
    tolerance: PUBLISHED_TOLERANCE,
    analytic,
    published,
    ranking,
    summary: {
      analyticPassed: analytic.every((entry) => entry.passed),
      publishedCases: published.length,
      fittedCases: published.length - agreeing.length,
      maximumDeviation: Math.max(...deviations),
      meanDeviation: deviations.reduce((sum, value) => sum + value, 0) / deviations.length,
      allWithinTolerance: published.every((row) => row.withinTolerance),
      maximumEquivalentShift: Math.max(...shifts),
      rankingViolations: ranking.reduce((sum, entry) => sum + entry.violations, 0),
    },
    exposure: exposureTable(),
  };
}
