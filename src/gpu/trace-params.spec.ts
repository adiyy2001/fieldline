import { describe, expect, it } from 'vitest';
import {
  DASH_LENGTH_METRES,
  DRAW_PARAMS_BYTES,
  FLOW_METRES_PER_SECOND,
  SEED_FLOATS,
  TRACE_PARAMS_BYTES,
  packLineDrawParams,
  packSeeds,
  packTraceParams,
  pointOf,
  splitTracedLines,
} from './trace-params';

describe('field line parameters', () => {
  it('lays the trace uniform out as the shader reads it', () => {
    const buffer = packTraceParams({
      box: { min: { x: -50, y: 0, z: -20 }, max: { x: 50, y: 60, z: 320 } },
      groundHeight: 0,
      phaseRadians: Math.PI / 2,
      quantity: 'magnetic',
      segmentCount: 77,
      stepCount: 192,
      lineCount: 128,
    });
    expect(buffer.byteLength).toBe(TRACE_PARAMS_BYTES);
    const floats = Array.from(new Float32Array(buffer));
    expect(floats.slice(0, 8)).toEqual([-50, 0, -20, 0, 50, 60, 320, 0]);
    expect(floats[8]).toBeCloseTo(0, 6);
    expect(floats[9]).toBeCloseTo(1, 6);
    expect(floats[10]).toBe(1);
    expect(Array.from(new Uint32Array(buffer).slice(12, 16))).toEqual([77, 192, 128, 1]);
  });

  it('selects the electric kernel branch and the kilovolt scale for the electric field', () => {
    const buffer = packTraceParams({
      box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      groundHeight: 0,
      phaseRadians: 0,
      quantity: 'electric',
      segmentCount: 1,
      stepCount: 1,
      lineCount: 1,
    });
    expect(new Uint32Array(buffer)[15]).toBe(0);
    expect(new Float32Array(buffer)[10]).toBeCloseTo(0.001, 9);
  });

  it('packs the seed origin, arc length and outward direction', () => {
    const packed = packSeeds([
      {
        kind: 'magnetic',
        origin: { x: 1, y: 2, z: 3 },
        outward: { x: 0, y: 1, z: 0 },
        arcLength: 12,
      },
    ]);
    expect(packed).toHaveLength(SEED_FLOATS);
    expect(Array.from(packed)).toEqual([1, 2, 3, 12, 0, 1, 0, 0]);
    expect(packSeeds([])).toHaveLength(SEED_FLOATS);
  });

  it('lays the draw uniform out with the time, speed and counts', () => {
    const matrix = Float32Array.from({ length: 16 }, (_, index) => index);
    const buffer = packLineDrawParams({
      viewProjection: matrix,
      width: 800,
      height: 450,
      seconds: 1.5,
      maximum: 20,
      lineCount: 128,
      stepCount: 192,
    });
    expect(buffer.byteLength).toBe(DRAW_PARAMS_BYTES);
    const floats = Array.from(new Float32Array(buffer));
    expect(floats.slice(16, 19)).toEqual([800, 450, 1.5]);
    expect(floats.slice(20, 23)).toEqual([20, DASH_LENGTH_METRES, FLOW_METRES_PER_SECOND]);
    expect(Array.from(new Uint32Array(buffer).slice(24, 26))).toEqual([128, 192]);
  });

  it('splits the read back buffers into one record per line', () => {
    const points = new Float32Array([
      0, 1, 2, 0, 1, 2, 3, 5, 9, 9, 9, 7, 7, 7, 7, 7, 0, 0, 0, 0, 4, 4, 4, 4,
    ]);
    const lines = splitTracedLines({
      points,
      magnitudes: Float32Array.of(1, 2, 3, 4, 5, 6),
      info: Uint32Array.of(2, 1, 3, 4),
      lineCount: 2,
      stepCount: 2,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]?.pointCount).toBe(2);
    expect(lines[0]?.end).toBe(1);
    expect(pointOf(lines[0] ?? emptyLine(), 1)).toEqual({ x: 1, y: 2, z: 3 });
    expect(Array.from(lines[0]?.arcLengths ?? [])).toEqual([0, 5, 7]);
    expect(Array.from(lines[1]?.magnitudes ?? [])).toEqual([4, 5, 6]);
  });
});

function emptyLine() {
  return {
    pointCount: 0,
    end: 0,
    positions: new Float32Array(0),
    arcLengths: new Float32Array(0),
    magnitudes: new Float32Array(0),
  };
}
