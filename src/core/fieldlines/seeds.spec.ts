import { describe, expect, it } from 'vitest';
import { distanceToSegment } from './clearance';
import { solveLine } from '../field3d/solve-line';
import { defaultParameters } from '../model/parameters';
import { perpendicularBasis, placeSeeds } from './seeds';

describe('field line seeds', () => {
  const { system } = solveLine(defaultParameters('horizontal'));

  it('builds an orthonormal basis perpendicular to any tangent', () => {
    for (const tangent of [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0.6, y: 0, z: 0.8 },
    ]) {
      const [first, second] = perpendicularBasis(tangent);
      const dot = (a: typeof first, b: typeof first) => a.x * b.x + a.y * b.y + a.z * b.z;
      expect(dot(first, tangent)).toBeCloseTo(0, 12);
      expect(dot(second, tangent)).toBeCloseTo(0, 12);
      expect(dot(first, second)).toBeCloseTo(0, 12);
      expect(dot(first, first)).toBeCloseTo(1, 12);
    }
  });

  it('places electric seeds on rings around the phase conductors of the reference span', () => {
    const seeds = placeSeeds(system.set, system.reference, { kind: 'electric', lineCount: 48 });
    expect(seeds.length).toBeGreaterThan(30);
    expect(seeds.length).toBeLessThanOrEqual(48);
    const { set, reference } = system;
    for (const seed of seeds) {
      expect(seed.kind).toBe('electric');
      const nearest = Math.min(
        ...Array.from({ length: set.count }, (_, index) =>
          (set.groups[index] ?? -1) >= 0 && (set.spans[index] ?? -1) === reference.index
            ? distanceToSegment(set, index, seed.origin)
            : Infinity,
        ),
      );
      const conductorRadius = set.data[set.groups.findIndex((group) => group >= 0) * 8 + 7] ?? 0;
      expect(nearest).toBeCloseTo(2 * conductorRadius, 2);
      expect(seed.origin.z).toBeGreaterThan(reference.startZ);
      expect(seed.origin.z).toBeLessThan(reference.startZ + reference.length);
      expect(Math.hypot(seed.outward.x, seed.outward.y, seed.outward.z)).toBeCloseTo(1, 12);
    }
  });

  it('spreads the seeds over every phase conductor', () => {
    const seeds = placeSeeds(system.set, system.reference, { kind: 'electric', lineCount: 48 });
    const columns = new Set(seeds.map((seed) => Math.round(seed.origin.x / 5)));
    expect(columns.size).toBeGreaterThanOrEqual(3);
  });

  it('places magnetic seeds at fixed distances with an arc length of one circumference', () => {
    const seeds = placeSeeds(system.set, system.reference, { kind: 'magnetic', lineCount: 36 });
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.kind).toBe('magnetic');
      const radius = seed.arcLength / (2 * Math.PI);
      expect([2, 4, 7].some((candidate) => Math.abs(candidate - radius) < 1e-9)).toBe(true);
    }
  });

  it('is deterministic and respects the line count', () => {
    const first = placeSeeds(system.set, system.reference, { kind: 'electric', lineCount: 16 });
    const second = placeSeeds(system.set, system.reference, { kind: 'electric', lineCount: 16 });
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(16);
  });

  it('returns nothing when no phase conductor crosses the reference span', () => {
    const empty = {
      ...system.set,
      groups: new Int32Array(system.set.count).fill(-1),
    };
    expect(placeSeeds(empty, system.reference, { kind: 'electric' })).toEqual([]);
  });
});
