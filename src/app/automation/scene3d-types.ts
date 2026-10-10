import type { VolumeSize } from '../../core/backend/regions';
import type { TowerKind } from '../../core/geometry/tower';
import type { LineKind } from '../../core/fieldlines/types';
import type { Point3 } from '../../core/field-types';
import type { MeshComparison } from '../../core/validation/scene3d-parity';

export interface IsosurfaceRequest {
  readonly source: 'sphere' | 'line';
  readonly tower?: TowerKind;
  readonly size?: VolumeSize;
  readonly levels?: readonly number[];
}

export interface IsosurfaceLevelRun extends MeshComparison {
  readonly level: number;
  readonly gpuArea: number;
  readonly cpuArea: number;
  readonly analyticArea: number | null;
  readonly produced: number;
  readonly capacity: number;
}

export interface IsosurfaceRun {
  readonly source: IsosurfaceRequest['source'];
  readonly dimensions: readonly number[];
  readonly peak: number;
  readonly levels: readonly IsosurfaceLevelRun[];
  readonly extractMilliseconds: number;
}

export interface VolumeImageRequest {
  readonly width?: number;
  readonly height?: number;
  readonly yaw?: number;
  readonly pitch?: number;
}

export interface VolumeImageRun {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly mirrorDifference: number;
  readonly centre: readonly number[];
  readonly expectedCentre: readonly number[];
  readonly corner: readonly number[];
  readonly background: readonly number[];
}

export interface FieldLinesRequest {
  readonly tower: TowerKind;
  readonly kind: LineKind;
  readonly lineCount?: number;
  readonly stepCount?: number;
  readonly phaseDegrees?: number;
}

export interface FieldLineRun {
  readonly start: Point3;
  readonly gpuEnd: number;
  readonly cpuEnd: number;
  readonly endDistance: number;
  readonly endFraction: number;
  readonly gpuPointCount: number;
  readonly cpuPointCount: number;
  readonly startClearance: number;
  readonly startsDownward: boolean;
  readonly gpuClosure: number;
  readonly cpuClosure: number;
  readonly arcLength: number;
}

export interface FieldLinesRun {
  readonly kind: LineKind;
  readonly domainSize: number;
  readonly lines: readonly FieldLineRun[];
  readonly traceMilliseconds: number;
}

export interface SceneImageRequest {
  readonly view: 'volume' | 'isosurface' | 'lines';
  readonly width?: number;
  readonly height?: number;
}
