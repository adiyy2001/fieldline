import type { ChargeSystem } from './charge-system';
import { createTerms, segmentPotentialWithImage } from './segment-kernel';
import { segmentDirection, segmentEnd, segmentMidpoint, segmentRadius } from './segment-set';

export type JointKind = 'interior' | 'tower' | 'run-out';

export interface CheckPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly group: number;
  readonly kind: JointKind;
}

export interface ResidualReport {
  readonly checkPointCount: number;
  readonly maximum: number;
  readonly mean: number;
  readonly interiorMaximum: number;
  readonly towerMaximum: number;
  readonly runOutMaximum: number;
}

function jointKind(before: number, after: number): JointKind {
  if (before === after) {
    return before >= 0 ? 'interior' : 'run-out';
  }
  return 'tower';
}

export function checkPoints(system: ChargeSystem): readonly CheckPoint[] {
  const { set } = system;
  const points: CheckPoint[] = [];
  for (let index = 0; index + 1 < set.count; index += 1) {
    if (set.conductors[index] !== set.conductors[index + 1]) {
      continue;
    }
    const joint = segmentEnd(set, index);
    const direction = segmentDirection(set, index);
    const sideX = -direction.z;
    const sideZ = direction.x;
    const sideLength = Math.hypot(sideX, sideZ) || 1;
    const radius = segmentRadius(set, index);
    points.push({
      x: joint.x + (radius * sideX) / sideLength,
      y: joint.y,
      z: joint.z + (radius * sideZ) / sideLength,
      group: set.groups[index] ?? -1,
      kind: jointKind(set.spans[index] ?? -1, set.spans[index + 1] ?? -1),
    });
  }
  return points;
}

function basisPotentialsAt(
  system: ChargeSystem,
  point: { x: number; y: number; z: number },
  terms: Float64Array,
): Float64Array {
  const { set, basisCharges } = system;
  const potentials = new Float64Array(basisCharges.length);
  for (let index = 0; index < set.count; index += 1) {
    const factor = segmentPotentialWithImage(set.data, index, point.x, point.y, point.z, terms);
    basisCharges.forEach((charges, group) => {
      potentials[group] = (potentials[group] ?? 0) + (charges[index] ?? 0) * factor;
    });
  }
  return potentials;
}

export function potentialResidual(system: ChargeSystem): ResidualReport {
  const points = checkPoints(system);
  const terms = createTerms();
  const maxima: Record<JointKind, number> = { interior: 0, tower: 0, 'run-out': 0 };
  let total = 0;
  let samples = 0;
  for (const point of points) {
    basisPotentialsAt(system, point, terms).forEach((potential, group) => {
      const error = Math.abs(potential - (group === point.group ? 1 : 0));
      maxima[point.kind] = Math.max(maxima[point.kind], error);
      total += error;
      samples += 1;
    });
  }
  return {
    checkPointCount: points.length,
    maximum: Math.max(maxima.interior, maxima.tower, maxima['run-out']),
    mean: samples > 0 ? total / samples : 0,
    interiorMaximum: maxima.interior,
    towerMaximum: maxima.tower,
    runOutMaximum: maxima['run-out'],
  };
}

export function collocationResidual(system: ChargeSystem): number {
  const { set } = system;
  const terms = createTerms();
  let maximum = 0;
  for (let row = 0; row < set.count; row += 1) {
    basisPotentialsAt(system, segmentMidpoint(set, row), terms).forEach((potential, group) => {
      maximum = Math.max(maximum, Math.abs(potential - (set.groups[row] === group ? 1 : 0)));
    });
  }
  return maximum;
}
