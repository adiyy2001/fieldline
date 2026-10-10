import { layoutBounds, layoutPointCount, nodeSpacing } from '../core/backend/layout';
import type { PointLayout } from '../core/backend/types';
import type { Point3 } from '../core/field-types';
import type { KernelKind, WorkgroupShape } from './shader-modules';

export const PARAMS_BYTES = 48;
export const POINT_STRIDE_FLOATS = 4;

export function kernelKindOf(layout: PointLayout): KernelKind {
  return layout.kind === 'grid' ? 'ground' : layout.kind === 'volume' ? 'volume' : 'points';
}

interface Dimensions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function dimensionsOf(layout: PointLayout): Dimensions {
  if (layout.kind === 'grid') {
    return { x: layout.spec.nx, y: 1, z: layout.spec.nz };
  }
  if (layout.kind === 'volume') {
    return { x: layout.spec.nx, y: layout.spec.ny, z: layout.spec.nz };
  }
  return { x: layoutPointCount(layout), y: 1, z: 1 };
}

function stepOf(layout: PointLayout): Dimensions {
  if (layout.kind === 'grid') {
    const { spec } = layout;
    return {
      x: nodeSpacing(spec.xMin, spec.xMax, spec.nx),
      y: 0,
      z: nodeSpacing(spec.zMin, spec.zMax, spec.nz),
    };
  }
  if (layout.kind === 'volume') {
    const { spec } = layout;
    return {
      x: nodeSpacing(spec.xMin, spec.xMax, spec.nx),
      y: nodeSpacing(spec.yMin, spec.yMax, spec.ny),
      z: nodeSpacing(spec.zMin, spec.zMax, spec.nz),
    };
  }
  return { x: 0, y: 0, z: 0 };
}

export function packParams(layout: PointLayout, origin: Point3, segmentCount: number): ArrayBuffer {
  const buffer = new ArrayBuffer(PARAMS_BYTES);
  const view = new DataView(buffer);
  const { min } = layoutBounds(layout);
  const isPoints = layout.kind === 'points';
  const step = stepOf(layout);
  const dims = dimensionsOf(layout);
  view.setFloat32(0, isPoints ? 0 : min.x - origin.x, true);
  view.setFloat32(4, isPoints ? 0 : min.y - origin.y, true);
  view.setFloat32(8, isPoints ? 0 : min.z - origin.z, true);
  view.setUint32(12, segmentCount, true);
  view.setFloat32(16, step.x, true);
  view.setFloat32(20, step.y, true);
  view.setFloat32(24, step.z, true);
  view.setUint32(28, layoutPointCount(layout), true);
  view.setUint32(32, dims.x, true);
  view.setUint32(36, dims.y, true);
  view.setUint32(40, dims.z, true);
  view.setFloat32(44, -origin.y, true);
  return buffer;
}

export function workgroupCounts(
  layout: PointLayout,
  workgroup: WorkgroupShape,
): readonly [number, number, number] {
  const dims = dimensionsOf(layout);
  if (layout.kind === 'grid') {
    return [Math.ceil(dims.x / workgroup.x), Math.ceil(dims.z / workgroup.y), 1];
  }
  return [
    Math.ceil(dims.x / workgroup.x),
    Math.ceil(dims.y / workgroup.y),
    Math.ceil(dims.z / workgroup.z),
  ];
}

export function packPointsRelativeTo(coordinates: Float64Array, origin: Point3): Float32Array {
  const count = coordinates.length / 3;
  const packed = new Float32Array(count * POINT_STRIDE_FLOATS);
  for (let index = 0; index < count; index += 1) {
    packed[index * POINT_STRIDE_FLOATS] = (coordinates[3 * index] ?? 0) - origin.x;
    packed[index * POINT_STRIDE_FLOATS + 1] = (coordinates[3 * index + 1] ?? 0) - origin.y;
    packed[index * POINT_STRIDE_FLOATS + 2] = (coordinates[3 * index + 2] ?? 0) - origin.z;
  }
  return packed;
}
