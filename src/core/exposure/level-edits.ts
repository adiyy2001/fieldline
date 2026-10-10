import type { FieldQuantity } from './levels';

export interface CustomLevel {
  readonly quantity: FieldQuantity;
  readonly value: number;
  readonly label: string;
}

export interface LevelEdits {
  readonly customLevels: readonly CustomLevel[];
  readonly hiddenLevels: readonly string[];
}

export interface LevelLimits {
  readonly minimum: number;
  readonly maximum: number;
}

export const NO_LEVEL_EDITS: LevelEdits = { customLevels: [], hiddenLevels: [] };
export const MAXIMUM_LEVELS_PER_QUANTITY = 4;
export const MAXIMUM_LABEL_LENGTH = 24;
export const DEFAULT_CUSTOM_LABEL = 'Custom';

export const LEVEL_LIMITS: Readonly<Record<FieldQuantity, LevelLimits>> = {
  electric: { minimum: 0.01, maximum: 100 },
  magnetic: { minimum: 0.1, maximum: 10000 },
};

const QUANTITY_CODES: Readonly<Record<FieldQuantity, string>> = { electric: 'e', magnetic: 'b' };
const ENTRY_SEPARATOR = ';';
const FIELD_SEPARATOR = ':';
const HIDDEN_SEPARATOR = ',';

export type EditResult =
  | { readonly status: 'ok'; readonly edits: LevelEdits }
  | { readonly status: 'rejected'; readonly issue: string };

export function referenceKey(quantity: FieldQuantity, value: number): string {
  return `${QUANTITY_CODES[quantity]}${FIELD_SEPARATOR}${String(value)}`;
}

export function cleanLabel(label: string): string {
  const collapsed = label.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, MAXIMUM_LABEL_LENGTH).trim();
}

export function sameValue(first: number, second: number): boolean {
  return Math.abs(first - second) <= 1e-9 * Math.max(Math.abs(first), Math.abs(second));
}

export function customLevelIssue(level: CustomLevel): string | null {
  const limits = LEVEL_LIMITS[level.quantity];
  const unit = level.quantity === 'electric' ? 'kV/m' : 'µT';
  if (
    !Number.isFinite(level.value) ||
    level.value < limits.minimum ||
    level.value > limits.maximum
  ) {
    return `A level must be between ${String(limits.minimum)} and ${String(limits.maximum)} ${unit}`;
  }
  if (cleanLabel(level.label) !== level.label || level.label.length === 0) {
    return 'The label needs one to 24 visible characters';
  }
  return null;
}

export function normalizeCustomLevel(level: CustomLevel): CustomLevel {
  const label = cleanLabel(level.label);
  return { ...level, label: label === '' ? DEFAULT_CUSTOM_LABEL : label };
}

export function addCustomLevel(
  edits: LevelEdits,
  candidate: CustomLevel,
  visibleValues: readonly number[],
): EditResult {
  const level = normalizeCustomLevel(candidate);
  const issue = customLevelIssue(level);
  if (issue !== null) {
    return { status: 'rejected', issue };
  }
  if (visibleValues.some((value) => sameValue(value, level.value))) {
    return { status: 'rejected', issue: 'This level is already listed' };
  }
  if (visibleValues.length >= MAXIMUM_LEVELS_PER_QUANTITY) {
    return {
      status: 'rejected',
      issue: `At most ${String(MAXIMUM_LEVELS_PER_QUANTITY)} levels per field. Remove one first`,
    };
  }
  return { status: 'ok', edits: { ...edits, customLevels: [...edits.customLevels, level] } };
}

export function removeCustomLevel(edits: LevelEdits, level: CustomLevel): LevelEdits {
  return {
    ...edits,
    customLevels: edits.customLevels.filter(
      (entry) => !(entry.quantity === level.quantity && sameValue(entry.value, level.value)),
    ),
  };
}

export function hideReferenceLevel(
  edits: LevelEdits,
  quantity: FieldQuantity,
  value: number,
): LevelEdits {
  const key = referenceKey(quantity, value);
  return edits.hiddenLevels.includes(key)
    ? edits
    : { ...edits, hiddenLevels: [...edits.hiddenLevels, key] };
}

export function hasLevelEdits(edits: LevelEdits): boolean {
  return edits.customLevels.length > 0 || edits.hiddenLevels.length > 0;
}

export function encodeCustomLevels(levels: readonly CustomLevel[]): string {
  return levels
    .map((level) =>
      [QUANTITY_CODES[level.quantity], String(level.value), encodeURIComponent(level.label)].join(
        FIELD_SEPARATOR,
      ),
    )
    .join(ENTRY_SEPARATOR);
}

function quantityOfCode(code: string): FieldQuantity | undefined {
  return (['electric', 'magnetic'] as const).find((quantity) => QUANTITY_CODES[quantity] === code);
}

function decodeLabel(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

export function decodeCustomLevels(raw: string): readonly CustomLevel[] | undefined {
  if (raw === '') {
    return [];
  }
  const levels: CustomLevel[] = [];
  for (const entry of raw.split(ENTRY_SEPARATOR)) {
    const [code, valueText, labelText, ...rest] = entry.split(FIELD_SEPARATOR);
    const quantity = quantityOfCode(code ?? '');
    const label = decodeLabel(labelText ?? '');
    const value =
      valueText === undefined || valueText.trim() === '' ? Number.NaN : Number(valueText);
    if (quantity === undefined || label === undefined || rest.length > 0) {
      return undefined;
    }
    const level: CustomLevel = { quantity, value, label };
    if (customLevelIssue(level) !== null) {
      return undefined;
    }
    levels.push(level);
  }
  return levels;
}

export function encodeHiddenLevels(keys: readonly string[]): string {
  return keys.join(HIDDEN_SEPARATOR);
}

export function decodeHiddenLevels(raw: string): readonly string[] | undefined {
  if (raw === '') {
    return [];
  }
  const keys = raw.split(HIDDEN_SEPARATOR);
  const valid = keys.every((key) => /^[eb]:\d+(\.\d+)?$/.test(key));
  return valid ? keys : undefined;
}

export function levelEditsAreValid(edits: LevelEdits): boolean {
  const perQuantity = (quantity: FieldQuantity): number =>
    edits.customLevels.filter((level) => level.quantity === quantity).length;
  return (
    edits.customLevels.every((level) => customLevelIssue(level) === null) &&
    perQuantity('electric') < MAXIMUM_LEVELS_PER_QUANTITY &&
    perQuantity('magnetic') < MAXIMUM_LEVELS_PER_QUANTITY
  );
}
