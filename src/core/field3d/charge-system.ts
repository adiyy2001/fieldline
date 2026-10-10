import type { Complex } from '../complex';
import type { ComplexSeries } from '../field-types';
import { type ReferenceSpan } from '../geometry/discretize';
import { combineColumns } from '../linear/combine';
import { factorLu, solveLu } from '../linear/lu';
import { assemblePotentialMatrix } from './assembly';
import type { SegmentSet } from './segment-set';

export interface ChargeSystem {
  readonly set: SegmentSet;
  readonly groupCount: number;
  readonly reference: ReferenceSpan;
  readonly basisCharges: readonly Float64Array[];
  chargesFor(groupVoltages: readonly Complex[]): ComplexSeries;
  currentsFor(groupCurrents: readonly Complex[]): ComplexSeries;
}

function unitVoltageColumns(set: SegmentSet, groupCount: number): Float64Array {
  const rhs = new Float64Array(set.count * groupCount);
  for (let row = 0; row < set.count; row += 1) {
    const group = set.groups[row] ?? -1;
    if (group >= 0 && group < groupCount) {
      rhs[row * groupCount + group] = 1;
    }
  }
  return rhs;
}

function splitColumns(rhs: Float64Array, count: number, columns: number): Float64Array[] {
  return Array.from({ length: columns }, (_, column) =>
    Float64Array.from({ length: count }, (_, row) => rhs[row * columns + column] ?? 0),
  );
}

function currentIndicators(set: SegmentSet, groupCount: number): readonly Float64Array[] {
  return Array.from({ length: groupCount }, (_, group) =>
    Float64Array.from(set.groups, (segmentGroup) => (segmentGroup === group ? 1 : 0)),
  );
}

export function solveBasisCharges(set: SegmentSet, groupCount: number): readonly Float64Array[] {
  const factors = factorLu(assemblePotentialMatrix(set), set.count);
  const rhs = unitVoltageColumns(set, groupCount);
  solveLu(factors, rhs, groupCount);
  return splitColumns(rhs, set.count, groupCount);
}

export function chargeSystemFromBasis(
  set: SegmentSet,
  groupCount: number,
  reference: ReferenceSpan,
  basisCharges: readonly Float64Array[],
): ChargeSystem {
  const indicators = currentIndicators(set, groupCount);
  return {
    set,
    groupCount,
    reference,
    basisCharges,
    chargesFor: (groupVoltages) => combineColumns(basisCharges, groupVoltages, set.count),
    currentsFor: (groupCurrents) => combineColumns(indicators, groupCurrents, set.count),
  };
}

export function createChargeSystem(
  set: SegmentSet,
  groupCount: number,
  reference: ReferenceSpan,
): ChargeSystem {
  return chargeSystemFromBasis(set, groupCount, reference, solveBasisCharges(set, groupCount));
}
