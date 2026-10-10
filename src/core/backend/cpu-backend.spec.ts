import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Complex } from '../complex';
import { createFieldEvaluator3D } from '../field3d/evaluate';
import { solveLine, type LineSolution } from '../field3d/solve-line';
import { groupExcitation } from '../model/excitation';
import { defaultParameters } from '../model/parameters';
import { createCpuBackend, createInlineExecutor } from './cpu-backend';
import { evaluateRange } from './evaluate-range';
import { gridIndex, layoutPointCount } from './layout';
import { defaultGridSpec } from './regions';
import { FIELD_COMPONENTS, type FieldSource, type GridSpec, type PointLayout } from './types';

let solution: LineSolution;
let source: FieldSource;

beforeAll(() => {
  const parameters = defaultParameters('horizontal');
  solution = solveLine(parameters);
  source = { system: solution.system, excitation: groupExcitation(parameters) };
});

function sampleGrid(overrides: Partial<GridSpec>): GridSpec {
  return { ...defaultGridSpec(solution.geometry, { nx: 9, nz: 5 }), ...overrides };
}

describe('range evaluation', () => {
  it('matches the 3D evaluator of the core with the units of the buffer layout', () => {
    const spec = sampleGrid({ zMin: 400, zMax: 500 });
    const layout: PointLayout = { kind: 'grid', spec };
    const values = evaluateRange(source, layout, 0, layoutPointCount(layout));
    const evaluator = createFieldEvaluator3D(
      solution.system,
      source.excitation.voltages,
      source.excitation.currents,
    );
    for (const [ix, iz] of [
      [0, 0],
      [4, 2],
      [8, 4],
    ] as const) {
      const index = gridIndex(spec, ix, iz);
      const point = {
        x: spec.xMin + (ix * (spec.xMax - spec.xMin)) / (spec.nx - 1),
        y: spec.height,
        z: spec.zMin + (iz * (spec.zMax - spec.zMin)) / (spec.nz - 1),
      };
      const reference = evaluator(point);
      const expected = [
        reference.electric.x.re,
        reference.electric.y.re,
        reference.electric.z.re,
        reference.electric.x.im,
        reference.electric.y.im,
        reference.electric.z.im,
        reference.magnetic.x.re * 1e6,
        reference.magnetic.y.re * 1e6,
        reference.magnetic.z.re * 1e6,
        reference.magnetic.x.im * 1e6,
        reference.magnetic.y.im * 1e6,
        reference.magnetic.z.im * 1e6,
      ];
      expected.forEach((value, component) => {
        const actual = values[index * FIELD_COMPONENTS + component] ?? 0;
        expect(actual).toBeCloseTo(
          value,
          Math.max(0, 5 - Math.ceil(Math.log10(Math.abs(value) + 1))),
        );
      });
    }
  });

  it('evaluates a sub range with the same values as the whole range', () => {
    const layout: PointLayout = { kind: 'grid', spec: sampleGrid({}) };
    const whole = evaluateRange(source, layout, 0, 45);
    const part = evaluateRange(source, layout, 18, 27);
    expect(Array.from(part)).toEqual(Array.from(whole.subarray(18 * 12, 27 * 12)));
  });

  it('gives a symmetric grid for a symmetric tower with equal outer phasors', () => {
    const one: Complex = { re: 1000, im: 0 };
    const equal = {
      voltages: [one, { re: 0, im: 0 }, one],
      currents: [
        { re: 100, im: 0 },
        { re: 0, im: 0 },
        { re: 100, im: 0 },
      ],
    };
    const spec = sampleGrid({ zMin: 400, zMax: 500 });
    const layout: PointLayout = { kind: 'grid', spec };
    const values = evaluateRange({ system: source.system, excitation: equal }, layout, 0, 45);
    for (let iz = 0; iz < spec.nz; iz += 1) {
      for (let ix = 0; ix < spec.nx; ix += 1) {
        const left = gridIndex(spec, ix, iz) * FIELD_COMPONENTS;
        const right = gridIndex(spec, spec.nx - 1 - ix, iz) * FIELD_COMPONENTS;
        for (const component of [1, 2, 4, 5, 6, 9]) {
          expect(values[left + component]).toBeCloseTo(values[right + component] ?? 0, 3);
        }
        for (const component of [0, 3, 7, 8, 10, 11]) {
          expect(values[left + component]).toBeCloseTo(-(values[right + component] ?? 0), 3);
        }
      }
    }
  });

  it('is linear in the excitation', () => {
    const layout: PointLayout = { kind: 'grid', spec: sampleGrid({}) };
    fc.assert(
      fc.property(fc.double({ min: 0.25, max: 4, noNaN: true }), (factor) => {
        const scaled = {
          voltages: source.excitation.voltages.map((v) => ({
            re: v.re * factor,
            im: v.im * factor,
          })),
          currents: source.excitation.currents.map((c) => ({
            re: c.re * factor,
            im: c.im * factor,
          })),
        };
        const base = evaluateRange(source, layout, 0, 45);
        const result = evaluateRange({ system: source.system, excitation: scaled }, layout, 0, 45);
        base.forEach((value, index) => {
          const expected = value * factor;
          expect(Math.abs((result[index] ?? 0) - expected)).toBeLessThanOrEqual(
            1e-5 * Math.abs(expected) + 1e-3,
          );
        });
      }),
      { numRuns: 8 },
    );
  });

  it('stays finite on the axis of a conductor', () => {
    const set = solution.system.set;
    const middle = Math.floor(set.count / 2);
    const x = set.data[middle * 8] ?? 0;
    const y = set.data[middle * 8 + 1] ?? 0;
    const z = set.data[middle * 8 + 2] ?? 0;
    const layout: PointLayout = { kind: 'points', coordinates: Float64Array.of(x, y, z + 0.1) };
    const values = evaluateRange(source, layout, 0, 1);
    expect(Array.from(values).every(Number.isFinite)).toBe(true);
  });
});

describe('the CPU backend', () => {
  it('refuses to evaluate before a charge system is loaded', async () => {
    const backend = createCpuBackend(createInlineExecutor());
    await expect(backend.evaluatePoints(Float64Array.of(0, 1, 400))).rejects.toThrow(/load/);
  });

  it('returns the same values as the range evaluation for grids, volumes and points', async () => {
    const backend = createCpuBackend(createInlineExecutor());
    backend.load(source);
    const spec = sampleGrid({});
    const grid = await backend.evaluateGrid(spec);
    expect(grid.pointCount).toBe(45);
    const expectedGrid = evaluateRange(source, { kind: 'grid', spec }, 0, 45);
    expect(Array.from(await grid.read())).toEqual(Array.from(expectedGrid));
    const volume = await backend.evaluateVolume({
      xMin: -10,
      xMax: 10,
      yMin: 1,
      yMax: 5,
      zMin: 440,
      zMax: 460,
      nx: 3,
      ny: 2,
      nz: 2,
    });
    expect(volume.pointCount).toBe(12);
    const points = await backend.evaluatePoints(Float64Array.of(0, 1, 450, 5, 1, 450));
    expect(points.pointCount).toBe(2);
    expect((await points.read()).length).toBe(24);
    points.release();
    backend.dispose();
    await expect(backend.evaluateGrid(spec)).rejects.toThrow(/load/);
  });

  it('reports its kind', () => {
    expect(createCpuBackend(createInlineExecutor()).kind).toBe('cpu');
  });
});
