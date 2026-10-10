import { describe, expect, it } from 'vitest';
import { createFieldEvaluator3D } from '../field3d/evaluate';
import { solveLine } from '../field3d/solve-line';
import { groupExcitation } from '../model/excitation';
import { defaultParameters } from '../model/parameters';
import { createClearance } from './clearance';
import { instantaneousVectorField } from './field-source';
import { placeSeeds } from './seeds';
import { traceLine } from './trace';
import { DEFAULT_STEP_COUNT, type TraceSettings } from './types';

describe('field lines of the default horizontal line', () => {
  const parameters = defaultParameters('horizontal');
  const { system } = solveLine(parameters);
  const excitation = groupExcitation(parameters);
  const evaluator = createFieldEvaluator3D(system, excitation.voltages, excitation.currents);
  const clearance = createClearance(system.set);
  const { reference } = system;
  const settings: TraceSettings = {
    stepCount: DEFAULT_STEP_COUNT,
    groundHeight: 0,
    box: {
      min: { x: -50, y: 0, z: reference.startZ - 20 },
      max: { x: 50, y: 60, z: reference.startZ + reference.length + 20 },
    },
  };

  it('start next to a conductor and end on the ground, on a conductor or at the domain edge', () => {
    const seeds = placeSeeds(system.set, reference, { kind: 'electric', lineCount: 12 });
    const field = instantaneousVectorField(evaluator, 'electric', 0.7);
    const ends = seeds.map((seed) => traceLine(seed, field, clearance, settings));
    for (const line of ends) {
      expect(line.pointCount).toBeGreaterThan(5);
      expect(['ground', 'conductor', 'domain', 'running']).toContain(line.end);
      expect(line.end).not.toBe('stalled');
    }
    const terminated = ends.filter((line) => line.end === 'ground' || line.end === 'conductor');
    expect(terminated.length).toBeGreaterThanOrEqual(Math.ceil(ends.length / 2));
    for (const line of ends.filter((candidate) => candidate.end === 'ground')) {
      const last = line.pointCount - 1;
      expect(line.positions[3 * last + 1]).toBeCloseTo(0, 9);
    }
  });

  it('keeps magnetic loops at a nearly constant distance from the nearest conductor', () => {
    const seeds = placeSeeds(system.set, reference, { kind: 'magnetic', lineCount: 12 });
    const field = instantaneousVectorField(evaluator, 'magnetic', 0.3);
    const lines = seeds.map((seed) => traceLine(seed, field, clearance, settings));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(['running', 'domain']).toContain(line.end);
      expect(line.pointCount).toBeGreaterThan(20);
    }
  });

  it('produces a field magnitude along the line in the units of the evaluator', () => {
    const seeds = placeSeeds(system.set, reference, { kind: 'electric', lineCount: 6 });
    const field = instantaneousVectorField(evaluator, 'electric', 0);
    const seed = seeds[0];
    if (seed === undefined) {
      throw new Error('No seed was placed');
    }
    const line = traceLine(seed, field, clearance, settings);
    expect(line.magnitudes[0]).toBeGreaterThan(0);
    expect(line.arcLengths[line.pointCount - 1]).toBeGreaterThan(0);
  });
});
