import {
  createCpuBackend,
  createInlineExecutor,
  type CpuExecutor,
} from '../../core/backend/cpu-backend';
import { layoutPointCount, pointAt } from '../../core/backend/layout';
import { CPU_GRID_SIZE, defaultGridSpec, defaultVolumeSpec } from '../../core/backend/regions';
import type { FieldBackend, FieldSource, PointLayout } from '../../core/backend/types';
import type { Point3 } from '../../core/field-types';
import { mirrorPhasing } from '../../core/geometry/tower';
import { groupExcitation } from '../../core/model/excitation';
import {
  defaultParameters,
  lineGeometryFromParameters,
  type LineParameters,
} from '../../core/model/parameters';
import {
  ELECTRIC_COMPONENTS,
  MAGNETIC_COMPONENTS,
  compareFields,
  mirrorDifference,
} from '../../core/validation/parity';
import { clampProbe, profilePoints } from '../../core/validation/parity-scenarios';
import type { DeviceResult, ReadyDevice } from '../../gpu/device';
import type { GpuBackendOptions, GpuFieldBackend } from '../../gpu/field-evaluator';
import type { SolverClient } from '../services/solver-client';
import type {
  AdapterReport,
  AppBridge,
  CpuPoolRequest,
  CpuPoolRun,
  FieldKind,
  FieldlineAutomation,
  KernelBenchRequest,
  KernelBenchRow,
  MirrorRequest,
  MirrorRun,
  ParityRequest,
  ParityRun,
  ParityScenario,
  ScenarioParity,
  ScenarioTiming,
} from './automation-types';

export interface AutomationDependencies {
  readonly acquireDevice: () => Promise<DeviceResult>;
  readonly solver: SolverClient;
  readonly createGpuBackend: (ready: ReadyDevice, options?: GpuBackendOptions) => GpuFieldBackend;
  readonly createCpuExecutor: () => CpuExecutor;
  readonly clock: () => number;
  readonly nextFrame: () => Promise<void>;
  readonly app?: AppBridge;
}

const ALL_SCENARIOS: readonly ParityScenario[] = ['ground', 'volume', 'profile', 'clamp'];
const PARITY_GROUND_SIZE = { nx: 256, nz: 512 };
const PARITY_VOLUME_SIZE = { nx: 32, ny: 32, nz: 64 };

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function worstPoint(layout: PointLayout, index: number): Point3 | null {
  return index < 0 ? null : pointAt(layout, index);
}

export function createAutomationApi(dependencies: AutomationDependencies): FieldlineAutomation {
  const { solver, clock } = dependencies;
  const pending = new Set<Promise<unknown>>();
  const fields = new Map<FieldKind, Float32Array>();
  const recorded: ScenarioTiming[] = [];
  let deviceResult: Promise<DeviceResult> | null = null;

  function device(): Promise<DeviceResult> {
    deviceResult ??= dependencies.acquireDevice();
    return deviceResult;
  }

  function track<T>(work: Promise<T>): Promise<T> {
    pending.add(work);
    const forget = () => {
      pending.delete(work);
    };
    work.then(forget, forget);
    return work;
  }

  async function readyDevice(): Promise<ReadyDevice> {
    const result = await device();
    if (result.status !== 'ready') {
      throw new Error(`No WebGPU device: ${result.reason}, ${result.detail}`);
    }
    return result;
  }

  async function prepare(
    tower: ParityRequest['tower'],
    overrides: Partial<LineParameters> | undefined,
  ) {
    const parameters = { ...defaultParameters(tower), ...overrides };
    const started = clock();
    const { system } = await solver.solve(parameters);
    const solveMilliseconds = clock() - started;
    const source: FieldSource = { system, excitation: groupExcitation(parameters) };
    return { parameters, source, solveMilliseconds };
  }

  function layoutFor(
    scenario: ParityScenario,
    source: FieldSource,
    request: ParityRequest,
    parameters: LineParameters,
  ): PointLayout {
    const geometry = lineGeometryFromParameters(parameters);
    switch (scenario) {
      case 'ground':
        return {
          kind: 'grid',
          spec: defaultGridSpec(geometry, request.ground ?? PARITY_GROUND_SIZE),
        };
      case 'volume':
        return {
          kind: 'volume',
          spec: defaultVolumeSpec(
            geometry,
            source.system.reference.index,
            request.volume ?? PARITY_VOLUME_SIZE,
          ),
        };
      case 'profile':
        return { kind: 'points', coordinates: profilePoints(source.system.reference.midZ) };
      case 'clamp':
        return { kind: 'points', coordinates: clampProbe(source.system).coordinates };
    }
  }

  async function evaluateOn(backend: FieldBackend, layout: PointLayout) {
    const started = clock();
    const buffer =
      layout.kind === 'grid'
        ? await backend.evaluateGrid(layout.spec)
        : layout.kind === 'volume'
          ? await backend.evaluateVolume(layout.spec)
          : await backend.evaluatePoints(layout.coordinates);
    const values = await buffer.read();
    buffer.release();
    return { values, milliseconds: clock() - started };
  }

  async function runParity(request: ParityRequest): Promise<ParityRun> {
    const ready = await readyDevice();
    const { parameters, source, solveMilliseconds } = await prepare(
      request.tower,
      request.overrides,
    );
    const gpu = dependencies.createGpuBackend(ready);
    const cpuExecutor = dependencies.createCpuExecutor();
    const cpu = createCpuBackend(cpuExecutor);
    gpu.load(source);
    cpu.load(source);
    try {
      const scenarios: ScenarioParity[] = [];
      for (const scenario of request.scenarios ?? ALL_SCENARIOS) {
        const layout = layoutFor(scenario, source, request, parameters);
        const fromGpu = await evaluateOn(gpu, layout);
        const timings = gpu.lastTimings();
        const fromCpu = await evaluateOn(cpu, layout);
        const report = compareFields(fromCpu.values, fromGpu.values);
        fields.set(scenario, fromGpu.values);
        const gpuWallMilliseconds = timings?.wallMilliseconds ?? fromGpu.milliseconds;
        const gpuKernelMilliseconds = timings?.gpuMilliseconds ?? null;
        recorded.push({
          scenario,
          gpuKernelMilliseconds,
          gpuWallMilliseconds,
          cpuMilliseconds: fromCpu.milliseconds,
        });
        scenarios.push({
          scenario,
          pointCount: layoutPointCount(layout),
          electric: report.electric,
          magnetic: report.magnetic,
          finite: report.finite,
          worstElectricPoint: worstPoint(layout, report.electric.worstIndex),
          worstMagneticPoint: worstPoint(layout, report.magnetic.worstIndex),
          gpuKernelMilliseconds,
          gpuWallMilliseconds,
          cpuMilliseconds: fromCpu.milliseconds,
        });
      }
      return {
        tower: request.tower,
        segmentCount: source.system.set.count,
        solveMilliseconds,
        scenarios,
      };
    } finally {
      gpu.dispose();
      cpu.dispose();
    }
  }

  async function runMirror(request: MirrorRequest): Promise<MirrorRun> {
    const ready = await readyDevice();
    const base = defaultParameters(request.tower);
    const mirrored = mirrorPhasing(request.tower, base.phasing);
    const gpu = dependencies.createGpuBackend(ready);
    try {
      const grids: Float32Array[] = [];
      let columns = 0;
      for (const phasing of [base.phasing, mirrored]) {
        const parameters = { ...base, phasing };
        const { system } = await solver.solve(parameters);
        gpu.load({ system, excitation: groupExcitation(parameters) });
        const spec = defaultGridSpec(
          lineGeometryFromParameters(parameters),
          request.ground ?? PARITY_GROUND_SIZE,
        );
        columns = spec.nx;
        grids.push((await evaluateOn(gpu, { kind: 'grid', spec })).values);
      }
      const [original, flipped] = grids;
      if (original === undefined || flipped === undefined) {
        throw new Error('The mirror run produced no grids');
      }
      return {
        tower: request.tower,
        phasing: base.phasing,
        mirroredPhasing: mirrored,
        electric: mirrorDifference(original, flipped, columns, ELECTRIC_COMPONENTS),
        magnetic: mirrorDifference(original, flipped, columns, MAGNETIC_COMPONENTS),
      };
    } finally {
      gpu.dispose();
    }
  }

  async function runKernelBench(request: KernelBenchRequest): Promise<readonly KernelBenchRow[]> {
    const ready = await readyDevice();
    const rows: KernelBenchRow[] = [];
    for (const segmentsPerSpan of request.segmentsPerSpan) {
      const { source } = await prepare(request.tower, { segmentsPerSpan });
      const geometry = lineGeometryFromParameters({
        ...defaultParameters(request.tower),
        segmentsPerSpan,
      });
      for (const variant of request.variants) {
        const gpu = dependencies.createGpuBackend(ready, {
          tiled: variant.tiled,
          groundWorkgroup: variant.groundWorkgroup,
        });
        gpu.load(source);
        try {
          const layouts: readonly PointLayout[] = [
            ...request.ground.map((size): PointLayout => ({
              kind: 'grid',
              spec: defaultGridSpec(geometry, size),
            })),
            ...request.volume.map((size): PointLayout => ({
              kind: 'volume',
              spec: defaultVolumeSpec(geometry, source.system.reference.index, size),
            })),
          ];
          for (const layout of layouts) {
            await evaluateOn(gpu, layout);
            const kernel: number[] = [];
            const wall: number[] = [];
            for (let repeat = 0; repeat < request.repeats; repeat += 1) {
              await evaluateOn(gpu, layout);
              const timings = gpu.lastTimings();
              wall.push(timings?.wallMilliseconds ?? 0);
              if (timings?.gpuMilliseconds !== null && timings?.gpuMilliseconds !== undefined) {
                kernel.push(timings.gpuMilliseconds);
              }
            }
            rows.push({
              kernel: layout.kind === 'grid' ? 'ground' : 'volume',
              dimensions:
                layout.kind === 'grid'
                  ? [layout.spec.nx, layout.spec.nz]
                  : layout.kind === 'volume'
                    ? [layout.spec.nx, layout.spec.ny, layout.spec.nz]
                    : [],
              pointCount: layoutPointCount(layout),
              segmentCount: source.system.set.count,
              tiled: variant.tiled,
              workgroup: variant.groundWorkgroup,
              gpuMedianMilliseconds: kernel.length > 0 ? median(kernel) : null,
              wallMedianMilliseconds: median(wall),
              samples: request.repeats,
            });
          }
        } finally {
          gpu.dispose();
        }
      }
    }
    return rows;
  }

  async function runCpuPool(request: CpuPoolRequest): Promise<CpuPoolRun> {
    const { parameters, source } = await prepare(request.tower, undefined);
    const spec = defaultGridSpec(
      lineGeometryFromParameters(parameters),
      request.grid ?? CPU_GRID_SIZE,
    );
    const layout: PointLayout = { kind: 'grid', spec };
    const pool = createCpuBackend(dependencies.createCpuExecutor());
    const inline = createCpuBackend(createInlineExecutor());
    pool.load(source);
    inline.load(source);
    try {
      const fromPool = await evaluateOn(pool, layout);
      const fromInline = await evaluateOn(inline, layout);
      const report = compareFields(fromInline.values, fromPool.values);
      return {
        pointCount: layoutPointCount(layout),
        poolMilliseconds: fromPool.milliseconds,
        inlineMilliseconds: fromInline.milliseconds,
        identical: fromPool.values.every((value, index) => value === fromInline.values[index]),
        electric: report.electric,
      };
    } finally {
      pool.dispose();
      inline.dispose();
    }
  }

  async function adapter(): Promise<AdapterReport | null> {
    const result = await device();
    if (result.status !== 'ready') {
      return null;
    }
    return {
      ...result.adapter,
      timestampQuery: result.timestampQuery,
      maxComputeInvocationsPerWorkgroup: result.device.limits.maxComputeInvocationsPerWorkgroup,
      maxStorageBufferBindingSize: result.device.limits.maxStorageBufferBindingSize,
    };
  }

  const DEFAULT_CAPTURE_WIDTH = 256;
  const DEFAULT_CAPTURE_HEIGHT = 96;

  function bridge(): AppBridge {
    if (dependencies.app === undefined) {
      throw new Error('The application is not connected to the automation hook');
    }
    return dependencies.app;
  }

  async function settle(): Promise<void> {
    await dependencies.app?.settled();
    while (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }
    const result = await device();
    if (result.status === 'ready') {
      await result.device.queue.onSubmittedWorkDone();
    }
    await dependencies.nextFrame();
    await dependencies.nextFrame();
  }

  return {
    ready: device().then(() => undefined),
    adapter: () => track(adapter()),
    settle,
    timings: () => [...recorded],
    readField: (kind) =>
      fields.get(kind) ??
      (kind === 'ground' ? (dependencies.app?.groundFrame()?.values ?? null) : null),
    appState: () => dependencies.app?.snapshot() ?? null,
    groundFrame: () => dependencies.app?.groundFrame() ?? null,
    setParameters: async (patch) => {
      bridge().setParameters(patch);
      await settle();
    },
    setSettings: async (patch) => {
      bridge().setSettings(patch);
      await settle();
    },
    setView: async (view) => {
      bridge().setSettings({ view });
      await settle();
    },
    setPhase: async (degrees) => {
      bridge().setPhase(degrees);
      await settle();
    },
    captureFrame: async (request) => {
      await settle();
      return bridge().capture({
        width: request?.width ?? DEFAULT_CAPTURE_WIDTH,
        height: request?.height ?? DEFAULT_CAPTURE_HEIGHT,
      });
    },
    runParity: (request) => track(runParity(request)),
    runMirror: (request) => track(runMirror(request)),
    runKernelBench: (request) => track(runKernelBench(request)),
    runCpuPool: (request) => track(runCpuPool(request)),
  };
}
