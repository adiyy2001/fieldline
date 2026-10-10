import type { ChargeSystem } from '../field3d/charge-system';
import { SEGMENT_STRIDE, segmentMidpoint } from '../field3d/segment-set';

export const PROFILE_HALF_WIDTH = 60;
export const PROFILE_STEP = 0.5;
export const PROFILE_HEIGHT = 1;
export const CLAMP_RADIUS_MULTIPLES: readonly number[] = [0, 0.25, 0.5, 0.9, 1, 1.1, 2, 5, 20, 100];

export function profilePoints(midZ: number): Float64Array {
  const count = Math.round((2 * PROFILE_HALF_WIDTH) / PROFILE_STEP) + 1;
  const coordinates = new Float64Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    coordinates[3 * index] = -PROFILE_HALF_WIDTH + index * PROFILE_STEP;
    coordinates[3 * index + 1] = PROFILE_HEIGHT;
    coordinates[3 * index + 2] = midZ;
  }
  return coordinates;
}

export interface ClampProbe {
  readonly coordinates: Float64Array;
  readonly radius: number;
}

function segmentNearestToMidSpan(system: ChargeSystem): number {
  const { set, reference } = system;
  let chosen = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < set.count; index += 1) {
    const isPhaseInReference =
      set.spans[index] === reference.index && (set.groups[index] ?? -1) >= 0;
    const distance = Math.abs(segmentMidpoint(set, index).z - reference.midZ);
    if (isPhaseInReference && distance < bestDistance) {
      chosen = index;
      bestDistance = distance;
    }
  }
  return chosen;
}

export function clampProbe(system: ChargeSystem): ClampProbe {
  const { set } = system;
  const chosen = segmentNearestToMidSpan(system);
  if (chosen < 0) {
    throw new RangeError('The reference span has no phase conductor');
  }
  const radius = set.data[chosen * SEGMENT_STRIDE + 7] ?? 0;
  const middle = segmentMidpoint(set, chosen);
  const coordinates = new Float64Array(CLAMP_RADIUS_MULTIPLES.length * 2 * 3);
  CLAMP_RADIUS_MULTIPLES.forEach((multiple, index) => {
    const distance = multiple * radius;
    coordinates.set([middle.x + distance, middle.y, middle.z], index * 6);
    coordinates.set([middle.x, middle.y + distance, middle.z], index * 6 + 3);
  });
  return { coordinates, radius };
}
