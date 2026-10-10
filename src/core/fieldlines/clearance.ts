import type { Point3 } from '../field-types';
import { SEGMENT_STRIDE, type SegmentSet } from '../field3d/segment-set';
import { type ClearanceField, TRACE_CONSTANTS } from './types';

export function distanceToSegment(set: SegmentSet, index: number, point: Point3): number {
  const offset = index * SEGMENT_STRIDE;
  const sx = point.x - (set.data[offset] ?? 0);
  const sy = point.y - (set.data[offset + 1] ?? 0);
  const sz = point.z - (set.data[offset + 2] ?? 0);
  const along = Math.min(
    set.data[offset + 6] ?? 0,
    Math.max(
      0,
      sx * (set.data[offset + 3] ?? 0) +
        sy * (set.data[offset + 4] ?? 0) +
        sz * (set.data[offset + 5] ?? 0),
    ),
  );
  return Math.hypot(
    sx - along * (set.data[offset + 3] ?? 0),
    sy - along * (set.data[offset + 4] ?? 0),
    sz - along * (set.data[offset + 5] ?? 0),
  );
}

export function createClearance(
  set: SegmentSet,
  stopRatio: number = TRACE_CONSTANTS.stopRatio,
): ClearanceField {
  return (point) => {
    let minimumDistance = Infinity;
    let minimumClearance = Infinity;
    for (let index = 0; index < set.count; index += 1) {
      const distance = distanceToSegment(set, index, point);
      const radius = set.data[index * SEGMENT_STRIDE + 7] ?? 0;
      minimumDistance = Math.min(minimumDistance, distance);
      minimumClearance = Math.min(minimumClearance, distance - stopRatio * radius);
    }
    return { minimumDistance, minimumClearance };
  };
}
