import { beforeAll, describe, expect, it } from 'vitest';
import type { FieldSource } from '../core/backend/types';
import { solveLine } from '../core/field3d/solve-line';
import { SEGMENT_STRIDE } from '../core/field3d/segment-set';
import { groupExcitation } from '../core/model/excitation';
import { defaultParameters } from '../core/model/parameters';
import {
  GPU_SEGMENT_BYTES,
  GPU_SEGMENT_FLOATS,
  SEGMENT_LAYOUT,
  packGpuSegments,
} from './segment-pack';

let source: FieldSource;

beforeAll(() => {
  const parameters = defaultParameters('horizontal');
  source = { system: solveLine(parameters).system, excitation: groupExcitation(parameters) };
});

describe('GPU segment packing', () => {
  it('uses 48 bytes per segment as in ADR 7', () => {
    expect(GPU_SEGMENT_BYTES).toBe(48);
    expect(GPU_SEGMENT_FLOATS * 4).toBe(48);
    const packed = packGpuSegments(source, { x: 0, y: 0, z: 0 });
    expect(packed.length).toBe(source.system.set.count * GPU_SEGMENT_FLOATS);
  });

  it('places start, end, charge, current and radius at the offsets the shader reads', () => {
    const { set } = source.system;
    const origin = { x: 1, y: 2, z: 300 };
    const packed = packGpuSegments(source, origin);
    const index = 40;
    const from = index * SEGMENT_STRIDE;
    const to = index * GPU_SEGMENT_FLOATS;
    const length = set.data[from + 6] ?? 0;
    expect(packed[to + SEGMENT_LAYOUT.startX]).toBeCloseTo((set.data[from] ?? 0) - origin.x, 5);
    expect(packed[to + SEGMENT_LAYOUT.startZ]).toBeCloseTo((set.data[from + 2] ?? 0) - origin.z, 4);
    expect(packed[to + SEGMENT_LAYOUT.endY]).toBeCloseTo(
      (set.data[from + 1] ?? 0) + (set.data[from + 4] ?? 0) * length - origin.y,
      5,
    );
    expect(packed[to + SEGMENT_LAYOUT.radius]).toBeCloseTo(set.data[from + 7] ?? 0, 7);
    expect(packed[to + SEGMENT_LAYOUT.spare]).toBe(0);
  });

  it('converts charge density to microcoulombs per metre and keeps currents in amperes', () => {
    const { set } = source.system;
    const charges = source.system.chargesFor(source.excitation.voltages);
    const currents = source.system.currentsFor(source.excitation.currents);
    const packed = packGpuSegments(source, { x: 0, y: 0, z: 0 });
    let phaseIndex = 0;
    while ((set.groups[phaseIndex] ?? -1) < 0) {
      phaseIndex += 1;
    }
    const to = phaseIndex * GPU_SEGMENT_FLOATS;
    expect(packed[to + SEGMENT_LAYOUT.chargeRe]).toBeCloseTo(
      (charges.re[phaseIndex] ?? 0) * 1e6,
      4,
    );
    expect(packed[to + SEGMENT_LAYOUT.chargeIm]).toBeCloseTo(
      (charges.im[phaseIndex] ?? 0) * 1e6,
      4,
    );
    expect(packed[to + SEGMENT_LAYOUT.currentRe]).toBeCloseTo(currents.re[phaseIndex] ?? 0, 3);
    expect(packed[to + SEGMENT_LAYOUT.currentIm]).toBeCloseTo(currents.im[phaseIndex] ?? 0, 3);
  });

  it('gives shield wires a charge and no current', () => {
    const { set } = source.system;
    const shield = Array.from({ length: set.count }, (_, index) => index).find(
      (index) => (set.groups[index] ?? 0) < 0 && (set.spans[index] ?? -1) >= 0,
    );
    expect(shield).toBeDefined();
    const packed = packGpuSegments(source, { x: 0, y: 0, z: 0 });
    const to = (shield ?? 0) * GPU_SEGMENT_FLOATS;
    expect(packed[to + SEGMENT_LAYOUT.chargeRe]).not.toBe(0);
    expect(packed[to + SEGMENT_LAYOUT.currentRe]).toBe(0);
    expect(packed[to + SEGMENT_LAYOUT.currentIm]).toBe(0);
  });

  it('keeps coordinates small by subtracting the origin in double precision', () => {
    const packed = packGpuSegments(source, { x: 0, y: 0, z: 450 });
    const zValues = Array.from({ length: source.system.set.count }, (_, index) =>
      Math.abs(packed[index * GPU_SEGMENT_FLOATS + SEGMENT_LAYOUT.startZ] ?? 0),
    );
    expect(Math.min(...zValues)).toBeLessThan(30);
  });
});
