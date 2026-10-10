import type { VolumeSize } from '../../core/backend/regions';
import { nodeSpacing } from '../../core/backend/layout';
import type { GridSpec, VolumeSpec } from '../../core/backend/types';
import {
  type ContourLevel,
  formatNumber,
  formatQuantity,
} from '../../core/exposure/contour-levels';
import type { FieldQuantity } from '../../core/exposure/levels';
import type { FieldEvaluator, Point3 } from '../../core/field-types';
import { LINE_END_CODES, type LineEnd, type LineSeed } from '../../core/fieldlines/types';
import { scalarGrid, scalarOfVector } from '../../core/heatmap/scalar';
import { viridisAt } from '../../core/heatmap/color';
import type { DisplayMode } from '../../core/model/settings';
import {
  INSTANTANEOUS_PEAK_FACTOR,
  type TransferSettings,
  lookup,
  valueOfNormalized,
} from '../../core/volume/transfer-function';
import { MAXIMUM_SURFACE_LEVELS, SURFACE_COLORS } from '../../gpu/surface-params';
import type { ReadLine } from '../../gpu/trace-params';

export const HARDWARE_VOLUME_SIZE: VolumeSize = { nx: 64, ny: 64, nz: 128 };
export const SOFTWARE_VOLUME_SIZE: VolumeSize = { nx: 32, ny: 32, nz: 64 };
export const SOFTWARE_LINE_LIMIT = 64;
export const TICK_FRACTIONS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
export const GRADIENT_STOPS = 24;

export type Scene3dView = 'volume' | 'isosurface' | 'lines';

export interface FieldPeak {
  readonly value: number;
  readonly position: Point3;
}

export function volumeSizeFor(software: boolean): VolumeSize {
  return software ? SOFTWARE_VOLUME_SIZE : HARDWARE_VOLUME_SIZE;
}

export function quantityName(quantity: FieldQuantity): string {
  return quantity === 'electric' ? 'electric field' : 'magnetic flux density';
}

export function peakOfVolume(values: ArrayLike<number>, spec: VolumeSpec): FieldPeak {
  let bestIndex = 0;
  let best = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (value > best) {
      best = value;
      bestIndex = index;
    }
  }
  const ix = bestIndex % spec.nx;
  const iy = Math.floor(bestIndex / spec.nx) % spec.ny;
  const iz = Math.floor(bestIndex / (spec.nx * spec.ny));
  return {
    value: Math.max(0, best),
    position: {
      x: spec.xMin + ix * nodeSpacing(spec.xMin, spec.xMax, spec.nx),
      y: spec.yMin + iy * nodeSpacing(spec.yMin, spec.yMax, spec.ny),
      z: spec.zMin + iz * nodeSpacing(spec.zMin, spec.zMax, spec.nz),
    },
  };
}

export function peakOnGround(
  values: Float32Array,
  grid: GridSpec,
  quantity: FieldQuantity,
  window: { readonly min: number; readonly max: number } = { min: -Infinity, max: Infinity },
): FieldPeak {
  const scalars = scalarGrid(values, { quantity, mode: 'rms', phaseRadians: 0 });
  const spacing = nodeSpacing(grid.zMin, grid.zMax, grid.nz);
  let bestIndex = 0;
  let best = -Infinity;
  for (let index = 0; index < scalars.length; index += 1) {
    const value = scalars[index] ?? 0;
    const z = grid.zMin + Math.floor(index / grid.nx) * spacing;
    if (z >= window.min && z <= window.max && value > best) {
      best = value;
      bestIndex = index;
    }
  }
  const ix = bestIndex % grid.nx;
  const iz = Math.floor(bestIndex / grid.nx);
  return {
    value: Math.max(0, best),
    position: {
      x: grid.xMin + ix * nodeSpacing(grid.xMin, grid.xMax, grid.nx),
      y: grid.height,
      z: grid.zMin + iz * nodeSpacing(grid.zMin, grid.zMax, grid.nz),
    },
  };
}

export function describePosition(position: Point3): string {
  return `x = ${formatNumber(position.x)} m, height ${formatNumber(position.y)} m, z = ${formatNumber(position.z)} m`;
}

export function displayPeak(rmsValue: number, mode: DisplayMode): number {
  return mode === 'instantaneous' ? rmsValue * INSTANTANEOUS_PEAK_FACTOR : rmsValue;
}

export interface VolumeSummaryInput {
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseDegrees: number;
  readonly peak: FieldPeak;
  readonly transfer: TransferSettings;
  readonly height: number;
}

export function volumeSummary(input: VolumeSummaryInput): string {
  const { quantity, mode, peak, transfer } = input;
  const what = `Volume rendering of the ${quantityName(quantity)} up to ${formatNumber(input.height)} m above ground`;
  const timing =
    mode === 'rms'
      ? ', rms values'
      : `, instantaneous values at ${formatNumber(input.phaseDegrees)} degrees of the cycle`;
  const peakText = `The strongest rms value is ${formatQuantity(peak.value, quantity)} at ${describePosition(peak.position)}.`;
  const hidden = `Values below ${formatNumber(transfer.threshold * 100)} percent of the scale are hidden.`;
  return `${what}${timing}. ${peakText} ${hidden}`;
}

export interface IsoLegendEntry {
  readonly text: string;
  readonly sources: string;
  readonly swatch: string;
  readonly reached: boolean;
}

export function swatchColor(index: number): string {
  const color = SURFACE_COLORS[index] ?? SURFACE_COLORS[SURFACE_COLORS.length - 1];
  const channel = (value: number | undefined) => Math.round((value ?? 0) * 255);
  return `rgb(${String(channel(color?.[0]))} ${String(channel(color?.[1]))} ${String(channel(color?.[2]))})`;
}

export function isoLevelsFrom(
  levels: readonly ContourLevel[],
  peak: number,
): readonly ContourLevel[] {
  return [...levels]
    .sort((a, b) => a.value - b.value)
    .filter((level) => level.value > 0 && level.value < peak)
    .slice(0, MAXIMUM_SURFACE_LEVELS);
}

export function isoLegend(
  levels: readonly ContourLevel[],
  peak: number,
): readonly IsoLegendEntry[] {
  const drawn = isoLevelsFrom(levels, peak);
  const skipped = [...levels]
    .sort((a, b) => a.value - b.value)
    .filter((level) => !(level.value > 0 && level.value < peak));
  return [
    ...drawn.map((level, index) => ({
      text: level.text,
      sources: level.sources.join(', '),
      swatch: swatchColor(index),
      reached: true,
    })),
    ...skipped.map((level) => ({
      text: level.text,
      sources: level.sources.join(', '),
      swatch: 'transparent',
      reached: false,
    })),
  ];
}

export function isosurfaceSummary(
  quantity: FieldQuantity,
  peak: FieldPeak,
  levels: readonly ContourLevel[],
): string {
  const drawn = isoLevelsFrom(levels, peak.value);
  const peakText = `The strongest rms value is ${formatQuantity(peak.value, quantity)} at ${describePosition(peak.position)}.`;
  if (drawn.length === 0) {
    return `No isosurface is drawn because the ${quantityName(quantity)} stays below every exposure level. ${peakText}`;
  }
  const names = drawn.map((level) => level.text).join(', ');
  return `Isosurfaces of the ${quantityName(quantity)} at ${String(drawn.length)} exposure ${drawn.length === 1 ? 'level' : 'levels'}: ${names}. Each surface encloses the region where the rms value is above its level. ${peakText}`;
}

export interface EndCounts {
  readonly total: number;
  readonly ground: number;
  readonly conductor: number;
  readonly domain: number;
  readonly open: number;
}

export function countEnds(lines: readonly ReadLine[]): EndCounts {
  const tally = (end: LineEnd) => lines.filter((line) => line.end === LINE_END_CODES[end]).length;
  const ground = tally('ground');
  const conductor = tally('conductor');
  const domain = tally('domain');
  return {
    total: lines.length,
    ground,
    conductor,
    domain,
    open: lines.length - ground - conductor - domain,
  };
}

export interface LinesSummaryInput {
  readonly quantity: FieldQuantity;
  readonly phaseDegrees: number;
  readonly lineCount: number;
  readonly peak: FieldPeak | null;
  readonly ends: EndCounts | null;
}

export function linesSummary(input: LinesSummaryInput): string {
  const { quantity, peak, ends } = input;
  const drawn = ends === null ? input.lineCount : ends.total;
  const what = `${String(drawn)} ${quantity} field lines at ${formatNumber(input.phaseDegrees)} degrees of the cycle`;
  const behaviour =
    quantity === 'electric'
      ? 'They start on the conductors and follow the field to the ground or to another conductor.'
      : 'They circle the conductors and close on themselves.';
  const peakText =
    peak === null
      ? ''
      : ` The strongest rms value at ${formatNumber(peak.position.y)} m above ground is ${formatQuantity(peak.value, quantity)} at x = ${formatNumber(peak.position.x)} m, z = ${formatNumber(peak.position.z)} m.`;
  const endText =
    ends === null || quantity === 'magnetic'
      ? ''
      : ` ${String(ends.ground)} end on the ground, ${String(ends.conductor)} on a conductor, ${String(ends.domain + ends.open)} leave the drawn volume.`;
  return `${what}. ${behaviour}${endText}${peakText}`;
}

export interface ScaleTick {
  readonly fraction: number;
  readonly label: string;
}

export function scaleTicks(maximum: number): readonly ScaleTick[] {
  return TICK_FRACTIONS.map((fraction) => ({
    fraction,
    label: formatNumber(valueOfNormalized(fraction, maximum)),
  }));
}

export function transferGradient(table: Float32Array): string {
  const stops = Array.from({ length: GRADIENT_STOPS }, (_, index) => {
    const fraction = index / (GRADIENT_STOPS - 1);
    const [red, green, blue, alpha] = lookup(table, fraction);
    const visible = alpha > 0;
    const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
    const color = visible
      ? `rgb(${String(channel(red))} ${String(channel(green))} ${String(channel(blue))})`
      : 'transparent';
    return `${color} ${formatNumber(fraction * 100)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function lineScaleMaximum(
  seeds: readonly LineSeed[],
  evaluator: FieldEvaluator,
  quantity: FieldQuantity,
): number {
  let best = 0;
  for (const seed of seeds) {
    const pair = evaluator(seed.origin);
    const vector = quantity === 'electric' ? pair.electric : pair.magnetic;
    best = Math.max(best, scalarOfVector(vector, { quantity, mode: 'rms', phaseRadians: 0 }));
  }
  return Math.max(1e-6, best * INSTANTANEOUS_PEAK_FACTOR);
}

export const LINE_PALETTE_START = 0.4;

export function lineGradient(): string {
  const stops = Array.from({ length: GRADIENT_STOPS }, (_, index) => {
    const fraction = index / (GRADIENT_STOPS - 1);
    const [red, green, blue] = viridisAt(LINE_PALETTE_START + (1 - LINE_PALETTE_START) * fraction);
    const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
    return `rgb(${String(channel(red))} ${String(channel(green))} ${String(channel(blue))}) ${formatNumber(fraction * 100)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
