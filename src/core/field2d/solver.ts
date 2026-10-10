import { LINE_CHARGE_FIELD_CONSTANT } from '../constants';
import type { Complex } from '../complex';
import type { ComplexSeries } from '../field-types';
import { combineColumns } from '../linear/combine';
import { factorLu, solveLu } from '../linear/lu';
import { type CrossSection, type Wire, wiresInGroup } from './cross-section';

export interface CrossSectionSolver {
  readonly section: CrossSection;
  readonly basisCharges: readonly Float64Array[];
  chargesFor(groupVoltages: readonly Complex[]): ComplexSeries;
  currentsFor(groupCurrents: readonly Complex[]): ComplexSeries;
}

export function selfPotentialCoefficient(wire: Wire): number {
  return LINE_CHARGE_FIELD_CONSTANT * Math.log((2 * wire.y) / wire.radius);
}

export function mutualPotentialCoefficient(first: Wire, second: Wire): number {
  const dx = first.x - second.x;
  const imageDistance = Math.hypot(dx, first.y + second.y);
  const distance = Math.max(Math.hypot(dx, first.y - second.y), first.radius, second.radius);
  return LINE_CHARGE_FIELD_CONSTANT * Math.log(imageDistance / distance);
}

export function potentialMatrix(section: CrossSection): Float64Array {
  const count = section.wires.length;
  const matrix = new Float64Array(count * count);
  section.wires.forEach((first, row) => {
    section.wires.forEach((second, column) => {
      matrix[row * count + column] =
        row === column
          ? selfPotentialCoefficient(first)
          : mutualPotentialCoefficient(first, second);
    });
  });
  return matrix;
}

function unitVoltageColumns(section: CrossSection): Float64Array {
  const count = section.wires.length;
  const columns = section.groupCount;
  const rhs = new Float64Array(count * columns);
  section.wires.forEach((wire, row) => {
    if (wire.group >= 0) {
      rhs[row * columns + wire.group] = 1;
    }
  });
  return rhs;
}

function splitColumns(rhs: Float64Array, count: number, columns: number): Float64Array[] {
  return Array.from({ length: columns }, (_, column) =>
    Float64Array.from({ length: count }, (_, row) => rhs[row * columns + column] ?? 0),
  );
}

function currentShares(section: CrossSection): readonly Float64Array[] {
  return Array.from({ length: section.groupCount }, (_, group) => {
    const share = 1 / wiresInGroup(section, group);
    return Float64Array.from(section.wires, (wire) => (wire.group === group ? share : 0));
  });
}

export function createCrossSectionSolver(section: CrossSection): CrossSectionSolver {
  const count = section.wires.length;
  const factors = factorLu(potentialMatrix(section), count);
  const rhs = unitVoltageColumns(section);
  solveLu(factors, rhs, section.groupCount);
  const basisCharges = splitColumns(rhs, count, section.groupCount);
  const shares = currentShares(section);
  return {
    section,
    basisCharges,
    chargesFor: (groupVoltages) => combineColumns(basisCharges, groupVoltages, count),
    currentsFor: (groupCurrents) => combineColumns(shares, groupCurrents, count),
  };
}
