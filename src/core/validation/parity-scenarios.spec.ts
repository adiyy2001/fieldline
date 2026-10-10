import { beforeAll, describe, expect, it } from 'vitest';
import type { ChargeSystem } from '../field3d/charge-system';
import { solveLine } from '../field3d/solve-line';
import { defaultParameters } from '../model/parameters';
import { CLAMP_RADIUS_MULTIPLES, clampProbe, profilePoints } from './parity-scenarios';

let system: ChargeSystem;

beforeAll(() => {
  system = solveLine(defaultParameters('horizontal')).system;
});

describe('parity scenarios', () => {
  it('samples the profile at mid-span and 1 m height from -60 to 60 m in half metres', () => {
    const points = profilePoints(450);
    expect(points.length / 3).toBe(241);
    expect(Array.from(points.slice(0, 3))).toEqual([-60, 1, 450]);
    expect(Array.from(points.slice(-3))).toEqual([60, 1, 450]);
  });

  it('places probe points from the axis of a mid-span conductor to 100 radii away', () => {
    const probe = clampProbe(system);
    expect(probe.radius).toBeCloseTo(0.134, 3);
    expect(probe.coordinates.length / 3).toBe(CLAMP_RADIUS_MULTIPLES.length * 2);
    const onAxis = probe.coordinates.slice(0, 3);
    expect(Math.abs((onAxis[2] ?? 0) - 450)).toBeLessThanOrEqual(12.5);
    const offsetX = (probe.coordinates[3 * 2 * 4] ?? 0) - (onAxis[0] ?? 0);
    expect(offsetX).toBeCloseTo(probe.radius, 12);
  });

  it('rejects a system with no phase conductor in the reference span', () => {
    const empty = { ...system, set: { ...system.set, groups: system.set.groups.map(() => -1) } };
    expect(() => clampProbe(empty)).toThrow(RangeError);
  });
});
