import { type Complex } from '../complex';
import { type CrossSection, crossSectionFromLine } from '../field2d/cross-section';
import { createFieldEvaluator2D } from '../field2d/evaluator';
import { type CrossSectionSolver, createCrossSectionSolver } from '../field2d/solver';
import { type LineGeometry } from '../geometry/line-geometry';
import { type TowerKind } from '../geometry/tower';
import { groupExcitation, pickPhasors } from '../model/excitation';
import {
  type LineParameters,
  defaultParameters,
  lineGeometryFromParameters,
} from '../model/parameters';

export interface Fixture {
  readonly parameters: LineParameters;
  readonly geometry: LineGeometry;
  readonly section: CrossSection;
  readonly solver: CrossSectionSolver;
}

export function fixtureFor(
  kind: TowerKind,
  overrides: Partial<LineParameters> = {},
  bundleMode: 'equivalent' | 'explicit' = 'equivalent',
): Fixture {
  const parameters = { ...defaultParameters(kind), ...overrides };
  const geometry = lineGeometryFromParameters(parameters);
  const section = crossSectionFromLine(geometry, { spanIndex: 1, bundleMode });
  return { parameters, geometry, section, solver: createCrossSectionSolver(section) };
}

export function groupPhasors(
  phasing: readonly number[],
  phasors: readonly Complex[],
): readonly Complex[] {
  return pickPhasors(phasing, phasors);
}

export function evaluatorFor(fixture: Fixture, phasing = fixture.parameters.phasing) {
  const excitation = groupExcitation(fixture.parameters, phasing);
  return createFieldEvaluator2D(fixture.solver, excitation.voltages, excitation.currents);
}
