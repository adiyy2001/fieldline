import {
  bundleCircleRadius,
  defaultBundleRotationDegrees,
  equivalentRadius,
  subconductorPositions,
} from './bundle';

const published = { count: 3, spacing: 0.4, subconductorDiameter: 0.0302 };

describe('bundles', () => {
  it('gives the equivalent radius of three 30.2 mm subconductors at 0.4 m', () => {
    expect(equivalentRadius(published)).toBeCloseTo(0.1342, 4);
  });

  it('returns the subconductor radius for a single conductor', () => {
    expect(equivalentRadius({ count: 1, spacing: 0, subconductorDiameter: 0.03 })).toBe(0.015);
    expect(bundleCircleRadius(1, 0.4)).toBe(0);
  });

  it('matches the closed form for two subconductors', () => {
    const bundle = { count: 2, spacing: 0.4, subconductorDiameter: 0.03 };
    expect(equivalentRadius(bundle)).toBeCloseTo(Math.sqrt(0.015 * 0.4), 12);
  });

  it('places subconductors on a circle with the requested spacing', () => {
    const positions = subconductorPositions({ x: 5, y: 20 }, published);
    expect(positions).toHaveLength(3);
    const [first, second] = positions;
    expect(
      Math.hypot((first?.x ?? 0) - (second?.x ?? 0), (first?.y ?? 0) - (second?.y ?? 0)),
    ).toBeCloseTo(0.4, 12);
    positions.forEach((position) => {
      expect(Math.hypot(position.x - 5, position.y - 20)).toBeCloseTo(
        bundleCircleRadius(3, 0.4),
        12,
      );
    });
  });

  it('turns the triangle with its apex down for a rotation of -90 degrees', () => {
    const positions = subconductorPositions({ x: 0, y: 10 }, published, -90);
    const lowest = Math.min(...positions.map((position) => position.y));
    expect(lowest).toBeCloseTo(10 - bundleCircleRadius(3, 0.4), 12);
    const apex = positions.find((position) => position.y === lowest);
    expect(apex?.x).toBeCloseTo(0, 12);
  });

  it('keeps a single conductor at the centre and picks default rotations', () => {
    expect(
      subconductorPositions({ x: 1, y: 2 }, { count: 1, spacing: 0, subconductorDiameter: 0.03 }),
    ).toEqual([{ x: 1, y: 2 }]);
    expect([2, 3, 4].map(defaultBundleRotationDegrees)).toEqual([0, 90, 45]);
  });
});
