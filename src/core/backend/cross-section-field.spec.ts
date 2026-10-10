import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../model/parameters';
import { scalarAt, scalarOfVector } from '../heatmap/scalar';
import { solveLine } from '../field3d/solve-line';
import { createFieldEvaluator3D } from '../field3d/evaluate';
import { groupExcitation } from '../model/excitation';
import { resultantRms } from '../phasor';
import { CROSS_SECTION_ROWS, createCrossSectionField } from './cross-section-field';
import { gridIndex } from './layout';
import { defaultGridSpec } from './regions';
import { FIELD_COMPONENTS } from './types';

const selection = { quantity: 'electric' as const, mode: 'rms' as const, phaseRadians: 0 };

describe('cross-section field grid', () => {
  const parameters = defaultParameters();
  const field = createCrossSectionField(parameters);
  const { geometry } = solveLine(parameters);
  const spec = defaultGridSpec(geometry, { nx: 33, nz: CROSS_SECTION_ROWS });
  const values = field.gridValues(spec);

  it('fills nx by nz points in the 12 component layout', () => {
    expect(values).toHaveLength(33 * CROSS_SECTION_ROWS * FIELD_COMPONENTS);
  });

  it('repeats the same row along the line', () => {
    const first = Array.from(values.slice(0, 33 * FIELD_COMPONENTS));
    const second = Array.from(values.slice(33 * FIELD_COMPONENTS));
    expect(second).toEqual(first);
  });

  it('matches the evaluator at the node positions and in kV/m', () => {
    const ix = 17;
    const x = spec.xMin + (ix * (spec.xMax - spec.xMin)) / (spec.nx - 1);
    const expected = resultantRms(field.evaluator({ x, y: spec.height, z: 0 }).electric) / 1000;
    expect(scalarAt(values, gridIndex(spec, ix, 1), selection)).toBeCloseTo(expected, 4);
  });

  it('is symmetric about the centre for a symmetric phasing magnitude', () => {
    const left = scalarAt(values, gridIndex(spec, 5, 0), selection);
    const right = scalarAt(values, gridIndex(spec, 27, 0), selection);
    expect(left).toBeCloseTo(right, 3);
  });

  it('agrees with the 3D model at mid-span within the sag effect', () => {
    const system = solveLine(parameters).system;
    const excitation = groupExcitation(parameters);
    const evaluate3d = createFieldEvaluator3D(system, excitation.voltages, excitation.currents);
    const point = { x: 6, y: 1, z: system.reference.midZ };
    const three = scalarOfVector(evaluate3d(point).electric, selection);
    const two = scalarOfVector(field.evaluator({ ...point, z: 0 }).electric, selection);
    expect(three / two).toBeGreaterThan(0.97);
    expect(three / two).toBeLessThan(1.01);
  });
});
