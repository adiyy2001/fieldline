import type { Point3 } from '../field-types';
import type { ReferenceSpan } from '../geometry/discretize';
import { createChargeSystem } from '../field3d/charge-system';
import { packSegments, type SegmentSet } from '../field3d/segment-set';

export function lineSegment(
  start: Point3,
  end: Point3,
  radius = 0.01,
  group = 0,
): Parameters<typeof packSegments>[0][number] {
  return { start, end, radius, conductor: 0, group, spanIndex: 0 };
}

export function singleSegmentSet(start: Point3, end: Point3, radius = 0.01): SegmentSet {
  return packSegments([lineSegment(start, end, radius)]);
}

export function longHorizontalConductor(
  height: number,
  radius: number,
  halfLength: number,
  pieces: number,
) {
  const segments = Array.from({ length: pieces }, (_, index) => {
    const from = -halfLength + (2 * halfLength * index) / pieces;
    const to = -halfLength + (2 * halfLength * (index + 1)) / pieces;
    return lineSegment({ x: 0, y: height, z: from }, { x: 0, y: height, z: to }, radius);
  });
  const reference: ReferenceSpan = {
    index: 0,
    startZ: -halfLength,
    length: 2 * halfLength,
    midZ: 0,
  };
  return createChargeSystem(packSegments(segments), 1, reference);
}
