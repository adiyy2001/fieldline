import { describe, expect, it } from 'vitest';
import type { Point3 } from '../field-types';
import { createClearance } from './clearance';
import { stepLength, traceLine, lineEndCode } from './trace';
import {
  lineEndFromCode,
  type ClearanceField,
  type LineSeed,
  type TraceSettings,
  type VectorField,
} from './types';

const OPEN_CLEARANCE: ClearanceField = () => ({
  minimumDistance: 10,
  minimumClearance: 10,
});

const BIG_BOX: TraceSettings = {
  stepCount: 192,
  box: { min: { x: -100, y: -100, z: -100 }, max: { x: 100, y: 100, z: 100 } },
  groundHeight: -1000,
};

const STRAIGHT_WIRE_B: VectorField = (point) => {
  const rho2 = point.x * point.x + point.y * point.y;
  return { x: -point.y / rho2, y: point.x / rho2, z: 0 };
};

function lineChargeAboveGround(height: number): VectorField {
  return (point) => {
    const dy1 = point.y - height;
    const dy2 = point.y + height;
    const r1 = point.x * point.x + dy1 * dy1;
    const r2 = point.x * point.x + dy2 * dy2;
    return { x: point.x / r1 - point.x / r2, y: dy1 / r1 - dy2 / r2, z: 0 };
  };
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('the float64 field line tracer', () => {
  it('closes a magnetic loop around a straight conductor', () => {
    const radius = 5;
    const seed: LineSeed = {
      kind: 'magnetic',
      origin: { x: radius, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 2 * Math.PI * radius,
    };
    const line = traceLine(seed, STRAIGHT_WIRE_B, OPEN_CLEARANCE, BIG_BOX);
    const last = {
      x: line.positions[3 * line.pointCount - 3] ?? 0,
      y: line.positions[3 * line.pointCount - 2] ?? 0,
      z: line.positions[3 * line.pointCount - 1] ?? 0,
    };
    expect(line.end).toBe('running');
    expect(distance(last, seed.origin)).toBeLessThan(1e-4 * radius);
    for (let index = 0; index < line.pointCount; index += 1) {
      const rho = Math.hypot(line.positions[3 * index] ?? 0, line.positions[3 * index + 1] ?? 0);
      expect(Math.abs(rho - radius)).toBeLessThan(1e-4 * radius);
    }
  });

  it('follows the circular field lines of a line charge above ground down to the ground', () => {
    const height = 30;
    const field = lineChargeAboveGround(height);
    const radius = 0.134;
    const settings: TraceSettings = { ...BIG_BOX, groundHeight: 0 };
    const clearance: ClearanceField = (point) => {
      const distanceToAxis = Math.hypot(point.x, point.y - height);
      return { minimumDistance: distanceToAxis, minimumClearance: distanceToAxis - 1.15 * radius };
    };
    for (let ring = 0; ring < 8; ring += 1) {
      const angle = (2 * Math.PI * ring) / 8;
      if (Math.sin(angle) > -0.1) {
        continue;
      }
      const outward = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
      const seed: LineSeed = {
        kind: 'electric',
        origin: { x: 2 * radius * outward.x, y: height + 2 * radius * outward.y, z: 0 },
        outward,
        arcLength: 0,
      };
      const line = traceLine(seed, field, clearance, settings);
      expect(line.end).toBe('ground');
      const finalIndex = line.pointCount - 1;
      expect(line.positions[3 * finalIndex + 1]).toBeCloseTo(0, 12);
      const footX = line.positions[3 * finalIndex] ?? 0;
      const a = (height * height - footX * footX) / (2 * height);
      expect(Math.abs(a)).toBeLessThan(height * 50);
    }
  });

  it('keeps a traced line on the circle through the charge and its image', () => {
    const height = 30;
    const field = lineChargeAboveGround(height);
    const radius = 0.134;
    const clearance: ClearanceField = (point) => {
      const distanceToAxis = Math.hypot(point.x, point.y - height);
      return { minimumDistance: distanceToAxis, minimumClearance: distanceToAxis - 1.15 * radius };
    };
    for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4]) {
      const outward = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
      const origin = {
        x: 2 * radius * outward.x,
        y: height + 2 * radius * outward.y,
        z: 0,
      };
      const seed: LineSeed = { kind: 'electric', origin, outward, arcLength: 0 };
      const centre = (origin.x ** 2 + origin.y ** 2 - height ** 2) / (2 * origin.x);
      const line = traceLine(seed, field, clearance, { ...BIG_BOX, groundHeight: 0 });
      for (let index = 1; index < line.pointCount; index += 1) {
        const x = line.positions[3 * index] ?? 0;
        const y = line.positions[3 * index + 1] ?? 0;
        const estimate = (x * x + y * y - height * height) / (2 * x);
        expect(Math.abs(estimate - centre) / Math.abs(centre)).toBeLessThan(2e-3);
      }
    }
  });

  it('stops at a conductor and at the edge of the domain', () => {
    const toward: VectorField = () => ({ x: 1, y: 0, z: 0 });
    const blocked: ClearanceField = (point) => ({
      minimumDistance: Math.abs(point.x - 5),
      minimumClearance: Math.abs(point.x - 5) - 1,
    });
    const seed: LineSeed = {
      kind: 'electric',
      origin: { x: 0, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 0,
    };
    expect(traceLine(seed, toward, blocked, BIG_BOX).end).toBe('conductor');
    const small: TraceSettings = {
      ...BIG_BOX,
      box: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
    };
    expect(traceLine(seed, toward, OPEN_CLEARANCE, small).end).toBe('domain');
  });

  it('stalls where the field vanishes', () => {
    const nothing: VectorField = () => ({ x: 0, y: 0, z: 0 });
    const seed: LineSeed = {
      kind: 'electric',
      origin: { x: 0, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 0,
    };
    const line = traceLine(seed, nothing, OPEN_CLEARANCE, BIG_BOX);
    expect(line.end).toBe('stalled');
    expect(line.pointCount).toBe(1);
  });

  it('flips the direction of an electric line when the field points into the conductor', () => {
    const inward: VectorField = () => ({ x: -1, y: 0, z: 0 });
    const seed: LineSeed = {
      kind: 'electric',
      origin: { x: 0, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 0,
    };
    const line = traceLine(seed, inward, OPEN_CLEARANCE, {
      ...BIG_BOX,
      stepCount: 4,
    });
    expect(line.positions[3] ?? 0).toBeGreaterThan(0);
  });

  it('repeats the last point and magnitude after the line has ended', () => {
    const toward: VectorField = (point) => ({ x: 2 + 0 * point.x, y: 0, z: 0 });
    const seed: LineSeed = {
      kind: 'electric',
      origin: { x: 0, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 0,
    };
    const small: TraceSettings = {
      ...BIG_BOX,
      box: { min: { x: -1, y: -1, z: -1 }, max: { x: 3, y: 1, z: 1 } },
    };
    const line = traceLine(seed, toward, OPEN_CLEARANCE, small);
    const last = line.pointCount - 1;
    expect(line.pointCount).toBeLessThan(small.stepCount);
    expect(line.positions[3 * (small.stepCount + 1) - 3]).toBe(line.positions[3 * last]);
    expect(line.magnitudes[small.stepCount]).toBeCloseTo(2, 12);
    expect(line.arcLengths[small.stepCount]).toBe(line.arcLengths[last]);
  });

  it('chooses step lengths from the distance for electric lines and from the arc for magnetic ones', () => {
    const electric: LineSeed = {
      kind: 'electric',
      origin: { x: 0, y: 0, z: 0 },
      outward: { x: 1, y: 0, z: 0 },
      arcLength: 0,
    };
    expect(stepLength(electric, 0.01, 100)).toBeCloseTo(0.05, 12);
    expect(stepLength(electric, 1, 100)).toBeCloseTo(0.4, 12);
    expect(stepLength(electric, 100, 100)).toBeCloseTo(1.5, 12);
    expect(stepLength({ ...electric, kind: 'magnetic', arcLength: 31.4 }, 1, 100)).toBeCloseTo(
      0.314,
      12,
    );
  });

  it('numbers the end reasons and reads them back', () => {
    const ends = ['running', 'ground', 'conductor', 'domain', 'stalled'] as const;
    expect(new Set(ends.map((end) => lineEndCode(end))).size).toBe(5);
    for (const end of ends) {
      expect(lineEndFromCode(lineEndCode(end))).toBe(end);
    }
    expect(lineEndFromCode(99)).toBe('stalled');
  });

  it('measures clearance against finite segments', () => {
    const set = {
      count: 1,
      data: Float64Array.from([0, 10, 0, 0, 0, 1, 100, 0.1]),
      groups: Int32Array.from([0]),
      conductors: Int32Array.from([0]),
      spans: Int32Array.from([0]),
    };
    const clearance = createClearance(set);
    expect(clearance({ x: 3, y: 10, z: 50 }).minimumDistance).toBeCloseTo(3, 12);
    expect(clearance({ x: 0, y: 10, z: 103 }).minimumDistance).toBeCloseTo(3, 12);
    expect(clearance({ x: 0, y: 10, z: 50.05 }).minimumClearance).toBeLessThan(0);
    expect(clearance({ x: 1, y: 10, z: 50 }).minimumClearance).toBeCloseTo(1 - 0.115, 12);
  });
});
