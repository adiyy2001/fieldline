import type { Point3 } from '../field-types';
import {
  type ClearanceField,
  LINE_END_CODES,
  type LineEnd,
  type LineSeed,
  TRACE_CONSTANTS,
  type TraceSettings,
  type TracedLine,
  type VectorField,
} from './types';

function add(a: Point3, b: Point3, factor: number): Point3 {
  return { x: a.x + factor * b.x, y: a.y + factor * b.y, z: a.z + factor * b.z };
}

function length(vector: Point3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function insideBox(point: Point3, settings: TraceSettings): boolean {
  const { min, max } = settings.box;
  return (
    point.x >= min.x &&
    point.x <= max.x &&
    point.y >= min.y &&
    point.y <= max.y &&
    point.z >= min.z &&
    point.z <= max.z
  );
}

export function stepLength(seed: LineSeed, minimumDistance: number, stepCount: number): number {
  return seed.kind === 'electric'
    ? clamp(
        TRACE_CONSTANTS.stepFraction * minimumDistance,
        TRACE_CONSTANTS.minimumStep,
        TRACE_CONSTANTS.maximumStep,
      )
    : seed.arcLength / stepCount;
}

export function traceLine(
  seed: LineSeed,
  field: VectorField,
  clearance: ClearanceField,
  settings: TraceSettings,
): TracedLine {
  const { stepCount } = settings;
  const positions = new Float64Array((stepCount + 1) * 3);
  const arcLengths = new Float64Array(stepCount + 1);
  const magnitudes = new Float64Array(stepCount + 1);
  const initial = field(seed.origin);
  const direction =
    seed.kind === 'electric'
      ? initial.x * seed.outward.x + initial.y * seed.outward.y + initial.z * seed.outward.z >= 0
        ? 1
        : -1
      : 1;
  const normalize = (vector: Point3): Point3 => {
    const magnitude = length(vector);
    return magnitude < TRACE_CONSTANTS.vanishingField
      ? { x: 0, y: 0, z: 0 }
      : {
          x: (direction * vector.x) / magnitude,
          y: (direction * vector.y) / magnitude,
          z: (direction * vector.z) / magnitude,
        };
  };
  const unitField = (point: Point3): Point3 => normalize(field(point));
  let point = seed.origin;
  let arc = 0;
  let recorded = 1;
  let end: LineEnd = 'running';
  const record = (index: number, at: Point3, magnitude: number) => {
    positions[3 * index] = at.x;
    positions[3 * index + 1] = at.y;
    positions[3 * index + 2] = at.z;
    arcLengths[index] = arc;
    magnitudes[index] = magnitude;
  };
  record(0, point, length(initial));
  for (let step = 0; step < stepCount && end === 'running'; step += 1) {
    const near = clearance(point);
    if (near.minimumClearance < 0) {
      end = 'conductor';
      break;
    }
    const h = stepLength(seed, near.minimumDistance, stepCount);
    const raw = field(point);
    magnitudes[recorded - 1] = length(raw);
    const k1 = normalize(raw);
    if (length(k1) === 0) {
      end = 'stalled';
      break;
    }
    const k2 = unitField(add(point, k1, h / 2));
    const k3 = unitField(add(point, k2, h / 2));
    const k4 = unitField(add(point, k3, h));
    let next: Point3 = {
      x: point.x + (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: point.y + (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
      z: point.z + (h / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
    };
    let travelled = Math.hypot(next.x - point.x, next.y - point.y, next.z - point.z);
    if (seed.kind === 'electric' && next.y <= settings.groundHeight) {
      const fraction = (point.y - settings.groundHeight) / (point.y - next.y);
      next = {
        x: point.x + fraction * (next.x - point.x),
        y: settings.groundHeight,
        z: point.z + fraction * (next.z - point.z),
      };
      travelled *= fraction;
      end = 'ground';
    } else if (!insideBox(next, settings)) {
      end = 'domain';
      break;
    }
    arc += travelled;
    point = next;
    record(recorded, point, magnitudes[recorded - 1] ?? 0);
    recorded += 1;
  }
  for (let index = recorded; index <= stepCount; index += 1) {
    record(index, point, magnitudes[recorded - 1] ?? 0);
  }
  return { kind: seed.kind, positions, arcLengths, magnitudes, pointCount: recorded, end };
}

export function lineEndCode(end: LineEnd): number {
  return LINE_END_CODES[end];
}
