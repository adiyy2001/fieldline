import type { Segment } from '../geometry/discretize';

export const SEGMENT_STRIDE = 8;

export interface SegmentSet {
  readonly count: number;
  readonly data: Float64Array;
  readonly groups: Int32Array;
  readonly conductors: Int32Array;
  readonly spans: Int32Array;
}

export function packSegments(segments: readonly Segment[]): SegmentSet {
  const count = segments.length;
  const data = new Float64Array(count * SEGMENT_STRIDE);
  const groups = new Int32Array(count);
  const conductors = new Int32Array(count);
  const spans = new Int32Array(count);
  segments.forEach((segment, index) => {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const dz = segment.end.z - segment.start.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 0)) {
      throw new RangeError(`Segment ${index} has no length`);
    }
    const offset = index * SEGMENT_STRIDE;
    data[offset] = segment.start.x;
    data[offset + 1] = segment.start.y;
    data[offset + 2] = segment.start.z;
    data[offset + 3] = dx / length;
    data[offset + 4] = dy / length;
    data[offset + 5] = dz / length;
    data[offset + 6] = length;
    data[offset + 7] = segment.radius;
    groups[index] = segment.group;
    conductors[index] = segment.conductor;
    spans[index] = segment.spanIndex;
  });
  return { count, data, groups, conductors, spans };
}

export function segmentLength(set: SegmentSet, index: number): number {
  return set.data[index * SEGMENT_STRIDE + 6] ?? 0;
}

export function segmentRadius(set: SegmentSet, index: number): number {
  return set.data[index * SEGMENT_STRIDE + 7] ?? 0;
}

export function segmentMidpoint(set: SegmentSet, index: number) {
  const offset = index * SEGMENT_STRIDE;
  const half = segmentLength(set, index) / 2;
  return {
    x: (set.data[offset] ?? 0) + (set.data[offset + 3] ?? 0) * half,
    y: (set.data[offset + 1] ?? 0) + (set.data[offset + 4] ?? 0) * half,
    z: (set.data[offset + 2] ?? 0) + (set.data[offset + 5] ?? 0) * half,
  };
}

export function segmentEnd(set: SegmentSet, index: number) {
  const offset = index * SEGMENT_STRIDE;
  const length = segmentLength(set, index);
  return {
    x: (set.data[offset] ?? 0) + (set.data[offset + 3] ?? 0) * length,
    y: (set.data[offset + 1] ?? 0) + (set.data[offset + 4] ?? 0) * length,
    z: (set.data[offset + 2] ?? 0) + (set.data[offset + 5] ?? 0) * length,
  };
}

export function segmentDirection(set: SegmentSet, index: number) {
  const offset = index * SEGMENT_STRIDE;
  return {
    x: set.data[offset + 3] ?? 0,
    y: set.data[offset + 4] ?? 0,
    z: set.data[offset + 5] ?? 0,
  };
}
