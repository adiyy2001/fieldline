import { ONE, ZERO } from '../complex';
import type { Point3 } from '../field-types';
import type { Point2 } from '../geometry/bundle';
import {
  BASIS_COMPONENTS,
  type BasisFieldSource,
  type BasisFields,
} from '../optimizer/basis-field-source';
import { electricFieldAt, magneticFieldAt } from './field';
import type { ComplexSeries, CrossSectionSolver } from './solver';

function groupCentroid(solver: CrossSectionSolver, group: number): Point2 {
  const members = solver.section.wires.filter((wire) => wire.group === group);
  const count = Math.max(members.length, 1);
  return {
    x: members.reduce((total, wire) => total + wire.x, 0) / count,
    y: members.reduce((total, wire) => total + wire.y, 0) / count,
  };
}

function dipolePerVolt(solver: CrossSectionSolver, group: number): number {
  const charges = solver.basisCharges[group];
  return solver.section.wires.reduce(
    (total, wire, index) => total + (charges?.[index] ?? 0) * wire.y,
    0,
  );
}

function realSeries(values: Float64Array): ComplexSeries {
  return { re: values, im: new Float64Array(values.length) };
}

function unitWeights(groupCount: number, group: number) {
  return Array.from({ length: groupCount }, (_, index) => (index === group ? ONE : ZERO));
}

export function createBasisFieldSource2D(solver: CrossSectionSolver): BasisFieldSource {
  const groupCount = solver.section.groupCount;
  const groups = Array.from({ length: groupCount }, (_, group) => group);
  return {
    groupCount,
    groupPositions: groups.map((group) => groupCentroid(solver, group)),
    electricDipolePerVolt: groups.map((group) => dipolePerVolt(solver, group)),
    sample(points: readonly Point3[]): BasisFields {
      const size = groupCount * points.length * BASIS_COMPONENTS;
      const electric = new Float64Array(size);
      const magnetic = new Float64Array(size);
      for (const group of groups) {
        const charges = realSeries(solver.basisCharges[group] ?? new Float64Array());
        const currents = solver.currentsFor(unitWeights(groupCount, group));
        points.forEach((point, index) => {
          const offset = (group * points.length + index) * BASIS_COMPONENTS;
          const e = electricFieldAt(solver.section, charges, point.x, point.y);
          const b = magneticFieldAt(solver.section, currents, point.x, point.y);
          writeVector(electric, offset, e);
          writeVector(magnetic, offset, b);
        });
      }
      return { pointCount: points.length, groupCount, electric, magnetic };
    },
  };
}

function writeVector(
  target: Float64Array,
  offset: number,
  vector: ReturnType<typeof electricFieldAt>,
): void {
  target[offset] = vector.x.re;
  target[offset + 1] = vector.x.im;
  target[offset + 2] = vector.y.re;
  target[offset + 3] = vector.y.im;
  target[offset + 4] = vector.z.re;
  target[offset + 5] = vector.z.im;
}
