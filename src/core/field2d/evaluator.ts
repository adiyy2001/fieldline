import type { Complex } from '../complex';
import type { FieldEvaluator } from '../field-types';
import { electricFieldAt, magneticFieldAt } from './field';
import type { CrossSectionSolver } from './solver';

export function createFieldEvaluator2D(
  solver: CrossSectionSolver,
  groupVoltages: readonly Complex[],
  groupCurrents: readonly Complex[],
): FieldEvaluator {
  const charges = solver.chargesFor(groupVoltages);
  const currents = solver.currentsFor(groupCurrents);
  return (point) => ({
    electric: electricFieldAt(solver.section, charges, point.x, point.y),
    magnetic: magneticFieldAt(solver.section, currents, point.x, point.y),
  });
}
