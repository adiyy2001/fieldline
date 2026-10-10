import type { Point3 } from '../field-types';

export interface RayInterval {
  readonly near: number;
  readonly far: number;
}

export function intersectRayWithBox(
  origin: Point3,
  direction: Point3,
  min: Point3,
  max: Point3,
): RayInterval | null {
  let near = -Infinity;
  let far = Infinity;
  const axes: readonly (keyof Point3)[] = ['x', 'y', 'z'];
  for (const axis of axes) {
    const start = origin[axis];
    const step = direction[axis];
    if (Math.abs(step) < 1e-12) {
      if (start < min[axis] || start > max[axis]) {
        return null;
      }
      continue;
    }
    const first = (min[axis] - start) / step;
    const second = (max[axis] - start) / step;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }
  return far >= Math.max(near, 0) ? { near: Math.max(near, 0), far } : null;
}
