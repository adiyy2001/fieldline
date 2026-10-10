import { MICROCOULOMB_PER_COULOMB, type FieldSource } from '../core/backend/types';
import type { Point3 } from '../core/field-types';
import { SEGMENT_STRIDE } from '../core/field3d/segment-set';

export const GPU_SEGMENT_FLOATS = 12;
export const GPU_SEGMENT_BYTES = GPU_SEGMENT_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export const SEGMENT_LAYOUT = {
  startX: 0,
  startY: 1,
  startZ: 2,
  chargeRe: 3,
  endX: 4,
  endY: 5,
  endZ: 6,
  chargeIm: 7,
  currentRe: 8,
  currentIm: 9,
  radius: 10,
  spare: 11,
} as const;

export function packGpuSegments(source: FieldSource, origin: Point3): Float32Array {
  const { system, excitation } = source;
  const { set } = system;
  const charges = system.chargesFor(excitation.voltages);
  const currents = system.currentsFor(excitation.currents);
  const packed = new Float32Array(set.count * GPU_SEGMENT_FLOATS);
  for (let index = 0; index < set.count; index += 1) {
    const from = index * SEGMENT_STRIDE;
    const to = index * GPU_SEGMENT_FLOATS;
    const length = set.data[from + 6] ?? 0;
    const startX = set.data[from] ?? 0;
    const startY = set.data[from + 1] ?? 0;
    const startZ = set.data[from + 2] ?? 0;
    packed[to + SEGMENT_LAYOUT.startX] = startX - origin.x;
    packed[to + SEGMENT_LAYOUT.startY] = startY - origin.y;
    packed[to + SEGMENT_LAYOUT.startZ] = startZ - origin.z;
    packed[to + SEGMENT_LAYOUT.endX] = startX + (set.data[from + 3] ?? 0) * length - origin.x;
    packed[to + SEGMENT_LAYOUT.endY] = startY + (set.data[from + 4] ?? 0) * length - origin.y;
    packed[to + SEGMENT_LAYOUT.endZ] = startZ + (set.data[from + 5] ?? 0) * length - origin.z;
    packed[to + SEGMENT_LAYOUT.chargeRe] = (charges.re[index] ?? 0) * MICROCOULOMB_PER_COULOMB;
    packed[to + SEGMENT_LAYOUT.chargeIm] = (charges.im[index] ?? 0) * MICROCOULOMB_PER_COULOMB;
    packed[to + SEGMENT_LAYOUT.currentRe] = currents.re[index] ?? 0;
    packed[to + SEGMENT_LAYOUT.currentIm] = currents.im[index] ?? 0;
    packed[to + SEGMENT_LAYOUT.radius] = set.data[from + 7] ?? 0;
  }
  return packed;
}
