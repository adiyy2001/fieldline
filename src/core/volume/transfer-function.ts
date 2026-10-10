import { COLOR_STEPS, viridisAt } from '../heatmap/color';

export type TransferPreset = 'ramp' | 'bands';

export interface TransferSettings {
  readonly preset: TransferPreset;
  readonly opacity: number;
  readonly threshold: number;
}

export const TRANSFER_PRESETS: readonly { readonly id: TransferPreset; readonly label: string }[] =
  [
    { id: 'ramp', label: 'Viridis ramp' },
    { id: 'bands', label: 'Exposure bands' },
  ];

export const OPACITY_RANGE = { min: 0.05, max: 1, step: 0.05 } as const;
export const THRESHOLD_RANGE = { min: 0, max: 0.9, step: 0.05 } as const;
export const DEFAULT_TRANSFER: TransferSettings = {
  preset: 'ramp',
  opacity: 0.55,
  threshold: 0.25,
};
export const TRANSFER_ENTRIES = COLOR_STEPS;
export const SCALE_EXPONENT = 0.5;
export const INSTANTANEOUS_PEAK_FACTOR = Math.SQRT2;
export const OPACITY_REFERENCE_STEPS = 64;
export const OPAQUE_ALPHA = 0.98;

export function normalizedValue(value: number, maximum: number): number {
  if (!(maximum > 0) || !(value > 0)) {
    return 0;
  }
  return Math.min(1, Math.pow(value / maximum, SCALE_EXPONENT));
}

export function valueOfNormalized(fraction: number, maximum: number): number {
  return maximum * Math.pow(Math.min(1, Math.max(0, fraction)), 1 / SCALE_EXPONENT);
}

export function bandEdges(levels: readonly number[], maximum: number): readonly number[] {
  return [...levels]
    .filter((level) => level > 0 && level < maximum)
    .sort((a, b) => a - b)
    .map((level) => normalizedValue(level, maximum));
}

function rampAlpha(fraction: number, settings: TransferSettings): number {
  if (fraction <= settings.threshold) {
    return 0;
  }
  const span = Math.max(1e-6, 1 - settings.threshold);
  return settings.opacity * Math.pow((fraction - settings.threshold) / span, 1.2);
}

function bandAlpha(fraction: number, edges: readonly number[], settings: TransferSettings) {
  const band = edges.filter((edge) => fraction >= edge).length;
  if (band === 0 || fraction <= settings.threshold) {
    return { band, alpha: 0 };
  }
  return { band, alpha: settings.opacity * (0.35 + (0.65 * band) / Math.max(1, edges.length)) };
}

export function buildTransferTable(
  settings: TransferSettings,
  edges: readonly number[] = [],
): Float32Array {
  const table = new Float32Array(TRANSFER_ENTRIES * 4);
  for (let entry = 0; entry < TRANSFER_ENTRIES; entry += 1) {
    const fraction = entry / (TRANSFER_ENTRIES - 1);
    if (settings.preset === 'ramp') {
      const [red, green, blue] = viridisAt(fraction);
      table.set([red, green, blue, rampAlpha(fraction, settings)], entry * 4);
    } else {
      const { band, alpha } = bandAlpha(fraction, edges, settings);
      const [red, green, blue] = viridisAt(edges.length === 0 ? 0 : (band - 0.5) / edges.length);
      table.set([red, green, blue, alpha], entry * 4);
    }
  }
  return table;
}

export function lookup(
  table: Float32Array,
  fraction: number,
): readonly [number, number, number, number] {
  const position = Math.min(1, Math.max(0, fraction)) * (TRANSFER_ENTRIES - 1);
  const lower = Math.floor(position);
  const upper = Math.min(TRANSFER_ENTRIES - 1, lower + 1);
  const weight = position - lower;
  const channel = (index: number) =>
    (table[lower * 4 + index] ?? 0) * (1 - weight) + (table[upper * 4 + index] ?? 0) * weight;
  return [channel(0), channel(1), channel(2), channel(3)];
}

export function stepAlpha(alpha: number, stepScale: number): number {
  return 1 - Math.pow(1 - Math.min(0.999, alpha), stepScale);
}

export interface CompositedColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export function compositeFrontToBack(
  fractions: readonly number[],
  table: Float32Array,
  stepScale: number,
): CompositedColor {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  for (const fraction of fractions) {
    const sample = lookup(table, fraction);
    const contribution = stepAlpha(sample[3], stepScale);
    const weight = (1 - alpha) * contribution;
    red += weight * sample[0];
    green += weight * sample[1];
    blue += weight * sample[2];
    alpha += weight;
    if (alpha >= OPAQUE_ALPHA) {
      break;
    }
  }
  return { red, green, blue, alpha };
}
