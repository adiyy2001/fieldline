import type { FieldQuantity } from '../exposure/levels';
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

export function scalarAt(
  values: Float32Array,
  pointIndex: number,
  selection: ScalarSelection,
): number {
  const base = pointIndex * FIELD_COMPONENTS + quantityOffset(selection.quantity);
  const cos = Math.cos(selection.phaseRadians);
  const sin = Math.sin(selection.phaseRadians);
  let sum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const re = values[base + axis] ?? 0;
    const im = values[base + 3 + axis] ?? 0;
    const component = selection.mode === 'rms' ? Math.hypot(re, im) : SQRT2 * (re * cos - im * sin);
    sum += component * component;
  }
  return Math.sqrt(sum) * displayScale(selection.quantity);
}

export function scalarGrid(values: Float32Array, selection: ScalarSelection): Float32Array {
  const count = Math.floor(values.length / FIELD_COMPONENTS);
  const result = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    result[index] = scalarAt(values, index, selection);
  }
  return result;
}

export function scalarOfVector(vector: ComplexVector3, selection: ScalarSelection): number {
  const magnitude =
    selection.mode === 'rms'
      ? resultantRms(vector)
      : instantaneousMagnitude(vector, selection.phaseRadians);
  return magnitude * displayScale(selection.quantity);
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
