import { defaultParameters } from '../model/parameters';
import { groupExcitation } from '../model/excitation';
import { createFieldEvaluator3D } from './evaluate';
import { deserializeChargeSystem, serializeChargeSystem, transferablesOf } from './serialization';
import { solveLine } from './solve-line';

const parameters = defaultParameters('delta');
const { system } = solveLine(parameters);

describe('charge system serialization', () => {
  const serialized = serializeChargeSystem(system);

  it('stores the basis charges group after group in one array', () => {
    expect(serialized.count).toBe(210);
    expect(serialized.groupCount).toBe(3);
    expect(serialized.basisCharges).toHaveLength(630);
    expect(serialized.basisCharges[210 + 5]).toBe(system.basisCharges[1]?.[5]);
  });

  it('restores a system that gives the same field', () => {
    const restored = deserializeChargeSystem(serialized);
    const excitation = groupExcitation(parameters);
    const original = createFieldEvaluator3D(system, excitation.voltages, excitation.currents);
    const copy = createFieldEvaluator3D(restored, excitation.voltages, excitation.currents);
    const point = { x: 4, y: 1, z: system.reference.midZ };
    expect(copy(point)).toEqual(original(point));
    expect(restored.reference).toEqual(system.reference);
  });

  it('lists the five buffers to transfer', () => {
    const buffers = transferablesOf(serialized);
    expect(buffers).toHaveLength(5);
    expect(new Set(buffers).size).toBe(5);
  });
});
