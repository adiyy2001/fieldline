import type { Point3 } from '../field-types';
import type { ReferenceSpan } from '../geometry/discretize';
import { SEGMENT_STRIDE, type SegmentSet, segmentMidpoint } from '../field3d/segment-set';
import {
  DEFAULT_LINE_COUNT,
  type LineKind,
  type LineSeed,
  MAGNETIC_SEED_RADII,
  SEED_RING_FACTOR,
} from './types';

export interface SeedOptions {
  readonly kind: LineKind;
  readonly lineCount?: number;
}

const MAXIMUM_RING_POSITIONS = 3;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface ConductorSpan {
  readonly conductor: number;
  readonly segments: readonly number[];
}

function referenceSegments(set: SegmentSet, reference: ReferenceSpan): readonly ConductorSpan[] {
  const byConductor = new Map<number, number[]>();
  for (let index = 0; index < set.count; index += 1) {
    if ((set.groups[index] ?? -1) < 0 || (set.spans[index] ?? -1) !== reference.index) {
      continue;
    }
    const conductor = set.conductors[index] ?? 0;
    byConductor.set(conductor, [...(byConductor.get(conductor) ?? []), index]);
  }
  return [...byConductor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([conductor, segments]) => ({ conductor, segments }));
}

function unit(vector: Point3): Point3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function crossProduct(a: Point3, b: Point3): Point3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function perpendicularBasis(tangent: Point3): readonly [Point3, Point3] {
  const helper = Math.abs(tangent.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const first = unit(crossProduct(tangent, helper));
  const second = unit(crossProduct(tangent, first));
  return [first, second];
}

function ringPoint(
  center: Point3,
  basis: readonly [Point3, Point3],
  angle: number,
  radius: number,
): { point: Point3; outward: Point3 } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const outward = {
    x: cos * basis[0].x + sin * basis[1].x,
    y: cos * basis[0].y + sin * basis[1].y,
    z: cos * basis[0].z + sin * basis[1].z,
  };
  return {
    point: {
      x: center.x + radius * outward.x,
      y: center.y + radius * outward.y,
      z: center.z + radius * outward.z,
    },
    outward,
  };
}

function positionsAlong(segments: readonly number[], count: number): readonly number[] {
  return Array.from({ length: count }, (_, position) => {
    const fraction = (position + 0.5) / count;
    return segments[Math.min(segments.length - 1, Math.floor(fraction * segments.length))] ?? 0;
  });
}

function segmentFrame(set: SegmentSet, index: number) {
  const offset = index * SEGMENT_STRIDE;
  return {
    center: segmentMidpoint(set, index),
    tangent: {
      x: set.data[offset + 3] ?? 0,
      y: set.data[offset + 4] ?? 0,
      z: set.data[offset + 5] ?? 0,
    },
    radius: set.data[offset + 7] ?? 0,
  };
}

function electricSeeds(
  set: SegmentSet,
  conductors: readonly ConductorSpan[],
  perConductor: number,
): readonly LineSeed[] {
  const positionCount = Math.min(MAXIMUM_RING_POSITIONS, Math.max(1, Math.ceil(perConductor / 6)));
  const ringCount = Math.max(1, Math.floor(perConductor / positionCount));
  const seeds: LineSeed[] = [];
  for (const { segments } of conductors) {
    positionsAlong(segments, positionCount).forEach((segmentIndex, position) => {
      const frame = segmentFrame(set, segmentIndex);
      const basis = perpendicularBasis(frame.tangent);
      for (let ring = 0; ring < ringCount; ring += 1) {
        const angle = (2 * Math.PI * (ring + (position % 2) * 0.5)) / ringCount;
        const { point, outward } = ringPoint(
          frame.center,
          basis,
          angle,
          SEED_RING_FACTOR * frame.radius,
        );
        seeds.push({ kind: 'electric', origin: point, outward, arcLength: 0 });
      }
    });
  }
  return seeds;
}

function magneticSeeds(
  set: SegmentSet,
  conductors: readonly ConductorSpan[],
  perConductor: number,
): readonly LineSeed[] {
  const radii = MAGNETIC_SEED_RADII;
  const positionCount = Math.max(1, Math.floor(perConductor / radii.length));
  const seeds: LineSeed[] = [];
  for (const { segments } of conductors) {
    positionsAlong(segments, positionCount).forEach((segmentIndex, position) => {
      const frame = segmentFrame(set, segmentIndex);
      const basis = perpendicularBasis(frame.tangent);
      radii.forEach((radius, ring) => {
        const angle = GOLDEN_ANGLE * (position * radii.length + ring);
        const { point, outward } = ringPoint(frame.center, basis, angle, radius);
        seeds.push({ kind: 'magnetic', origin: point, outward, arcLength: 2 * Math.PI * radius });
      });
    });
  }
  return seeds;
}

export function placeSeeds(
  set: SegmentSet,
  reference: ReferenceSpan,
  options: SeedOptions,
): readonly LineSeed[] {
  const conductors = referenceSegments(set, reference);
  if (conductors.length === 0) {
    return [];
  }
  const lineCount = options.lineCount ?? DEFAULT_LINE_COUNT;
  const perConductor = Math.max(1, Math.floor(lineCount / conductors.length));
  const seeds =
    options.kind === 'electric'
      ? electricSeeds(set, conductors, perConductor)
      : magneticSeeds(set, conductors, perConductor);
  return seeds.slice(0, lineCount);
}
