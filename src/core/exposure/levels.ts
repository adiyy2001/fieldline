import { VACUUM_PERMEABILITY } from '../constants';

export type FieldQuantity = 'electric' | 'magnetic';

export interface ExposureLevel {
  readonly id: string;
  readonly quantity: FieldQuantity;
  readonly value: number;
  readonly label: string;
}

export interface ExposurePreset {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly source: string;
  readonly electric: ExposureLevel;
  readonly magnetic: ExposureLevel;
}

export const VOLTS_PER_METRE_PER_KILOVOLT_PER_METRE = 1000;
export const TESLA_PER_MICROTESLA = 1e-6;

export function teslaFromAmperePerMetre(fieldStrength: number): number {
  return VACUUM_PERMEABILITY * fieldStrength;
}

export function kilovoltsPerMetre(voltsPerMetre: number): number {
  return voltsPerMetre / VOLTS_PER_METRE_PER_KILOVOLT_PER_METRE;
}

export function microtesla(tesla: number): number {
  return tesla / TESLA_PER_MICROTESLA;
}

export function quantityUnit(quantity: FieldQuantity): string {
  return quantity === 'electric' ? 'kV/m' : 'µT';
}

export function displayValue(level: ExposureLevel): number {
  return level.quantity === 'electric' ? kilovoltsPerMetre(level.value) : microtesla(level.value);
}

export function formatLevel(level: ExposureLevel): string {
  return `${level.label} ${Number(displayValue(level).toPrecision(4))} ${quantityUnit(level.quantity)}`;
}

function presetLevels(
  id: string,
  electricVoltsPerMetre: number,
  magneticTesla: number,
  labelPrefix: string,
): Pick<ExposurePreset, 'electric' | 'magnetic'> {
  return {
    electric: {
      id: `${id}-electric`,
      quantity: 'electric',
      value: electricVoltsPerMetre,
      label: `${labelPrefix} E`,
    },
    magnetic: {
      id: `${id}-magnetic`,
      quantity: 'magnetic',
      value: magneticTesla,
      label: `${labelPrefix} B`,
    },
  };
}

export const EXPOSURE_PRESETS: readonly ExposurePreset[] = [
  {
    id: 'icnirp-2010',
    label: 'ICNIRP 2010, general public',
    shortLabel: 'ICNIRP 2010',
    source: 'ICNIRP, Health Physics 99(6):818-836, 2010, Table 4, unperturbed rms values at 50 Hz',
    ...presetLevels('icnirp-2010', 5000, 200e-6, 'ICNIRP 2010'),
  },
  {
    id: 'icnirp-1998',
    label: 'ICNIRP 1998 and Council Recommendation 1999/519/EC',
    shortLabel: 'ICNIRP 1998',
    source: 'ICNIRP, Health Physics 74(4):494-522, 1998, Table 7, at 50 Hz',
    ...presetLevels('icnirp-1998', 5000, 100e-6, 'ICNIRP 1998'),
  },
  {
    id: 'poland-public',
    label: 'Poland, places accessible to the public',
    shortLabel: 'Poland public',
    source:
      'Regulation of the Minister of Health of 17 December 2019, Dz.U. 2019 poz. 2448, Table 2',
    ...presetLevels('poland-public', 10000, teslaFromAmperePerMetre(60), 'Poland public'),
  },
  {
    id: 'poland-residential',
    label: 'Poland, residential development areas',
    shortLabel: 'Poland residential',
    source:
      'Regulation of the Minister of Health of 17 December 2019, Dz.U. 2019 poz. 2448, Table 1',
    ...presetLevels('poland-residential', 1000, teslaFromAmperePerMetre(60), 'Poland residential'),
  },
];

export const DEFAULT_PRESET_ID = 'icnirp-2010';

export function findPreset(id: string): ExposurePreset | undefined {
  return EXPOSURE_PRESETS.find((preset) => preset.id === id);
}

export function defaultPreset(): ExposurePreset {
  const preset = findPreset(DEFAULT_PRESET_ID);
  if (preset === undefined) {
    throw new Error('The default exposure preset is missing');
  }
  return preset;
}

export function presetLevelList(preset: ExposurePreset): readonly ExposureLevel[] {
  return [preset.electric, preset.magnetic];
}

export function createCustomLevel(
  id: string,
  quantity: FieldQuantity,
  displayedValue: number,
  label: string,
): ExposureLevel {
  if (!Number.isFinite(displayedValue) || displayedValue <= 0) {
    throw new RangeError('A level must be a positive number');
  }
  const value =
    quantity === 'electric'
      ? displayedValue * VOLTS_PER_METRE_PER_KILOVOLT_PER_METRE
      : displayedValue * TESLA_PER_MICROTESLA;
  return { id, quantity, value, label };
}
