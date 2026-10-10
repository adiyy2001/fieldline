import { createFieldBuffers, segmentFieldsWithImage } from '../field3d/segment-kernel';
import { pointAt } from './layout';
import {
  FIELD_COMPONENTS,
  MICROTESLA_PER_TESLA,
  type FieldSource,
  type PointLayout,
} from './types';

interface Phasors {
  readonly chargeRe: Float64Array;
  readonly chargeIm: Float64Array;
  readonly currentRe: Float64Array;
  readonly currentIm: Float64Array;
}

function phasorsOf(source: FieldSource): Phasors {
  const { system, excitation } = source;
  const charges = system.chargesFor(excitation.voltages);
  const currents = system.currentsFor(excitation.currents);
  return {
    chargeRe: charges.re,
    chargeIm: charges.im,
    currentRe: currents.re,
    currentIm: currents.im,
  };
}

export function evaluateRange(
  source: FieldSource,
  layout: PointLayout,
  start: number,
  end: number,
): Float32Array {
  const { data, count } = source.system.set;
  const phasors = phasorsOf(source);
  const buffers = createFieldBuffers();
  const result = new Float32Array((end - start) * FIELD_COMPONENTS);
  const accumulator = new Float64Array(FIELD_COMPONENTS);
  for (let pointIndex = start; pointIndex < end; pointIndex += 1) {
    const point = pointAt(layout, pointIndex);
    accumulator.fill(0);
    for (let index = 0; index < count; index += 1) {
      segmentFieldsWithImage(data, index, point.x, point.y, point.z, buffers);
      const chargeRe = phasors.chargeRe[index] ?? 0;
      const chargeIm = phasors.chargeIm[index] ?? 0;
      const currentRe = phasors.currentRe[index] ?? 0;
      const currentIm = phasors.currentIm[index] ?? 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const electric = buffers.electric[axis] ?? 0;
        const magnetic = buffers.magnetic[axis] ?? 0;
        accumulator[axis] = (accumulator[axis] ?? 0) + chargeRe * electric;
        accumulator[3 + axis] = (accumulator[3 + axis] ?? 0) + chargeIm * electric;
        accumulator[6 + axis] = (accumulator[6 + axis] ?? 0) + currentRe * magnetic;
        accumulator[9 + axis] = (accumulator[9 + axis] ?? 0) + currentIm * magnetic;
      }
    }
    const offset = (pointIndex - start) * FIELD_COMPONENTS;
    for (let component = 0; component < FIELD_COMPONENTS; component += 1) {
      const scale = component < 6 ? 1 : MICROTESLA_PER_TESLA;
      result[offset + component] = (accumulator[component] ?? 0) * scale;
    }
  }
  return result;
}
