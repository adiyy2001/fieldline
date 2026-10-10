import type { Point3 } from '../field-types';
import type { GridSpec, PointLayout, VolumeSpec } from './types';

export function gridPointCount(spec: GridSpec): number {
  return spec.nx * spec.nz;
}

export function volumePointCount(spec: VolumeSpec): number {
  return spec.nx * spec.ny * spec.nz;
}

export function layoutPointCount(layout: PointLayout): number {
  switch (layout.kind) {
    case 'grid':
      return gridPointCount(layout.spec);
    case 'volume':
      return volumePointCount(layout.spec);
    case 'points':
      return layout.coordinates.length / 3;
  }
}

export function layoutRowLength(layout: PointLayout): number {
  return layout.kind === 'points' ? 1 : layout.spec.nx;
}

export function nodeSpacing(minimum: number, maximum: number, count: number): number {
  return count > 1 ? (maximum - minimum) / (count - 1) : 0;
}

export function gridSpacing(spec: GridSpec): { dx: number; dz: number } {
  return {
    dx: nodeSpacing(spec.xMin, spec.xMax, spec.nx),
    dz: nodeSpacing(spec.zMin, spec.zMax, spec.nz),
  };
}

export function volumeSpacing(spec: VolumeSpec): { dx: number; dy: number; dz: number } {
  return {
    dx: nodeSpacing(spec.xMin, spec.xMax, spec.nx),
    dy: nodeSpacing(spec.yMin, spec.yMax, spec.ny),
    dz: nodeSpacing(spec.zMin, spec.zMax, spec.nz),
  };
}

export function gridIndex(spec: GridSpec, ix: number, iz: number): number {
  return ix + spec.nx * iz;
}

export function volumeIndex(spec: VolumeSpec, ix: number, iy: number, iz: number): number {
  return ix + spec.nx * (iy + spec.ny * iz);
}

export function pointAt(layout: PointLayout, index: number): Point3 {
  if (layout.kind === 'points') {
    return {
      x: layout.coordinates[3 * index] ?? 0,
      y: layout.coordinates[3 * index + 1] ?? 0,
      z: layout.coordinates[3 * index + 2] ?? 0,
    };
  }
  if (layout.kind === 'grid') {
    const { spec } = layout;
    const { dx, dz } = gridSpacing(spec);
    return {
      x: spec.xMin + (index % spec.nx) * dx,
      y: spec.height,
      z: spec.zMin + Math.floor(index / spec.nx) * dz,
    };
  }
  const { spec } = layout;
  const { dx, dy, dz } = volumeSpacing(spec);
  const plane = spec.nx * spec.ny;
  const inPlane = index % plane;
  return {
    x: spec.xMin + (inPlane % spec.nx) * dx,
    y: spec.yMin + Math.floor(inPlane / spec.nx) * dy,
    z: spec.zMin + Math.floor(index / plane) * dz,
  };
}

export function layoutBounds(layout: PointLayout): { min: Point3; max: Point3 } {
  if (layout.kind === 'grid') {
    const { spec } = layout;
    return {
      min: { x: spec.xMin, y: spec.height, z: spec.zMin },
      max: { x: spec.xMax, y: spec.height, z: spec.zMax },
    };
  }
  if (layout.kind === 'volume') {
    const { spec } = layout;
    return {
      min: { x: spec.xMin, y: spec.yMin, z: spec.zMin },
      max: { x: spec.xMax, y: spec.yMax, z: spec.zMax },
    };
  }
  const count = layout.coordinates.length / 3;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let index = 0; index < count; index += 1) {
    const point = pointAt(layout, index);
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }
  return count === 0 ? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } : { min, max };
}

export function layoutCenter(layout: PointLayout): Point3 {
  const { min, max } = layoutBounds(layout);
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

export interface IndexRange {
  readonly start: number;
  readonly end: number;
}

export function splitIntoRows(layout: PointLayout, parts: number): readonly IndexRange[] {
  const total = layoutPointCount(layout);
  const rowLength = layoutRowLength(layout);
  const rows = Math.ceil(total / rowLength);
  const chunks = Math.max(1, Math.min(parts, rows));
  const ranges: IndexRange[] = [];
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const start = Math.floor((chunk * rows) / chunks) * rowLength;
    const end = Math.min(total, Math.floor(((chunk + 1) * rows) / chunks) * rowLength);
    if (end > start) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}
