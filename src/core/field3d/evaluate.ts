import type { FieldEvaluator, FieldPair } from '../field-types';
import type { Complex } from '../complex';
import type { ChargeSystem } from './charge-system';
import { createTerms, segmentElectricFieldWithImage, segmentMagneticField } from './segment-kernel';

function vector(values: Float64Array, offset: number): [Complex, Complex, Complex] {
  return [
    { re: values[offset] ?? 0, im: values[offset + 1] ?? 0 },
    { re: values[offset + 2] ?? 0, im: values[offset + 3] ?? 0 },
    { re: values[offset + 4] ?? 0, im: values[offset + 5] ?? 0 },
  ];
}

export function createFieldEvaluator3D(
  system: ChargeSystem,
  groupVoltages: readonly Complex[],
  groupCurrents: readonly Complex[],
): FieldEvaluator {
  const charges = system.chargesFor(groupVoltages);
  const currents = system.currentsFor(groupCurrents);
  const terms = createTerms();
  const unit = new Float64Array(3);
  const { data, count } = system.set;
  return (point): FieldPair => {
    const electric = new Float64Array(6);
    const magnetic = new Float64Array(6);
    for (let index = 0; index < count; index += 1) {
      const chargeRe = charges.re[index] ?? 0;
      const chargeIm = charges.im[index] ?? 0;
      if (chargeRe !== 0 || chargeIm !== 0) {
        segmentElectricFieldWithImage(data, index, point.x, point.y, point.z, terms, unit);
        for (let axis = 0; axis < 3; axis += 1) {
          electric[2 * axis] = (electric[2 * axis] ?? 0) + chargeRe * (unit[axis] ?? 0);
          electric[2 * axis + 1] = (electric[2 * axis + 1] ?? 0) + chargeIm * (unit[axis] ?? 0);
        }
      }
      const currentRe = currents.re[index] ?? 0;
      const currentIm = currents.im[index] ?? 0;
      if (currentRe !== 0 || currentIm !== 0) {
        segmentMagneticField(data, index, point.x, point.y, point.z, terms, unit);
        for (let axis = 0; axis < 3; axis += 1) {
          magnetic[2 * axis] = (magnetic[2 * axis] ?? 0) + currentRe * (unit[axis] ?? 0);
          magnetic[2 * axis + 1] = (magnetic[2 * axis + 1] ?? 0) + currentIm * (unit[axis] ?? 0);
        }
      }
    }
    const [ex, ey, ez] = vector(electric, 0);
    const [bx, by, bz] = vector(magnetic, 0);
    return {
      electric: { x: ex, y: ey, z: ez },
      magnetic: { x: bx, y: by, z: bz },
    };
  };
}
