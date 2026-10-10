import { quantityOffset, displayScale } from '../core/heatmap/scalar';
import type { ContourLevel } from '../core/exposure/contour-levels';
import { MAXIMUM_CONTOUR_LEVELS } from '../core/exposure/contour-levels';
import type { FieldQuantity } from '../core/exposure/levels';
import type { DisplayMode } from '../core/model/settings';

export const HEATMAP_PARAMS_BYTES = 112;
export const LEVEL_BYTES = 16;
export const CONTOUR_HALF_WIDTH_PIXELS = 1.1;

export interface HeatmapUniforms {
  readonly nx: number;
  readonly nz: number;
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseRadians: number;
  readonly maximum: number;
  readonly width: number;
  readonly height: number;
  readonly levels: readonly ContourLevel[];
}

export function packHeatmapParams(uniforms: HeatmapUniforms): ArrayBuffer {
  const buffer = new ArrayBuffer(HEATMAP_PARAMS_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, uniforms.nx, true);
  view.setUint32(4, uniforms.nz, true);
  view.setUint32(8, quantityOffset(uniforms.quantity), true);
  view.setUint32(12, uniforms.mode === 'instantaneous' ? 1 : 0, true);
  view.setFloat32(16, Math.cos(uniforms.phaseRadians), true);
  view.setFloat32(20, Math.sin(uniforms.phaseRadians), true);
  view.setFloat32(24, displayScale(uniforms.quantity), true);
  view.setFloat32(28, uniforms.maximum, true);
  view.setFloat32(32, uniforms.width, true);
  view.setFloat32(36, uniforms.height, true);
  view.setFloat32(40, CONTOUR_HALF_WIDTH_PIXELS, true);
  const levels = uniforms.levels.slice(0, MAXIMUM_CONTOUR_LEVELS);
  view.setFloat32(44, levels.length, true);
  levels.forEach((level, index) => {
    const offset = 48 + index * LEVEL_BYTES;
    view.setFloat32(offset, level.value, true);
    view.setFloat32(offset + 4, level.dashIndex, true);
    view.setFloat32(offset + 8, level.emphasised ? 1 : 0, true);
  });
  return buffer;
}
