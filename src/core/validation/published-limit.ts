import { type Complex } from '../complex';
import type { FieldQuantity } from '../exposure/levels';
import { createFieldEvaluator2D } from '../field2d/evaluator';
import type { CrossSection, Wire } from '../field2d/cross-section';
import { SHIELD_GROUP } from '../field2d/cross-section';
import { createCrossSectionSolver } from '../field2d/solver';
import { bundleCircleRadius, equivalentRadius, subconductorPositions } from '../geometry/bundle';
import { phaseCurrentPhasors, phaseVoltagePhasors, resultantRms } from '../phasor';
import {
  PUBLISHED_BUNDLE,
  PUBLISHED_BUNDLE_ROTATION_DEGREES,
  PUBLISHED_CURRENT_AMPERES,
  PUBLISHED_ELECTRIC_LIMIT,
  PUBLISHED_EVALUATION_HEIGHT,
  PUBLISHED_LATERAL_LIMIT,
  PUBLISHED_LINE_TO_LINE_VOLTS,
  PUBLISHED_MAGNETIC_LIMIT,
  PUBLISHED_SHIELD_RADIUS,
  type PublishedBundleMode,
  type PublishedCase,
} from './published-reference';

export const CLEARANCE_SEARCH_RANGE = { low: 3, high: 40 } as const;
const BISECTION_TOLERANCE = 1e-5;
const COARSE_STEP = 0.25;
const REFINE_TOLERANCE = 1e-4;
const GOLDEN_RATIO = (Math.sqrt(5) - 1) / 2;

export function publishedCrossSection(
  reference: PublishedCase,
  clearance: number,
  mode: PublishedBundleMode,
): CrossSection {
  const circleRadius = bundleCircleRadius(PUBLISHED_BUNDLE.count, PUBLISHED_BUNDLE.spacing);
  const phaseWires = reference.phaseConductors.flatMap((conductor, group): readonly Wire[] => {
    const center = { x: conductor.x, y: clearance + conductor.dy + circleRadius };
    if (mode === 'equivalent') {
      return [{ ...center, radius: equivalentRadius(PUBLISHED_BUNDLE), group }];
    }
    return subconductorPositions(center, PUBLISHED_BUNDLE, PUBLISHED_BUNDLE_ROTATION_DEGREES).map(
      (position) => ({ ...position, radius: PUBLISHED_BUNDLE.subconductorDiameter / 2, group }),
    );
  });
  const shieldWires = reference.shields.map((shield): Wire => ({
    x: shield.x,
    y: clearance + shield.dy,
    radius: PUBLISHED_SHIELD_RADIUS,
    group: SHIELD_GROUP,
  }));
  return { wires: [...phaseWires, ...shieldWires], groupCount: reference.phaseConductors.length };
}

function maximize(evaluate: (x: number) => number, low: number, high: number): number {
  let bestX = low;
  let bestValue = evaluate(low);
  for (let x = low + COARSE_STEP; x <= high + 1e-9; x += COARSE_STEP) {
    const value = evaluate(x);
    if (value > bestValue) {
      bestValue = value;
      bestX = x;
    }
  }
  let lower = Math.max(low, bestX - COARSE_STEP);
  let upper = Math.min(high, bestX + COARSE_STEP);
  while (upper - lower > REFINE_TOLERANCE) {
    const first = upper - GOLDEN_RATIO * (upper - lower);
    const second = lower + GOLDEN_RATIO * (upper - lower);
    if (evaluate(first) < evaluate(second)) {
      lower = first;
    } else {
      upper = second;
    }
  }
  return Math.max(bestValue, evaluate((lower + upper) / 2));
}

function groupPhasors(
  reference: PublishedCase,
  phasors: readonly [Complex, Complex, Complex],
): readonly Complex[] {
  return reference.phaseConductors.map((conductor) => phasors[conductor.phase] ?? phasors[0]);
}

export function peakField(
  reference: PublishedCase,
  clearance: number,
  quantity: FieldQuantity,
  mode: PublishedBundleMode,
): number {
  const solver = createCrossSectionSolver(publishedCrossSection(reference, clearance, mode));
  const voltages = groupPhasors(reference, phaseVoltagePhasors(PUBLISHED_LINE_TO_LINE_VOLTS));
  const currents = groupPhasors(reference, phaseCurrentPhasors(PUBLISHED_CURRENT_AMPERES, 0));
  const evaluate = createFieldEvaluator2D(solver, voltages, currents);
  return maximize(
    (x) => {
      const field = evaluate({ x, y: PUBLISHED_EVALUATION_HEIGHT, z: 0 });
      return resultantRms(quantity === 'electric' ? field.electric : field.magnetic);
    },
    -PUBLISHED_LATERAL_LIMIT,
    PUBLISHED_LATERAL_LIMIT,
  );
}

export function limitHeight(
  reference: PublishedCase,
  quantity: FieldQuantity,
  mode: PublishedBundleMode,
): number {
  const limit = quantity === 'electric' ? PUBLISHED_ELECTRIC_LIMIT : PUBLISHED_MAGNETIC_LIMIT;
  let low: number = CLEARANCE_SEARCH_RANGE.low;
  let high: number = CLEARANCE_SEARCH_RANGE.high;
  if (
    peakField(reference, low, quantity, mode) < limit ||
    peakField(reference, high, quantity, mode) > limit
  ) {
    throw new RangeError(`The limit height of ${reference.id} is outside the search range`);
  }
  while (high - low > BISECTION_TOLERANCE) {
    const middle = (low + high) / 2;
    if (peakField(reference, middle, quantity, mode) > limit) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}
