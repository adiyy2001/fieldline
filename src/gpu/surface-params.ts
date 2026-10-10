import type { VolumeSpec } from '../core/backend/types';
import type { Point3 } from '../core/field-types';

export const EXTRACT_PARAMS_BYTES = 64;
export const SURFACE_DRAW_BYTES = 144;
export const SURFACE_VERTEX_BYTES = 32;
export const INDIRECT_ARGUMENT_WORDS = 8;
export const INDIRECT_ARGUMENT_BYTES = INDIRECT_ARGUMENT_WORDS * Uint32Array.BYTES_PER_ELEMENT;
export const PRODUCED_COUNTER_WORD = 4;
export const MAXIMUM_SURFACE_LEVELS = 3;
export const DEFAULT_VERTEX_CAPACITY = 786_432;

export type Rgba = readonly [number, number, number, number];

export const SURFACE_COLORS: readonly Rgba[] = [
  [0.3, 0.62, 0.95, 0.42],
  [0.98, 0.8, 0.28, 0.55],
  [0.95, 0.35, 0.3, 0.78],
  [0.7, 0.7, 0.7, 0.5],
];

export function packExtractParams(
  spec: VolumeSpec,
  level: number,
  levelIndex: number,
  vertexCapacity: number,
): ArrayBuffer {
  const buffer = new ArrayBuffer(EXTRACT_PARAMS_BYTES);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  floats.set([spec.xMin, spec.yMin, spec.zMin, 0], 0);
  floats.set(
    [
      (spec.xMax - spec.xMin) / Math.max(1, spec.nx - 1),
      (spec.yMax - spec.yMin) / Math.max(1, spec.ny - 1),
      (spec.zMax - spec.zMin) / Math.max(1, spec.nz - 1),
      0,
    ],
    4,
  );
  words.set([spec.nx, spec.ny, spec.nz, vertexCapacity], 8);
  floats.set([level, levelIndex, 0, 0], 12);
  return buffer;
}

export function packSurfaceDraw(
  viewProjection: Float32Array,
  cameraPosition: Point3,
  colors: readonly Rgba[] = SURFACE_COLORS,
): ArrayBuffer {
  const buffer = new ArrayBuffer(SURFACE_DRAW_BYTES);
  const floats = new Float32Array(buffer);
  floats.set(viewProjection, 0);
  floats.set([cameraPosition.x, cameraPosition.y, cameraPosition.z, 0], 16);
  colors.slice(0, 4).forEach((color, index) => {
    floats.set(color, 20 + index * 4);
  });
  return buffer;
}

export function vertexCapacityFor(
  cellCount: number,
  maximumBufferBytes: number,
  requested: number = DEFAULT_VERTEX_CAPACITY,
): number {
  const byLimit = Math.floor(maximumBufferBytes / SURFACE_VERTEX_BYTES / 3) * 3;
  const byCells = cellCount * 3 * 2;
  return Math.max(3, Math.min(requested, byLimit, byCells));
}

export function usableVertexCount(produced: number, capacity: number): number {
  return Math.floor(Math.min(produced, capacity) / 3) * 3;
}

export function surfaceLevels(levels: readonly number[], maximum: number): readonly number[] {
  return levels.filter((level) => level > 0 && level < maximum).slice(0, MAXIMUM_SURFACE_LEVELS);
}

export function volumeSpacingOf(spec: VolumeSpec): Point3 {
  return {
    x: (spec.xMax - spec.xMin) / Math.max(1, spec.nx - 1),
    y: (spec.yMax - spec.yMin) / Math.max(1, spec.ny - 1),
    z: (spec.zMax - spec.zMin) / Math.max(1, spec.nz - 1),
  };
}
