import type { GridSize, VolumeSize } from '../../core/backend/regions';
import type { GridSpec } from '../../core/backend/types';
import type { RmsMaxima } from '../../core/heatmap/scalar';
import type { ViewSettings } from '../../core/model/settings';
import type { Point3 } from '../../core/field-types';
import type { TowerKind } from '../../core/geometry/tower';
import type { LineParameters } from '../../core/model/parameters';
import type { FieldStatus, Probe } from '../state/field-store';
import type { FrameBackend, FrameTimings, Quality } from '../services/field-pipeline';
import type { MirrorDifference, ParityStatistics } from '../../core/validation/parity';
import type { AdapterSummary } from '../../gpu/device';
import type {
  FieldLinesRequest,
  FieldLinesRun,
  IsosurfaceRequest,
  IsosurfaceRun,
  RendererCyclesRequest,
  RendererCyclesRun,
  VolumeImageRequest,
  VolumeImageRun,
} from './scene3d-types';
import type { DemoSceneName } from './demo-scenes';

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

export interface UpdateRequest {
  readonly patch: Partial<LineParameters>;
  readonly interactive?: boolean;
}

export interface UpdateRun {
  readonly backend: FrameBackend | null;
  readonly quality: Quality | null;
  readonly solveMilliseconds: number;
  readonly evaluateMilliseconds: number;
  readonly pipelineMilliseconds: number;
  readonly updateMilliseconds: number;
  readonly renderMilliseconds: number;
  readonly endToEndMilliseconds: number;
}

export interface DemoSceneRun {
  readonly name: DemoSceneName;
  readonly view: ViewSettings['view'];
  readonly frameCount: number;
}

export interface AppSnapshot {
  readonly status: FieldStatus;
  readonly backend: FrameBackend | null;
  readonly quality: Quality | null;
  readonly grid: GridSpec | null;
  readonly maxima: RmsMaxima | null;
  readonly timings: FrameTimings | null;
  readonly publishedAt: number | null;
  readonly parameters: LineParameters;
  readonly settings: ViewSettings;
  readonly playing: boolean;
  readonly probe: Probe;
  readonly issues: readonly string[];
  readonly message: string | null;
}

export interface GroundFrame {
  readonly grid: GridSpec;
  readonly values: Float32Array;
}

export interface FrameCaptureRequest {
  readonly width?: number;
  readonly height?: number;
}

export interface FrameCapture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface CameraRequest {
  readonly view: 'volume' | 'isosurface' | 'lines';
  readonly yaw?: number;
  readonly pitch?: number;
  readonly distance?: number;
}

export interface AppBridge {
  setParameters(patch: Partial<LineParameters>, options?: { interactive?: boolean }): void;
  setSettings(patch: Partial<ViewSettings>): void;
  replaceConfiguration(parameters: LineParameters, settings: ViewSettings): void;
  phasingsBestFirst(): readonly (readonly number[])[] | null;
  setPhase(degrees: number): void;
  setCamera(request: CameraRequest): void;
  snapshot(): AppSnapshot;
  settled(): Promise<void>;
  groundFrame(): GroundFrame | null;
  capture(request: { width: number; height: number }): Promise<FrameCapture | null>;
}

export interface FieldlineAutomation {
  readonly ready: Promise<void>;
  adapter(): Promise<AdapterReport | null>;
  settle(): Promise<void>;
  timings(): readonly ScenarioTiming[];
  readField(kind: FieldKind): Float32Array | null;
  appState(): AppSnapshot | null;
  groundFrame(): GroundFrame | null;
  setParameters(patch: Partial<LineParameters>): Promise<void>;
  setSettings(patch: Partial<ViewSettings>): Promise<void>;
  setView(view: ViewSettings['view']): Promise<void>;
  setPhase(degrees: number): Promise<void>;
  setCamera(request: CameraRequest): Promise<void>;
  captureFrame(request?: FrameCaptureRequest): Promise<FrameCapture | null>;
  measureUpdate(request: UpdateRequest): Promise<UpdateRun>;
  scene(name: DemoSceneName): Promise<DemoSceneRun>;
  sceneFrame(index: number): Promise<void>;
  loseDevice(): Promise<void>;
  runRendererCycles(request: RendererCyclesRequest): Promise<RendererCyclesRun>;
  runParity(request: ParityRequest): Promise<ParityRun>;
  runMirror(request: MirrorRequest): Promise<MirrorRun>;
  runKernelBench(request: KernelBenchRequest): Promise<readonly KernelBenchRow[]>;
  runCpuPool(request: CpuPoolRequest): Promise<CpuPoolRun>;
  runIsosurface(request: IsosurfaceRequest): Promise<IsosurfaceRun>;
  runVolumeImage(request: VolumeImageRequest): Promise<VolumeImageRun>;
  runFieldLines(request: FieldLinesRequest): Promise<FieldLinesRun>;
}

export interface ScenarioTiming {
  readonly scenario: string;
  readonly gpuKernelMilliseconds: number | null;
  readonly gpuWallMilliseconds: number;
  readonly cpuMilliseconds: number;
}
