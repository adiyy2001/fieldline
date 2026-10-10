import type { Point3 } from '../field-types';
import {
  type ConductorGeometry,
  type LineGeometry,
  SHIELD_GROUP,
  conductorHeightAt,
} from './line-geometry';

export interface Segment {
  readonly start: Point3;
  readonly end: Point3;
  readonly radius: number;
  readonly conductor: number;
  readonly group: number;
  readonly spanIndex: number;
}

export interface DiscretizationOptions {
  readonly segmentsPerSpan: number;
  readonly runOuts: boolean;
}

export interface ReferenceSpan {
  readonly index: number;
  readonly startZ: number;
  readonly length: number;
  readonly midZ: number;
}

export const RUN_OUT_SPAN_FACTORS: readonly number[] = [0.5, 1, 2];
export const RUN_OUT_SPAN_INDEX = -1;

export function defaultDiscretization(segmentsPerSpan: number): DiscretizationOptions {
  return { segmentsPerSpan, runOuts: true };
}

export function towerPositions(geometry: LineGeometry): readonly number[] {
  const positions = [0];
  for (const span of geometry.spans) {
    positions.push((positions[positions.length - 1] ?? 0) + span.length);
  }
  return positions;
}

export function referenceSpan(geometry: LineGeometry): ReferenceSpan {
  const index = Math.floor((geometry.spans.length - 1) / 2);
  const span = geometry.spans[index];
  if (span === undefined) {
    throw new RangeError('The line has no spans');
  }
  const startZ = towerPositions(geometry)[index] ?? 0;
  return { index, startZ, length: span.length, midZ: startZ + span.length / 2 };
}

function segmentBetween(
  conductor: ConductorGeometry,
  conductorIndex: number,
  start: Point3,
  end: Point3,
  spanIndex: number,
): Segment {
  return {
    start,
    end,
    radius: conductor.equivalentRadius,
    conductor: conductorIndex,
    group: conductor.role === 'phase' ? conductor.index : SHIELD_GROUP,
    spanIndex,
  };
}

function spanSegments(
  geometry: LineGeometry,
  conductor: ConductorGeometry,
  conductorIndex: number,
  spanIndex: number,
  options: DiscretizationOptions,
): readonly Segment[] {
  const span = geometry.spans[spanIndex];
  if (span === undefined) {
    throw new RangeError(`The line has no span ${spanIndex}`);
  }
  const startZ = towerPositions(geometry)[spanIndex] ?? 0;
  const pointAt = (step: number): Point3 => {
    const local = (span.length * step) / options.segmentsPerSpan;
    return { x: conductor.x, y: conductorHeightAt(conductor, span, local), z: startZ + local };
  };
  return Array.from({ length: options.segmentsPerSpan }, (_, step) =>
    segmentBetween(conductor, conductorIndex, pointAt(step), pointAt(step + 1), spanIndex),
  );
}

function runOutSegments(
  geometry: LineGeometry,
  conductor: ConductorGeometry,
  conductorIndex: number,
  side: 'before' | 'after',
): readonly Segment[] {
  const adjacent =
    side === 'before' ? geometry.spans[0] : geometry.spans[geometry.spans.length - 1];
  const towerZ = side === 'before' ? 0 : (towerPositions(geometry).at(-1) ?? 0);
  if (adjacent === undefined) {
    throw new RangeError('The line has no spans');
  }
  const direction = side === 'before' ? -1 : 1;
  const boundaries = [0];
  for (const factor of RUN_OUT_SPAN_FACTORS) {
    boundaries.push((boundaries.at(-1) ?? 0) + factor * adjacent.length);
  }
  const point = (offset: number): Point3 => ({
    x: conductor.x,
    y: conductor.attachmentHeight,
    z: towerZ + direction * offset,
  });
  const nearToFar = RUN_OUT_SPAN_FACTORS.map((_, index) =>
    segmentBetween(
      conductor,
      conductorIndex,
      point(boundaries[index] ?? 0),
      point(boundaries[index + 1] ?? 0),
      RUN_OUT_SPAN_INDEX,
    ),
  );
  if (side === 'after') {
    return nearToFar;
  }
  return nearToFar
    .map((segment) => ({ ...segment, start: segment.end, end: segment.start }))
    .reverse();
}

export function discretizeConductor(
  geometry: LineGeometry,
  conductorIndex: number,
  options: DiscretizationOptions,
): readonly Segment[] {
  const conductor = geometry.conductors[conductorIndex];
  if (conductor === undefined) {
    throw new RangeError(`The line has no conductor ${conductorIndex}`);
  }
  const inSpans = geometry.spans.flatMap((_, spanIndex) =>
    spanSegments(geometry, conductor, conductorIndex, spanIndex, options),
  );
  if (!options.runOuts) {
    return inSpans;
  }
  return [
    ...runOutSegments(geometry, conductor, conductorIndex, 'before'),
    ...inSpans,
    ...runOutSegments(geometry, conductor, conductorIndex, 'after'),
  ];
}

export function discretizeLine(
  geometry: LineGeometry,
  options: DiscretizationOptions,
): readonly Segment[] {
  if (!Number.isInteger(options.segmentsPerSpan) || options.segmentsPerSpan < 1) {
    throw new RangeError('The number of segments per span must be a positive integer');
  }
  return geometry.conductors.flatMap((_, index) => discretizeConductor(geometry, index, options));
}
