import { type FieldQuantity, microtesla } from '../exposure/levels';
import { FIELD_COMPONENTS } from '../backend/types';
import type { DisplayMode } from '../model/settings';
import { type ComplexVector3, instantaneousMagnitude, resultantRms } from '../phasor';
import { SQRT2 } from '../constants';

export const VOLTS_PER_METRE_PER_DISPLAY_UNIT = 1000;

export interface ScalarSelection {
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseRadians: number;
}

export function displayScale(quantity: FieldQuantity): number {
  return quantity === 'electric' ? 1 / VOLTS_PER_METRE_PER_DISPLAY_UNIT : 1;
}

export function quantityOffset(quantity: FieldQuantity): number {
  return quantity === 'electric' ? 0 : 6;
}

interface PreparedSelection {
  readonly offset: number;
  readonly rms: boolean;
  readonly cos: number;
  readonly sin: number;
  readonly scale: number;
}

function prepare(selection: ScalarSelection): PreparedSelection {
  return {
    offset: quantityOffset(selection.quantity),
    rms: selection.mode === 'rms',
    cos: Math.cos(selection.phaseRadians),
    sin: Math.sin(selection.phaseRadians),
    scale: displayScale(selection.quantity),
  };
}

function preparedScalarAt(
  values: Float32Array,
  pointIndex: number,
  prepared: PreparedSelection,
): number {
  const base = pointIndex * FIELD_COMPONENTS + prepared.offset;
  let sum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const re = values[base + axis] ?? 0;
    const im = values[base + 3 + axis] ?? 0;
    const component = prepared.rms
      ? Math.sqrt(re * re + im * im)
      : SQRT2 * (re * prepared.cos - im * prepared.sin);
    sum += component * component;
  }
  return Math.sqrt(sum) * prepared.scale;
}

export function scalarAt(
  values: Float32Array,
  pointIndex: number,
  selection: ScalarSelection,
): number {
  return preparedScalarAt(values, pointIndex, prepare(selection));
}

export function scalarGrid(values: Float32Array, selection: ScalarSelection): Float32Array {
  const count = Math.floor(values.length / FIELD_COMPONENTS);
  const prepared = prepare(selection);
  const result = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    result[index] = preparedScalarAt(values, index, prepared);
  }
  return result;
}

export function scalarOfVector(vector: ComplexVector3, selection: ScalarSelection): number {
  const magnitude =
    selection.mode === 'rms'
      ? resultantRms(vector)
      : instantaneousMagnitude(vector, selection.phaseRadians);
  return selection.quantity === 'electric'
    ? magnitude * displayScale('electric')
    : microtesla(magnitude);
}

export function maximum(values: Float32Array): number {
  let best = 0;
  for (const value of values) {
    if (value > best) {
      best = value;
    }
  }
  return best;
}

export interface RmsMaxima {
  readonly electric: number;
  readonly magnetic: number;
}

export function rmsMaxima(values: Float32Array): RmsMaxima {
  const count = Math.floor(values.length / FIELD_COMPONENTS);
  const electricSelection = prepare({ quantity: 'electric', mode: 'rms', phaseRadians: 0 });
  const magneticSelection = prepare({ quantity: 'magnetic', mode: 'rms', phaseRadians: 0 });
  let electric = 0;
  let magnetic = 0;
  for (let index = 0; index < count; index += 1) {
    electric = Math.max(electric, preparedScalarAt(values, index, electricSelection));
    magnetic = Math.max(magnetic, preparedScalarAt(values, index, magneticSelection));
  }
  return { electric, magnetic };
}
