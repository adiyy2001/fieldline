import { type LevelEdits, NO_LEVEL_EDITS, referenceKey, sameValue } from './level-edits';
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

export interface LevelEntry extends ContourLevel {
  readonly key: string;
  readonly custom: boolean;
  readonly name: string;
}

interface Candidate {
  readonly value: number;
  readonly sources: string[];
  readonly emphasised: boolean;
  readonly custom: boolean;
}

function referenceCandidates(
  quantity: FieldQuantity,
  presetId: string,
  edits: LevelEdits,
): readonly Candidate[] {
  const selected = findPreset(presetId);
  const grouped = new Map<number, ExposurePreset[]>();
  for (const preset of EXPOSURE_PRESETS) {
    const value = levelOf(preset, quantity);
    grouped.set(value, [...(grouped.get(value) ?? []), preset]);
  }
  return [...grouped.entries()]
    .filter(([value]) => !edits.hiddenLevels.includes(referenceKey(quantity, value)))
    .map(([value, presets]) => ({
      value,
      sources: presets.map((preset) => preset.shortLabel),
      emphasised: selected !== undefined && presets.some((preset) => preset.id === selected.id),
      custom: false,
    }));
}

function mergeCandidates(
  references: readonly Candidate[],
  edits: LevelEdits,
  quantity: FieldQuantity,
): readonly Candidate[] {
  const merged: Candidate[] = references.map((candidate) => ({ ...candidate }));
  for (const level of edits.customLevels.filter((entry) => entry.quantity === quantity)) {
    const existing = merged.find((candidate) => sameValue(candidate.value, level.value));
    if (existing === undefined) {
      merged.push({ value: level.value, sources: [level.label], emphasised: false, custom: true });
    } else {
      existing.sources.push(level.label);
    }
  }
  return merged;
}

export function levelEntries(
  quantity: FieldQuantity,
  presetId: string,
  edits: LevelEdits = NO_LEVEL_EDITS,
): readonly LevelEntry[] {
  const unit = quantityUnit(quantity);
  return [...mergeCandidates(referenceCandidates(quantity, presetId, edits), edits, quantity)]
    .sort((first, second) => first.value - second.value)
    .map((candidate, index) => ({
      key: `${candidate.custom ? 'custom' : 'reference'}:${referenceKey(quantity, candidate.value)}`,
      custom: candidate.custom,
      name: candidate.sources.join(', '),
      value: candidate.value,
      unit,
      sources: candidate.sources,
      emphasised: candidate.emphasised,
      dashIndex: index,
      text: `${formatNumber(candidate.value)} ${unit}`,
    }));
}

export function contourLevels(
  quantity: FieldQuantity,
  presetId: string,
  edits: LevelEdits = NO_LEVEL_EDITS,
): readonly ContourLevel[] {
  return levelEntries(quantity, presetId, edits).slice(0, MAXIMUM_CONTOUR_LEVELS);
}

export function dashDescription(level: ContourLevel): string {
  return DASH_NAMES[level.dashIndex] ?? 'solid';
}
