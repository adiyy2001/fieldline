import type { Point3 } from '../core/field-types';
import { SEGMENT_STRIDE, type SegmentSet } from '../core/field3d/segment-set';
import { towerPositions } from '../core/geometry/discretize';
import { SHIELD_GROUP, type LineGeometry } from '../core/geometry/line-geometry';

export interface BoxBounds {
  readonly min: Point3;
  readonly max: Point3;
}

export const LINE_INSTANCE_FLOATS = 12;
export const LINE_INSTANCE_BYTES = LINE_INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const GRID_SPACING = 10;
export const AXIS_LENGTH = 12;

type Color = readonly [number, number, number, number];

export const SCENE_COLORS = {
  background: [0.055, 0.075, 0.11, 1],
  ground: [0.13, 0.17, 0.22, 0.92],
  grid: [0.5, 0.6, 0.72, 0.22],
  box: [0.62, 0.72, 0.88, 0.55],
  phase: [1, 0.78, 0.3, 1],
  shield: [0.68, 0.76, 0.86, 1],
  tower: [0.74, 0.78, 0.84, 1],
  axisX: [1, 0.4, 0.4, 1],
  axisY: [0.45, 0.92, 0.5, 1],
  axisZ: [0.45, 0.65, 1, 1],
} as const satisfies Record<string, Color>;

export const LINE_WIDTHS = {
  phase: 2.6,
  shield: 1.8,
  tower: 2,
  box: 1.2,
  grid: 1,
  axis: 3,
} as const;

export interface LineInstance {
  readonly start: Point3;
  readonly end: Point3;
  readonly width: number;
  readonly color: Color;
}

export function packLineInstances(lines: readonly LineInstance[]): Float32Array {
  const packed = new Float32Array(lines.length * LINE_INSTANCE_FLOATS);
  lines.forEach((line, index) => {
    packed.set(
      [
        line.start.x,
        line.start.y,
        line.start.z,
        line.width,
        line.end.x,
        line.end.y,
        line.end.z,
        0,
        ...line.color,
      ],
      index * LINE_INSTANCE_FLOATS,
    );
  });
  return packed;
}

export interface ClippedSegment {
  readonly start: Point3;
  readonly end: Point3;
}

function lerp(from: Point3, to: Point3, fraction: number): Point3 {
  return {
    x: from.x + fraction * (to.x - from.x),
    y: from.y + fraction * (to.y - from.y),
    z: from.z + fraction * (to.z - from.z),
  };
}

export function clipSegmentToDepth(
  start: Point3,
  end: Point3,
  minimum: number,
  maximum: number,
): ClippedSegment | null {
  const span = end.z - start.z;
  if (Math.abs(span) < 1e-12) {
    return start.z >= minimum && start.z <= maximum ? { start, end } : null;
  }
  const first = (minimum - start.z) / span;
  const second = (maximum - start.z) / span;
  const enter = Math.max(0, Math.min(first, second));
  const leave = Math.min(1, Math.max(first, second));
  return enter < leave ? { start: lerp(start, end, enter), end: lerp(start, end, leave) } : null;
}

export function conductorLines(set: SegmentSet, box: BoxBounds): readonly LineInstance[] {
  const lines: LineInstance[] = [];
  for (let index = 0; index < set.count; index += 1) {
    const offset = index * SEGMENT_STRIDE;
    const length = set.data[offset + 6] ?? 0;
    const start = {
      x: set.data[offset] ?? 0,
      y: set.data[offset + 1] ?? 0,
      z: set.data[offset + 2] ?? 0,
    };
    const end = {
      x: start.x + (set.data[offset + 3] ?? 0) * length,
      y: start.y + (set.data[offset + 4] ?? 0) * length,
      z: start.z + (set.data[offset + 5] ?? 0) * length,
    };
    const clipped = clipSegmentToDepth(start, end, box.min.z, box.max.z);
    if (clipped !== null) {
      const shield = (set.groups[index] ?? 0) === SHIELD_GROUP;
      lines.push({
        ...clipped,
        width: shield ? LINE_WIDTHS.shield : LINE_WIDTHS.phase,
        color: shield ? SCENE_COLORS.shield : SCENE_COLORS.phase,
      });
    }
  }
  return lines;
}

export function towerLines(geometry: LineGeometry, box: BoxBounds): readonly LineInstance[] {
  const top = Math.max(...geometry.conductors.map((conductor) => conductor.attachmentHeight));
  return towerPositions(geometry)
    .filter((z) => z >= box.min.z && z <= box.max.z)
    .flatMap((z): readonly LineInstance[] => [
      {
        start: { x: 0, y: 0, z },
        end: { x: 0, y: top + 1.5, z },
        width: LINE_WIDTHS.tower,
        color: SCENE_COLORS.tower,
      },
      ...geometry.conductors.map((conductor): LineInstance => ({
        start: { x: 0, y: conductor.attachmentHeight, z },
        end: { x: conductor.x, y: conductor.attachmentHeight, z },
        width: LINE_WIDTHS.tower,
        color: SCENE_COLORS.tower,
      })),
    ]);
}

export function boxLines(box: BoxBounds): readonly LineInstance[] {
  const corner = (index: number): Point3 => ({
    x: index & 1 ? box.max.x : box.min.x,
    y: index & 2 ? box.max.y : box.min.y,
    z: index & 4 ? box.max.z : box.min.z,
  });
  const lines: LineInstance[] = [];
  for (let index = 0; index < 8; index += 1) {
    for (const bit of [1, 2, 4]) {
      if ((index & bit) === 0) {
        lines.push({
          start: corner(index),
          end: corner(index | bit),
          width: LINE_WIDTHS.box,
          color: SCENE_COLORS.box,
        });
      }
    }
  }
  return lines;
}

export function gridLines(box: BoxBounds, spacing: number = GRID_SPACING): readonly LineInstance[] {
  const lines: LineInstance[] = [];
  const lift = 0.02;
  for (let x = Math.ceil(box.min.x / spacing) * spacing; x <= box.max.x; x += spacing) {
    lines.push({
      start: { x, y: lift, z: box.min.z },
      end: { x, y: lift, z: box.max.z },
      width: LINE_WIDTHS.grid,
      color: SCENE_COLORS.grid,
    });
  }
  for (let z = Math.ceil(box.min.z / spacing) * spacing; z <= box.max.z; z += spacing) {
    lines.push({
      start: { x: box.min.x, y: lift, z },
      end: { x: box.max.x, y: lift, z },
      width: LINE_WIDTHS.grid,
      color: SCENE_COLORS.grid,
    });
  }
  return lines;
}

export function axisLines(box: BoxBounds, length: number = AXIS_LENGTH): readonly LineInstance[] {
  const origin = { x: box.min.x, y: box.min.y + 0.05, z: box.min.z };
  return [
    {
      start: origin,
      end: { ...origin, x: origin.x + length },
      width: LINE_WIDTHS.axis,
      color: SCENE_COLORS.axisX,
    },
    {
      start: origin,
      end: { ...origin, y: origin.y + length },
      width: LINE_WIDTHS.axis,
      color: SCENE_COLORS.axisY,
    },
    {
      start: origin,
      end: { ...origin, z: origin.z + length },
      width: LINE_WIDTHS.axis,
      color: SCENE_COLORS.axisZ,
    },
  ];
}

export interface GroundPlane {
  readonly height: number;
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly centerZ: number;
}

export interface Backdrop {
  readonly instances: Float32Array;
  readonly count: number;
  readonly ground: GroundPlane;
}

export function buildBackdrop(set: SegmentSet, geometry: LineGeometry, box: BoxBounds): Backdrop {
  const lines = [
    ...gridLines(box),
    ...boxLines(box),
    ...towerLines(geometry, box),
    ...conductorLines(set, box),
    ...axisLines(box),
  ];
  return {
    instances: packLineInstances(lines),
    count: lines.length,
    ground: {
      height: 0,
      halfWidth: (box.max.x - box.min.x) / 2,
      halfLength: (box.max.z - box.min.z) / 2,
      centerZ: (box.max.z + box.min.z) / 2,
    },
  };
}

export function boxCenter(box: BoxBounds): Point3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}
