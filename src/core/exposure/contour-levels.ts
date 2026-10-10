import {
  EXPOSURE_PRESETS,
  type ExposurePreset,
  type FieldQuantity,
  displayValue,
  findPreset,
  quantityUnit,
} from './levels';

export const MAXIMUM_CONTOUR_LEVELS = 4;
export const DASH_PATTERNS: readonly (readonly number[])[] = [[], [14, 6], [6, 5], [2, 4]];
export const DASH_NAMES: readonly string[] = ['solid', 'long dashes', 'short dashes', 'dots'];

export interface ContourLevel {
  readonly value: number;
  readonly unit: string;
  readonly sources: readonly string[];
  readonly emphasised: boolean;
  readonly dashIndex: number;
  readonly text: string;
}

function levelOf(preset: ExposurePreset, quantity: FieldQuantity): number {
  const level = quantity === 'electric' ? preset.electric : preset.magnetic;
  return Number(displayValue(level).toPrecision(4));
}

export function formatNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 100) {
    return String(Math.round(value));
  }
  return String(Number(value.toFixed(magnitude >= 10 ? 1 : 2)));
}

export function formatQuantity(value: number, quantity: FieldQuantity): string {
  return `${formatNumber(value)} ${quantityUnit(quantity)}`;
}

export function contourLevels(quantity: FieldQuantity, presetId: string): readonly ContourLevel[] {
  const selected = findPreset(presetId);
  const grouped = new Map<number, ExposurePreset[]>();
  for (const preset of EXPOSURE_PRESETS) {
    const value = levelOf(preset, quantity);
    grouped.set(value, [...(grouped.get(value) ?? []), preset]);
  }
  const unit = quantityUnit(quantity);
  return [...grouped.entries()]
    .sort(([first], [second]) => first - second)
    .slice(0, MAXIMUM_CONTOUR_LEVELS)
    .map(([value, presets], index) => {
      const sources = presets.map((preset) => preset.shortLabel);
      return {
        value,
        unit,
        sources,
        emphasised: selected !== undefined && presets.some((preset) => preset.id === selected.id),
        dashIndex: index,
        text: `${formatNumber(value)} ${unit}`,
      };
    });
}

export function dashDescription(level: ContourLevel): string {
  return DASH_NAMES[level.dashIndex] ?? 'solid';
}
