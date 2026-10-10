import { DEFAULT_PRESET_ID, type FieldQuantity, findPreset } from '../exposure/levels';
import { type LineParameters, defaultParameters } from './parameters';

export type ModelKind = 'charge-3d' | 'cross-section-2d';
export type DisplayMode = 'rms' | 'instantaneous';
export type ViewId = 'ground' | 'profile' | 'optimizer' | 'volume' | 'isosurface' | 'lines';

export interface ViewDefinition {
  readonly id: ViewId;
  readonly label: string;
  readonly key: string;
}

export const VIEW_DEFINITIONS: readonly ViewDefinition[] = [
  { id: 'ground', label: 'Ground', key: '1' },
  { id: 'profile', label: 'Profile', key: '2' },
  { id: 'optimizer', label: 'Phasing', key: '3' },
  { id: 'volume', label: 'Volume', key: '4' },
  { id: 'isosurface', label: 'Isosurfaces', key: '5' },
  { id: 'lines', label: 'Field lines', key: '6' },
];

export const MODEL_LABELS: Readonly<Record<ModelKind, string>> = {
  'charge-3d': '3D charge simulation',
  'cross-section-2d': '2D cross-section',
};

export const EVALUATION_HEIGHTS: readonly number[] = [1, 1.8];
export const PHASE_STEP_DEGREES = 15;
export const FULL_CYCLE_DEGREES = 360;
export const DEFAULT_CYCLE_SECONDS = 10;

export interface ViewSettings {
  readonly model: ModelKind;
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseDegrees: number;
  readonly evaluationHeight: number;
  readonly presetId: string;
  readonly view: ViewId;
}

export interface Configuration {
  readonly parameters: LineParameters;
  readonly settings: ViewSettings;
}

export function defaultSettings(): ViewSettings {
  return {
    model: 'charge-3d',
    quantity: 'electric',
    mode: 'rms',
    phaseDegrees: 0,
    evaluationHeight: EVALUATION_HEIGHTS[0] ?? 1,
    presetId: DEFAULT_PRESET_ID,
    view: 'ground',
  };
}

export function defaultConfiguration(): Configuration {
  return { parameters: defaultParameters(), settings: defaultSettings() };
}

export function isViewId(value: string): value is ViewId {
  return VIEW_DEFINITIONS.some((definition) => definition.id === value);
}

export function isModelKind(value: string): value is ModelKind {
  return value === 'charge-3d' || value === 'cross-section-2d';
}

export function isKnownPreset(id: string): boolean {
  return findPreset(id) !== undefined;
}

export function wrapPhase(degrees: number): number {
  const wrapped = degrees % FULL_CYCLE_DEGREES;
  return wrapped < 0 ? wrapped + FULL_CYCLE_DEGREES : wrapped;
}

export function stepPhase(degrees: number, steps: number): number {
  return wrapPhase(degrees + steps * PHASE_STEP_DEGREES);
}

export function settingsAreValid(settings: ViewSettings): boolean {
  return (
    Number.isFinite(settings.phaseDegrees) &&
    settings.phaseDegrees >= 0 &&
    settings.phaseDegrees < FULL_CYCLE_DEGREES &&
    EVALUATION_HEIGHTS.includes(settings.evaluationHeight) &&
    isKnownPreset(settings.presetId)
  );
}
