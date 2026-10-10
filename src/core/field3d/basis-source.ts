import type { Point3 } from '../field-types';
import type { Point2 } from '../geometry/bundle';
import {
  BASIS_COMPONENTS,
  type BasisFieldSource,
  type BasisFields,
} from '../optimizer/basis-field-source';
import type { ChargeSystem } from './charge-system';
import { createTerms, segmentElectricFieldWithImage, segmentMagneticField } from './segment-kernel';
import { segmentLength, segmentMidpoint } from './segment-set';

function referenceSegments(system: ChargeSystem, group: number): readonly number[] {
  const { set, reference } = system;
  return Array.from({ length: set.count }, (_, index) => index).filter(
    (index) => set.spans[index] === reference.index && (group < 0 || set.groups[index] === group),
  );
}

function groupCentroid(system: ChargeSystem, group: number): Point2 {
  const indices = referenceSegments(system, group);
  let weight = 0;
  let x = 0;
  let y = 0;
  for (const index of indices) {
    const length = segmentLength(system.set, index);
    const middle = segmentMidpoint(system.set, index);
    weight += length;
    x += length * middle.x;
    y += length * middle.y;
  }
  return weight > 0 ? { x: x / weight, y: y / weight } : { x: 0, y: 0 };
}

function dipolePerVolt(system: ChargeSystem, group: number): number {
  const charges = system.basisCharges[group];
  let moment = 0;
  for (const index of referenceSegments(system, -1)) {
    moment +=
      (charges?.[index] ?? 0) *
      segmentLength(system.set, index) *
      segmentMidpoint(system.set, index).y;
  }
  return moment / system.reference.length;
}

export function createBasisFieldSource3D(system: ChargeSystem): BasisFieldSource {
  const { groupCount, set } = system;
  const groups = Array.from({ length: groupCount }, (_, group) => group);
  return {
    groupCount,
    groupPositions: groups.map((group) => groupCentroid(system, group)),
    electricDipolePerVolt: groups.map((group) => dipolePerVolt(system, group)),
    sample(points: readonly Point3[]): BasisFields {
      const size = groupCount * points.length * BASIS_COMPONENTS;
      const electric = new Float64Array(size);
      const magnetic = new Float64Array(size);
      const terms = createTerms();
      const unit = new Float64Array(3);
      points.forEach((point, pointIndex) => {
        for (let index = 0; index < set.count; index += 1) {
          segmentElectricFieldWithImage(set.data, index, point.x, point.y, point.z, terms, unit);
          for (const group of groups) {
            const charge = system.basisCharges[group]?.[index] ?? 0;
            const offset = (group * points.length + pointIndex) * BASIS_COMPONENTS;
            for (let axis = 0; axis < 3; axis += 1) {
              electric[offset + 2 * axis] =
                (electric[offset + 2 * axis] ?? 0) + charge * (unit[axis] ?? 0);
            }
          }
          const owner = set.groups[index] ?? -1;
          if (owner >= 0 && owner < groupCount) {
            segmentMagneticField(set.data, index, point.x, point.y, point.z, terms, unit);
            const offset = (owner * points.length + pointIndex) * BASIS_COMPONENTS;
            for (let axis = 0; axis < 3; axis += 1) {
              magnetic[offset + 2 * axis] = (magnetic[offset + 2 * axis] ?? 0) + (unit[axis] ?? 0);
            }
          }
        }
      });
      return { pointCount: points.length, groupCount, electric, magnetic };
    },
  };
}
