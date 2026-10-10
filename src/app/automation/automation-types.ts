import type { GridSize, VolumeSize } from '../../core/backend/regions';
import type { Point3 } from '../../core/field-types';
import type { TowerKind } from '../../core/geometry/tower';
import type { LineParameters } from '../../core/model/parameters';
import type { MirrorDifference, ParityStatistics } from '../../core/validation/parity';
import type { AdapterSummary } from '../../gpu/device';

export type ParityScenario = 'ground' | 'volume' | 'profile' | 'clamp';
export type FieldKind = 'ground' | 'volume' | 'profile' | 'clamp';

export interface ParityRequest {
  readonly tower: TowerKind;
  readonly overrides?: Partial<LineParameters>;
  readonly scenarios?: readonly ParityScenario[];
  readonly ground?: GridSize;
  readonly volume?: VolumeSize;
}

export interface ScenarioParity {
  readonly scenario: ParityScenario;
  readonly pointCount: number;
  readonly electric: ParityStatistics;
  readonly magnetic: ParityStatistics;
  readonly finite: boolean;
  readonly worstElectricPoint: Point3 | null;
  readonly worstMagneticPoint: Point3 | null;
  readonly gpuKernelMilliseconds: number | null;
  readonly gpuWallMilliseconds: number;
  readonly cpuMilliseconds: number;
}

export interface ParityRun {
  readonly tower: TowerKind;
  readonly segmentCount: number;
  readonly solveMilliseconds: number;
  readonly scenarios: readonly ScenarioParity[];
}

export interface MirrorRequest {
  readonly tower: TowerKind;
  readonly ground?: GridSize;
}

export interface MirrorRun {
  readonly tower: TowerKind;
  readonly phasing: readonly number[];
  readonly mirroredPhasing: readonly number[];
  readonly electric: MirrorDifference;
  readonly magnetic: MirrorDifference;
}

export interface KernelVariant {
  readonly tiled: boolean;
  readonly groundWorkgroup: number;
}

export interface KernelBenchRequest {
  readonly tower: TowerKind;
  readonly segmentsPerSpan: readonly number[];
  readonly ground: readonly GridSize[];
  readonly volume: readonly VolumeSize[];
  readonly variants: readonly KernelVariant[];
  readonly repeats: number;
}

export interface KernelBenchRow {
  readonly kernel: 'ground' | 'volume';
  readonly dimensions: readonly number[];
  readonly pointCount: number;
  readonly segmentCount: number;
  readonly tiled: boolean;
  readonly workgroup: number;
  readonly gpuMedianMilliseconds: number | null;
  readonly wallMedianMilliseconds: number;
  readonly samples: number;
}

export interface CpuPoolRequest {
  readonly tower: TowerKind;
  readonly grid?: GridSize;
}

export interface CpuPoolRun {
  readonly pointCount: number;
  readonly poolMilliseconds: number;
  readonly inlineMilliseconds: number;
  readonly identical: boolean;
  readonly electric: ParityStatistics;
}

export interface AdapterReport extends AdapterSummary {
  readonly timestampQuery: boolean;
  readonly maxComputeInvocationsPerWorkgroup: number;
  readonly maxStorageBufferBindingSize: number;
}

export interface FieldlineAutomation {
  readonly ready: Promise<void>;
  adapter(): Promise<AdapterReport | null>;
  settle(): Promise<void>;
  timings(): readonly ScenarioTiming[];
  readField(kind: FieldKind): Float32Array | null;
  runParity(request: ParityRequest): Promise<ParityRun>;
  runMirror(request: MirrorRequest): Promise<MirrorRun>;
  runKernelBench(request: KernelBenchRequest): Promise<readonly KernelBenchRow[]>;
  runCpuPool(request: CpuPoolRequest): Promise<CpuPoolRun>;
}

export interface ScenarioTiming {
  readonly scenario: string;
  readonly gpuKernelMilliseconds: number | null;
  readonly gpuWallMilliseconds: number;
  readonly cpuMilliseconds: number;
}
