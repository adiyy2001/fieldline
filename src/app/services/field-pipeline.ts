import {
  createCrossSectionField,
  CROSS_SECTION_ROWS,
} from '../../core/backend/cross-section-field';
import {
  CPU_DRAFT_GRID_SIZE,
  CPU_GRID_SIZE,
  DRAFT_GRID_SIZE,
  GPU_GRID_SIZE,
  type GridSize,
  defaultGridSpec,
} from '../../core/backend/regions';
import type { FieldBackend, FieldBuffer, GridSpec } from '../../core/backend/types';
import type { FieldEvaluator } from '../../core/field-types';
import { type RmsMaxima, rmsMaxima } from '../../core/heatmap/scalar';
import { createFieldEvaluator3D } from '../../core/field3d/evaluate';
import type { LineGeometry } from '../../core/geometry/line-geometry';
import { groupExcitation } from '../../core/model/excitation';
import {
  type ValidationIssue,
  lineGeometryFromParameters,
  validateParameters,
} from '../../core/model/parameters';
import type { Configuration } from '../../core/model/settings';
import { DEFAULT_PROFILE_SPEC, type Profile, sampleProfile } from '../../core/profile/sampler';
import { referenceSpan } from '../../core/geometry/discretize';
import { SolveFailure, type SolverClient } from './solver-client';

export type Quality = 'draft' | 'full';
export type FrameBackend = 'gpu' | 'cpu' | 'cross-section';

export interface FrameTimings {
  readonly solveMilliseconds: number;
  readonly evaluateMilliseconds: number;
  readonly totalMilliseconds: number;
}

export interface FieldFrame {
  readonly generation: number;
  readonly quality: Quality;
  readonly model: Configuration['settings']['model'];
  readonly backend: FrameBackend;
  readonly grid: GridSpec;
  readonly source: GPUBuffer | Float32Array;
  readonly values: Float32Array;
  readonly maxima: RmsMaxima;
  readonly evaluator: FieldEvaluator;
  readonly profile: Profile;
  readonly geometry: LineGeometry;
  readonly referenceMidZ: number;
  readonly timings: FrameTimings;
  release(): void;
}

export type PipelineOutcome =
  | { readonly status: 'frame'; readonly frame: FieldFrame }
  | { readonly status: 'stale' }
  | { readonly status: 'invalid'; readonly issues: readonly ValidationIssue[] }
  | { readonly status: 'failed'; readonly message: string };

export interface PipelineRequest {
  readonly configuration: Configuration;
  readonly quality: Quality;
}

export interface BackendSource {
  get(): Promise<FieldBackend>;
  demote(reason: string): void;
}

export interface PipelineDependencies {
  readonly solver: SolverClient;
  readonly backends: BackendSource;
  readonly clock: () => number;
}

export interface FieldPipeline {
  run(request: PipelineRequest): Promise<PipelineOutcome>;
}

export const DRAFT_PROFILE_STEP = 1;

export function gridSizeFor(kind: 'gpu' | 'cpu', quality: Quality): GridSize {
  if (kind === 'gpu') {
    return quality === 'draft' ? DRAFT_GRID_SIZE : GPU_GRID_SIZE;
  }
  return quality === 'draft' ? CPU_DRAFT_GRID_SIZE : CPU_GRID_SIZE;
}

function hasDeviceBuffer(buffer: FieldBuffer): buffer is FieldBuffer & { buffer: GPUBuffer } {
  return 'buffer' in buffer;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function profileFor(
  evaluator: FieldEvaluator,
  quality: Quality,
  height: number,
  z: number,
): Profile {
  const step = quality === 'draft' ? DRAFT_PROFILE_STEP : DEFAULT_PROFILE_SPEC.step;
  return sampleProfile(evaluator, { ...DEFAULT_PROFILE_SPEC, step, height, z });
}

export function createFieldPipeline(dependencies: PipelineDependencies): FieldPipeline {
  const { solver, backends, clock } = dependencies;
  let latest = 0;

  async function crossSectionFrame(
    request: PipelineRequest,
    generation: number,
    started: number,
  ): Promise<PipelineOutcome> {
    const { parameters, settings } = request.configuration;
    const backend = await backends.get();
    const geometry = lineGeometryFromParameters(parameters);
    const field = createCrossSectionField(parameters);
    const size = { ...gridSizeFor(backend.kind, 'full'), nz: CROSS_SECTION_ROWS };
    const grid: GridSpec = {
      ...defaultGridSpec(geometry, size),
      height: settings.evaluationHeight,
    };
    const evaluateStarted = clock();
    const values = field.gridValues(grid);
    const reference = referenceSpan(geometry);
    const now = clock();
    return {
      status: 'frame',
      frame: {
        generation,
        quality: request.quality,
        model: settings.model,
        backend: 'cross-section',
        grid,
        source: values,
        values,
        maxima: rmsMaxima(values),
        evaluator: field.evaluator,
        profile: profileFor(field.evaluator, request.quality, settings.evaluationHeight, 0),
        geometry,
        referenceMidZ: reference.midZ,
        timings: {
          solveMilliseconds: 0,
          evaluateMilliseconds: now - evaluateStarted,
          totalMilliseconds: now - started,
        },
        release: () => undefined,
      },
    };
  }

  async function chargeFrame(
    request: PipelineRequest,
    generation: number,
    started: number,
  ): Promise<PipelineOutcome> {
    const { parameters, settings } = request.configuration;
    const solved = await solver.solve(parameters, { draft: request.quality === 'draft' });
    if (generation !== latest) {
      return { status: 'stale' };
    }
    const solveMilliseconds = clock() - started;
    const excitation = groupExcitation(parameters);
    const backend = await backends.get();
    const geometry = lineGeometryFromParameters(parameters);
    const grid: GridSpec = {
      ...defaultGridSpec(geometry, gridSizeFor(backend.kind, request.quality)),
      height: settings.evaluationHeight,
    };
    backend.load({ system: solved.system, excitation });
    const evaluateStarted = clock();
    const buffer = await backend.evaluateGrid(grid);
    if (generation !== latest) {
      buffer.release();
      return { status: 'stale' };
    }
    const values = await buffer.read();
    if (generation !== latest) {
      buffer.release();
      return { status: 'stale' };
    }
    const source = hasDeviceBuffer(buffer) ? buffer.buffer : values;
    const evaluator = createFieldEvaluator3D(
      solved.system,
      excitation.voltages,
      excitation.currents,
    );
    const midZ = solved.system.reference.midZ;
    const now = clock();
    return {
      status: 'frame',
      frame: {
        generation,
        quality: request.quality,
        model: settings.model,
        backend: backend.kind,
        grid,
        source,
        values,
        maxima: rmsMaxima(values),
        evaluator,
        profile: profileFor(evaluator, request.quality, settings.evaluationHeight, midZ),
        geometry,
        referenceMidZ: midZ,
        timings: {
          solveMilliseconds,
          evaluateMilliseconds: now - evaluateStarted,
          totalMilliseconds: now - started,
        },
        release: () => {
          buffer.release();
        },
      },
    };
  }

  async function attempt(
    request: PipelineRequest,
    generation: number,
    started: number,
  ): Promise<PipelineOutcome> {
    return request.configuration.settings.model === 'cross-section-2d'
      ? crossSectionFrame(request, generation, started)
      : chargeFrame(request, generation, started);
  }

  return {
    async run(request): Promise<PipelineOutcome> {
      latest += 1;
      const generation = latest;
      const issues = validateParameters(request.configuration.parameters);
      if (issues.length > 0) {
        return { status: 'invalid', issues };
      }
      const started = clock();
      try {
        return await attempt(request, generation, started);
      } catch (error) {
        if (error instanceof SolveFailure) {
          return { status: 'invalid', issues: error.issues };
        }
        const backend = await backends.get();
        if (backend.kind !== 'gpu' || generation !== latest) {
          return generation === latest
            ? { status: 'failed', message: describeError(error) }
            : { status: 'stale' };
        }
        backends.demote(describeError(error));
        try {
          return await attempt(request, generation, started);
        } catch (retryError) {
          return generation === latest
            ? { status: 'failed', message: describeError(retryError) }
            : { status: 'stale' };
        }
      }
    },
  };
}
