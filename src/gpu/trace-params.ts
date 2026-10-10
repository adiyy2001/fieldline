import type { FieldQuantity } from '../core/exposure/levels';
import type { LineSeed, TraceBox } from '../core/fieldlines/types';
import { displayScale } from '../core/heatmap/scalar';
import type { Point3 } from '../core/field-types';

export const TRACE_PARAMS_BYTES = 64;
export const DRAW_PARAMS_BYTES = 112;
export const SEED_FLOATS = 8;
export const POINT_FLOATS = 4;
export const INFO_WORDS = 2;
export const DASH_LENGTH_METRES = 6;
export const FLOW_METRES_PER_SECOND = 18;
export const LINE_PIXEL_WIDTH = 2.2;

export interface TraceUniforms {
  readonly box: TraceBox;
  readonly groundHeight: number;
  readonly phaseRadians: number;
  readonly quantity: FieldQuantity;
  readonly segmentCount: number;
  readonly stepCount: number;
  readonly lineCount: number;
}

export function packTraceParams(uniforms: TraceUniforms): ArrayBuffer {
  const buffer = new ArrayBuffer(TRACE_PARAMS_BYTES);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  floats.set(
    [uniforms.box.min.x, uniforms.box.min.y, uniforms.box.min.z, uniforms.groundHeight],
    0,
  );
  floats.set([uniforms.box.max.x, uniforms.box.max.y, uniforms.box.max.z, 0], 4);
  floats.set(
    [
      Math.cos(uniforms.phaseRadians),
      Math.sin(uniforms.phaseRadians),
      displayScale(uniforms.quantity),
      0,
    ],
    8,
  );
  words.set(
    [
      uniforms.segmentCount,
      uniforms.stepCount,
      uniforms.lineCount,
      uniforms.quantity === 'electric' ? 0 : 1,
    ],
    12,
  );
  return buffer;
}

export function packSeeds(seeds: readonly LineSeed[]): Float32Array {
  const packed = new Float32Array(Math.max(1, seeds.length) * SEED_FLOATS);
  seeds.forEach((seed, index) => {
    packed.set(
      [
        seed.origin.x,
        seed.origin.y,
        seed.origin.z,
        seed.arcLength,
        seed.outward.x,
        seed.outward.y,
        seed.outward.z,
        0,
      ],
      index * SEED_FLOATS,
    );
  });
  return packed;
}

export interface DrawUniforms {
  readonly viewProjection: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly seconds: number;
  readonly maximum: number;
  readonly lineCount: number;
  readonly stepCount: number;
  readonly lineWidth?: number;
}

export function packLineDrawParams(uniforms: DrawUniforms): ArrayBuffer {
  const buffer = new ArrayBuffer(DRAW_PARAMS_BYTES);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  floats.set(uniforms.viewProjection, 0);
  floats.set(
    [uniforms.width, uniforms.height, uniforms.seconds, uniforms.lineWidth ?? LINE_PIXEL_WIDTH],
    16,
  );
  floats.set([uniforms.maximum, DASH_LENGTH_METRES, FLOW_METRES_PER_SECOND, 0], 20);
  words.set([uniforms.lineCount, uniforms.stepCount, 0, 0], 24);
  return buffer;
}

export interface TracedBuffers {
  readonly points: Float32Array;
  readonly magnitudes: Float32Array;
  readonly info: Uint32Array;
  readonly lineCount: number;
  readonly stepCount: number;
}

export interface ReadLine {
  readonly pointCount: number;
  readonly end: number;
  readonly positions: Float32Array;
  readonly arcLengths: Float32Array;
  readonly magnitudes: Float32Array;
}

export function splitTracedLines(traced: TracedBuffers): readonly ReadLine[] {
  const stride = traced.stepCount + 1;
  return Array.from({ length: traced.lineCount }, (_, line): ReadLine => {
    const positions = new Float32Array(stride * 3);
    const arcLengths = new Float32Array(stride);
    const magnitudes = new Float32Array(stride);
    for (let index = 0; index < stride; index += 1) {
      const from = (line * stride + index) * POINT_FLOATS;
      positions.set(traced.points.subarray(from, from + 3), index * 3);
      arcLengths[index] = traced.points[from + 3] ?? 0;
      magnitudes[index] = traced.magnitudes[line * stride + index] ?? 0;
    }
    return {
      pointCount: traced.info[line * INFO_WORDS] ?? 0,
      end: traced.info[line * INFO_WORDS + 1] ?? 0,
      positions,
      arcLengths,
      magnitudes,
    };
  });
}

export function pointOf(line: ReadLine, index: number): Point3 {
  return {
    x: line.positions[index * 3] ?? 0,
    y: line.positions[index * 3 + 1] ?? 0,
    z: line.positions[index * 3 + 2] ?? 0,
  };
}
