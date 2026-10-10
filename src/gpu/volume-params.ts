import type { Point3 } from '../core/field-types';
import type { FieldQuantity } from '../core/exposure/levels';
import { displayScale, quantityOffset } from '../core/heatmap/scalar';
import type { DisplayMode } from '../core/model/settings';
import { INSTANTANEOUS_PEAK_FACTOR } from '../core/volume/transfer-function';
import type { BoxBounds } from './scene-geometry';

export const PACK_PARAMS_BYTES = 48;
export const MARCH_PARAMS_BYTES = 144;
export const STATS_WORDS = 2;
export const FLOAT_BITS = new Float32Array(1);
export const FLOAT_WORDS = new Uint32Array(FLOAT_BITS.buffer);

export interface GridDimensions {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export interface PackSelection {
  readonly dims: GridDimensions;
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseRadians: number;
}

export function pointCountOf(dims: GridDimensions): number {
  return dims.nx * dims.ny * dims.nz;
}

export function packPackParams(selection: PackSelection): ArrayBuffer {
  const buffer = new ArrayBuffer(PACK_PARAMS_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, selection.dims.nx, true);
  view.setUint32(4, selection.dims.ny, true);
  view.setUint32(8, selection.dims.nz, true);
  view.setUint32(12, pointCountOf(selection.dims), true);
  view.setUint32(16, quantityOffset(selection.quantity), true);
  view.setUint32(20, selection.mode === 'instantaneous' ? 1 : 0, true);
  view.setFloat32(32, Math.cos(selection.phaseRadians), true);
  view.setFloat32(36, Math.sin(selection.phaseRadians), true);
  view.setFloat32(40, displayScale(selection.quantity), true);
  return buffer;
}

export function decodeStatsWords(words: Uint32Array): { electric: number; magnetic: number } {
  const copy = new Uint32Array(STATS_WORDS);
  copy.set(words.subarray(0, STATS_WORDS));
  const values = new Float32Array(copy.buffer);
  return { electric: values[0] ?? 0, magnetic: values[1] ?? 0 };
}

export function displayMaximum(
  quantity: FieldQuantity,
  mode: DisplayMode,
  rms: { readonly electric: number; readonly magnetic: number },
): number {
  const peak = rms[quantity];
  return mode === 'instantaneous' ? peak * INSTANTANEOUS_PEAK_FACTOR : peak;
}

export interface MarchUniforms {
  readonly inverseViewProjection: Float32Array;
  readonly cameraPosition: Point3;
  readonly box: BoxBounds;
  readonly dims: GridDimensions;
  readonly steps: number;
  readonly maximum: number;
  readonly referenceLength: number;
  readonly width: number;
  readonly height: number;
}

export function packMarchParams(uniforms: MarchUniforms): ArrayBuffer {
  const buffer = new ArrayBuffer(MARCH_PARAMS_BYTES);
  const floats = new Float32Array(buffer);
  floats.set(uniforms.inverseViewProjection, 0);
  floats.set(
    [
      uniforms.cameraPosition.x,
      uniforms.cameraPosition.y,
      uniforms.cameraPosition.z,
      0,
      uniforms.box.min.x,
      uniforms.box.min.y,
      uniforms.box.min.z,
      uniforms.maximum,
      uniforms.box.max.x,
      uniforms.box.max.y,
      uniforms.box.max.z,
      uniforms.steps,
      uniforms.dims.nx,
      uniforms.dims.ny,
      uniforms.dims.nz,
      uniforms.referenceLength,
      uniforms.width,
      uniforms.height,
      0,
      0,
    ],
    16,
  );
  return buffer;
}

export const DEFAULT_MARCH_STEPS = 128;
export const REFERENCE_STEPS_ACROSS_DIAGONAL = 96;

export function referenceLengthOf(box: BoxBounds): number {
  return (
    Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) /
    REFERENCE_STEPS_ACROSS_DIAGONAL
  );
}
