import fc from 'fast-check';
import { ELECTRIC_CONSTANT, MAGNETIC_CONSTANT } from '../constants';
import { integrate } from '../testing/quadrature';
import { singleSegmentSet } from '../testing/segments';
import {
  createTerms,
  segmentElectricField,
  segmentElectricFieldWithImage,
  segmentMagneticField,
  segmentPotential,
  segmentPotentialWithImage,
} from './segment-kernel';
import { packSegments, segmentLength, segmentMidpoint } from './segment-set';

const start = { x: 1, y: 8, z: -10 };
const end = { x: 2.5, y: 10, z: 14 };
const radius = 0.02;
const set = singleSegmentSet(start, end, radius);
const terms = createTerms();

function position(t: number) {
  const length = segmentLength(set, 0);
  const fraction = t / length;
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
    z: start.z + (end.z - start.z) * fraction,
  };
}

function numericField(point: { x: number; y: number; z: number }, kind: 'electric' | 'magnetic') {
  const length = segmentLength(set, 0);
  const direction = {
    x: (end.x - start.x) / length,
    y: (end.y - start.y) / length,
    z: (end.z - start.z) / length,
  };
  const component = (axis: 'x' | 'y' | 'z') =>
    integrate(
      (t) => {
        const source = position(t);
        const d = { x: point.x - source.x, y: point.y - source.y, z: point.z - source.z };
        const distance = Math.hypot(d.x, d.y, d.z);
        if (kind === 'electric') {
          return (ELECTRIC_CONSTANT * d[axis]) / distance ** 3;
        }
        const cross = {
          x: direction.y * d.z - direction.z * d.y,
          y: direction.z * d.x - direction.x * d.z,
          z: direction.x * d.y - direction.y * d.x,
        };
        return (MAGNETIC_CONSTANT * cross[axis]) / distance ** 3;
      },
      0,
      length,
    );
  return { x: component('x'), y: component('y'), z: component('z') };
}

const pointsAwayFromSegment = fc.record({
  x: fc.double({ min: -30, max: 30, noNaN: true }),
  y: fc.double({ min: 0.5, max: 40, noNaN: true }),
  z: fc.double({ min: -60, max: 60, noNaN: true }),
});

function distanceToSegment(point: { x: number; y: number; z: number }): number {
  const length = segmentLength(set, 0);
  const ux = (end.x - start.x) / length;
  const uy = (end.y - start.y) / length;
  const uz = (end.z - start.z) / length;
  const sx = point.x - start.x;
  const sy = point.y - start.y;
  const sz = point.z - start.z;
  const along = Math.min(Math.max(sx * ux + sy * uy + sz * uz, 0), length);
  return Math.hypot(sx - along * ux, sy - along * uy, sz - along * uz);
}

describe('finite segment closed forms', () => {
  it('matches Gauss-Legendre quadrature for the potential of a unit density', () => {
    fc.assert(
      fc.property(pointsAwayFromSegment, (point) => {
        fc.pre(distanceToSegment(point) > 0.3);
        const numeric = integrate(
          (t) => {
            const source = position(t);
            return (
              ELECTRIC_CONSTANT /
              Math.hypot(point.x - source.x, point.y - source.y, point.z - source.z)
            );
          },
          0,
          segmentLength(set, 0),
        );
        const closed = segmentPotential(set.data, 0, point.x, point.y, point.z, terms);
        expect(Math.abs(closed - numeric)).toBeLessThan(1e-9 * Math.abs(numeric));
      }),
      { numRuns: 60 },
    );
  });

  it('matches quadrature for the electric field of a unit density', () => {
    fc.assert(
      fc.property(pointsAwayFromSegment, (point) => {
        fc.pre(distanceToSegment(point) > 0.3);
        const numeric = numericField(point, 'electric');
        const closed = new Float64Array(3);
        segmentElectricField(set.data, 0, point.x, point.y, point.z, terms, closed);
        const scale = Math.hypot(numeric.x, numeric.y, numeric.z);
        expect(Math.abs((closed[0] ?? 0) - numeric.x)).toBeLessThan(1e-8 * scale);
        expect(Math.abs((closed[1] ?? 0) - numeric.y)).toBeLessThan(1e-8 * scale);
        expect(Math.abs((closed[2] ?? 0) - numeric.z)).toBeLessThan(1e-8 * scale);
      }),
      { numRuns: 60 },
    );
  });

  it('matches quadrature for the magnetic field of a unit current', () => {
    fc.assert(
      fc.property(pointsAwayFromSegment, (point) => {
        fc.pre(distanceToSegment(point) > 0.3);
        const numeric = numericField(point, 'magnetic');
        const closed = new Float64Array(3);
        segmentMagneticField(set.data, 0, point.x, point.y, point.z, terms, closed);
        const scale = Math.hypot(numeric.x, numeric.y, numeric.z);
        expect(Math.abs((closed[0] ?? 0) - numeric.x)).toBeLessThan(1e-8 * scale);
        expect(Math.abs((closed[1] ?? 0) - numeric.y)).toBeLessThan(1e-8 * scale);
        expect(Math.abs((closed[2] ?? 0) - numeric.z)).toBeLessThan(1e-8 * scale);
      }),
      { numRuns: 60 },
    );
  });

  it('is the potential gradient: a central difference of the potential gives the field', () => {
    const point = { x: 4, y: 6, z: 3 };
    const step = 1e-4;
    const potential = (x: number, y: number, z: number) =>
      segmentPotential(set.data, 0, x, y, z, terms);
    const field = new Float64Array(3);
    segmentElectricField(set.data, 0, point.x, point.y, point.z, terms, field);
    const gradient = [
      (potential(point.x + step, point.y, point.z) - potential(point.x - step, point.y, point.z)) /
        (2 * step),
      (potential(point.x, point.y + step, point.z) - potential(point.x, point.y - step, point.z)) /
        (2 * step),
      (potential(point.x, point.y, point.z + step) - potential(point.x, point.y, point.z - step)) /
        (2 * step),
    ];
    gradient.forEach((value, axis) => {
      const expected = field[axis] ?? 0;
      expect(Math.abs(-value - expected)).toBeLessThan(1e-8 * Math.hypot(...field));
    });
  });
});

describe('the infinite line limit', () => {
  const halfLength = 1e7;
  const long = singleSegmentSet(
    { x: 0, y: 5, z: -halfLength },
    { x: 0, y: 5, z: halfLength },
    0.01,
  );

  it('gives the field of an infinite line charge, 1 over 2 pi epsilon0 rho', () => {
    const out = new Float64Array(3);
    segmentElectricField(long.data, 0, 3, 9, 0, terms, out);
    const rho = Math.hypot(3, 4);
    const expected = (2 * ELECTRIC_CONSTANT) / rho;
    expect(Math.hypot(out[0] ?? 0, out[1] ?? 0)).toBeCloseTo(expected, 3);
    expect((out[0] ?? 0) / (out[1] ?? 1)).toBeCloseTo(3 / 4, 9);
    expect(Math.abs(out[2] ?? 1)).toBeLessThan(1e-9 * expected);
  });

  it('gives mu0 I over 2 pi rho for the magnetic field', () => {
    const out = new Float64Array(3);
    segmentMagneticField(long.data, 0, 10, 5, 0, terms, out);
    expect(Math.hypot(out[0] ?? 0, out[1] ?? 0, out[2] ?? 0)).toBeCloseTo(
      (2 * MAGNETIC_CONSTANT) / 10,
      12,
    );
  });

  it('follows the right hand rule for a current along +z', () => {
    const out = new Float64Array(3);
    segmentMagneticField(long.data, 0, 5, 5, 0, terms, out);
    expect(out[0]).toBeCloseTo(0, 12);
    expect(out[1] ?? 0).toBeGreaterThan(0);
    segmentMagneticField(long.data, 0, 0, 10, 0, terms, out);
    expect(out[0] ?? 0).toBeLessThan(0);
  });
});

describe('the singularity clamp', () => {
  const axis = singleSegmentSet({ x: 0, y: 10, z: -50 }, { x: 0, y: 10, z: 50 }, 0.05);

  it('keeps the field continuous across the conductor radius', () => {
    const outside = new Float64Array(3);
    const inside = new Float64Array(3);
    segmentElectricField(axis.data, 0, 0.05 * (1 + 1e-9), 10, 0, terms, outside);
    segmentElectricField(axis.data, 0, 0.05 * (1 - 1e-9), 10, 0, terms, inside);
    expect(inside[0]).toBeCloseTo(outside[0] ?? 0, 3);
    segmentMagneticField(axis.data, 0, 0.05 * (1 + 1e-9), 10, 0, terms, outside);
    segmentMagneticField(axis.data, 0, 0.05 * (1 - 1e-9), 10, 0, terms, inside);
    expect(inside[1]).toBeCloseTo(outside[1] ?? 0, 12);
  });

  it('shrinks linearly to zero on the axis and stays finite there', () => {
    const half = new Float64Array(3);
    const onAxis = new Float64Array(3);
    const surface = new Float64Array(3);
    segmentElectricField(axis.data, 0, 0.025, 10, 0, terms, half);
    segmentElectricField(axis.data, 0, 0.05, 10, 0, terms, surface);
    segmentElectricField(axis.data, 0, 0, 10, 0, terms, onAxis);
    expect((half[0] ?? 0) / (surface[0] ?? 1)).toBeCloseTo(0.5, 6);
    expect(onAxis.every((value) => Number.isFinite(value))).toBe(true);
    expect(Math.hypot(...onAxis)).toBeLessThan(1e-9);
  });

  it('keeps the potential finite and equal to the surface value inside the radius', () => {
    const surface = segmentPotential(axis.data, 0, 0.05, 10, 0, terms);
    const inside = segmentPotential(axis.data, 0, 0.01, 10, 0, terms);
    expect(Number.isFinite(inside)).toBe(true);
    expect(inside).toBeCloseTo(surface, 9);
  });
});

describe('images in the ground plane', () => {
  const overhead = singleSegmentSet({ x: 2, y: 20, z: -40 }, { x: 6, y: 25, z: 60 }, 0.05);

  it('gives zero potential at the ground', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -80, max: 80, noNaN: true }),
        (x, z) => {
          expect(segmentPotentialWithImage(overhead.data, 0, x, 0, z, terms)).toBeCloseTo(0, 6);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('leaves no tangential electric field at the ground', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -80, max: 80, noNaN: true }),
        (x, z) => {
          const out = new Float64Array(3);
          segmentElectricFieldWithImage(overhead.data, 0, x, 0, z, terms, out);
          const normal = Math.abs(out[1] ?? 0);
          expect(normal).toBeGreaterThan(0);
          expect(Math.abs(out[0] ?? 0)).toBeLessThan(1e-9 * normal);
          expect(Math.abs(out[2] ?? 0)).toBeLessThan(1e-9 * normal);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('adds the image with the opposite sign and a mirrored position', () => {
    const point = { x: 1, y: 3, z: 5 };
    const mirrored = singleSegmentSet({ x: 2, y: -20, z: -40 }, { x: 6, y: -25, z: 60 }, 0.05);
    const direct = segmentPotential(overhead.data, 0, point.x, point.y, point.z, terms);
    const image = segmentPotential(mirrored.data, 0, point.x, point.y, point.z, terms);
    expect(
      segmentPotentialWithImage(overhead.data, 0, point.x, point.y, point.z, terms),
    ).toBeCloseTo(direct - image, 9);
  });
});

describe('segment packing', () => {
  it('stores the start, the unit direction, the length and the radius', () => {
    const packed = singleSegmentSet({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 }, 0.1);
    expect(Array.from(packed.data)).toEqual([0, 0, 0, 0, 0.6, 0.8, 5, 0.1]);
    expect(segmentMidpoint(packed, 0)).toEqual({ x: 0, y: 1.5, z: 2 });
  });

  it('rejects a segment of zero length', () => {
    expect(() => singleSegmentSet({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toThrow('no length');
    expect(packSegments([])).toMatchObject({ count: 0 });
  });
});
