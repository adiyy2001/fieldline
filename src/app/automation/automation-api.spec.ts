import { describe, expect, it } from 'vitest';
import { createCpuBackend, createInlineExecutor } from '../../core/backend/cpu-backend';
import type { FieldBackend } from '../../core/backend/types';
import type { DeviceResult, ReadyDevice } from '../../gpu/device';
import type { GpuBackendOptions, GpuFieldBackend } from '../../gpu/field-evaluator';
import { handleSolverMessage } from '../../workers/solver-handler';
import { createSolverClient } from '../services/solver-client';
import type { WorkerPort } from '../services/worker-port';
import { defaultParameters } from '../../core/model/parameters';
import { defaultSettings } from '../../core/model/settings';
import { createAutomationApi, type AutomationDependencies } from './automation-api';
import type { AppBridge, AppSnapshot } from './automation-types';

function solverWorker(): WorkerPort {
  const worker: WorkerPort = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => {
      queueMicrotask(() =>
        worker.onmessage?.({ data: handleSolverMessage(message, () => 0) } as MessageEvent),
      );
    },
    terminate: () => undefined,
  };
  return worker;
}

const readyDevice = {
  status: 'ready',
  device: {
    limits: { maxComputeInvocationsPerWorkgroup: 256, maxStorageBufferBindingSize: 1 << 30 },
    queue: { onSubmittedWorkDone: () => Promise.resolve() },
  },
  adapter: {
    vendor: 'test',
    architecture: 'fake',
    device: '',
    description: '',
    software: true,
  },
  timestampQuery: true,
  lost: new Promise(() => undefined),
} as unknown as ReadyDevice;

function cpuBackedGpu(scale: number, options: GpuBackendOptions[] = []) {
  return (_ready: ReadyDevice, requested?: GpuBackendOptions): GpuFieldBackend => {
    if (requested !== undefined) {
      options.push(requested);
    }
    const inner: FieldBackend = createCpuBackend(createInlineExecutor());
    const scaled = async (
      buffer: Promise<
        ReturnType<FieldBackend['evaluateGrid']> extends Promise<infer B> ? B : never
      >,
    ) => {
      const result = await buffer;
      const values = (await result.read()).map((value) => value * scale);
      return {
        pointCount: result.pointCount,
        read: () => Promise.resolve(values),
        release: () => undefined,
      };
    };
    return {
      kind: 'gpu',
      load: (source) => {
        inner.load(source);
      },
      evaluateGrid: (spec) => scaled(inner.evaluateGrid(spec)),
      evaluateVolume: (spec) => scaled(inner.evaluateVolume(spec)),
      evaluatePoints: (coordinates) => scaled(inner.evaluatePoints(coordinates)),
      lastTimings: () => ({
        kernel: 'ground',
        pointCount: 1,
        segmentCount: 1,
        wallMilliseconds: 3,
        gpuMilliseconds: 2,
      }),
      dispose: () => {
        inner.dispose();
      },
    };
  };
}

function dependencies(
  overrides: Partial<AutomationDependencies> = {},
  device: DeviceResult = readyDevice,
): AutomationDependencies {
  return {
    acquireDevice: () => Promise.resolve(device),
    solver: createSolverClient(solverWorker),
    createGpuBackend: cpuBackedGpu(1),
    createCpuExecutor: createInlineExecutor,
    clock: () => performance.now(),
    nextFrame: () => Promise.resolve(),
    ...overrides,
  };
}

const smallGrids = { ground: { nx: 16, nz: 32 }, volume: { nx: 4, ny: 4, nz: 8 } };

describe('the automation API', () => {
  it('reports the adapter, its timestamp support and its limits', async () => {
    const api = createAutomationApi(dependencies());
    await api.ready;
    const adapter = await api.adapter();
    expect(adapter).toMatchObject({
      vendor: 'test',
      software: true,
      timestampQuery: true,
      maxComputeInvocationsPerWorkgroup: 256,
    });
  });

  it('reports no adapter when the device is unsupported', async () => {
    const api = createAutomationApi(
      dependencies({}, { status: 'unsupported', reason: 'no-adapter', detail: 'none' }),
    );
    expect(await api.adapter()).toBeNull();
    await expect(api.runParity({ tower: 'horizontal' })).rejects.toThrow('no-adapter');
  });

  it('compares every scenario and keeps the GPU output for reading', async () => {
    const api = createAutomationApi(dependencies());
    const run = await api.runParity({ tower: 'horizontal', ...smallGrids });
    expect(run.scenarios.map((s) => s.scenario)).toEqual(['ground', 'volume', 'profile', 'clamp']);
    expect(run.segmentCount).toBe(210);
    for (const scenario of run.scenarios) {
      expect(scenario.electric.maximum).toBe(0);
      expect(scenario.finite).toBe(true);
      expect(scenario.gpuKernelMilliseconds).toBe(2);
    }
    expect(run.scenarios[0]?.pointCount).toBe(16 * 32);
    expect(api.readField('ground')?.length).toBe(16 * 32 * 12);
    expect(api.readField('profile')?.length).toBe(241 * 12);
    expect(api.timings()).toHaveLength(4);
  });

  it('reports the error of a perturbed backend with the worst point', async () => {
    const api = createAutomationApi(dependencies({ createGpuBackend: cpuBackedGpu(1.001) }));
    const run = await api.runParity({
      tower: 'delta',
      scenarios: ['profile'],
      ground: smallGrids.ground,
    });
    const profile = run.scenarios[0];
    expect(profile?.electric.maximum).toBeGreaterThan(5e-4);
    expect(profile?.electric.maximum).toBeLessThan(2e-3);
    expect(profile?.worstElectricPoint?.y).toBe(1);
  });

  it('shows that mirrored phasing mirrors the grid', async () => {
    const api = createAutomationApi(dependencies());
    const run = await api.runMirror({ tower: 'double-circuit', ground: smallGrids.ground });
    expect(run.mirroredPhasing).toEqual([3, 4, 5, 0, 1, 2].map((p) => run.phasing[p]));
    expect(run.electric.maximum).toBeLessThan(1e-4);
    expect(run.magnetic.maximum).toBeLessThan(1e-3);
    expect(run.electric.comparedPoints).toBeGreaterThan(0);
  });

  it('times the kernels for every variant and size', async () => {
    const requested: GpuBackendOptions[] = [];
    const api = createAutomationApi(dependencies({ createGpuBackend: cpuBackedGpu(1, requested) }));
    const rows = await api.runKernelBench({
      tower: 'horizontal',
      segmentsPerSpan: [4, 6],
      ground: [{ nx: 8, nz: 16 }],
      volume: [{ nx: 4, ny: 4, nz: 4 }],
      variants: [
        { tiled: true, groundWorkgroup: 8 },
        { tiled: false, groundWorkgroup: 16 },
      ],
      repeats: 2,
    });
    expect(rows).toHaveLength(2 * 2 * 2);
    expect(rows[0]).toMatchObject({
      kernel: 'ground',
      dimensions: [8, 16],
      segmentCount: 5 * (3 * 4 + 6),
      tiled: true,
      workgroup: 8,
      gpuMedianMilliseconds: 2,
      wallMedianMilliseconds: 3,
      samples: 2,
    });
    expect(requested).toContainEqual({ tiled: false, groundWorkgroup: 16 });
  });

  it('checks that the worker pool and the inline evaluation give identical values', async () => {
    const api = createAutomationApi(dependencies());
    const run = await api.runCpuPool({ tower: 'horizontal', grid: { nx: 8, nz: 16 } });
    expect(run.identical).toBe(true);
    expect(run.pointCount).toBe(128);
  });

  it('settles after pending work has finished', async () => {
    let frames = 0;
    const api = createAutomationApi(
      dependencies({
        nextFrame: () => {
          frames += 1;
          return Promise.resolve();
        },
      }),
    );
    const running = api.runParity({ tower: 'horizontal', scenarios: ['profile'] });
    await api.settle();
    expect(frames).toBe(2);
    expect((await running).scenarios).toHaveLength(1);
  });

  describe('with the application connected', () => {
    function fakeApp(overrides: Partial<AppBridge> = {}) {
      const log: string[] = [];
      let parameters = defaultParameters('horizontal');
      let settings = defaultSettings();
      let clockValue = 0;
      const app: AppBridge = {
        setParameters: (patch, options) => {
          parameters = { ...parameters, ...patch };
          log.push(
            `parameters ${JSON.stringify(patch)} interactive=${String(options?.interactive)}`,
          );
        },
        setSettings: (patch) => {
          settings = { ...settings, ...patch };
          log.push(`settings ${JSON.stringify(patch)}`);
        },
        replaceConfiguration: (nextParameters, nextSettings) => {
          parameters = nextParameters;
          settings = nextSettings;
          log.push(`replace ${nextParameters.tower.kind} ${nextSettings.view}`);
        },
        phasingsBestFirst: () => [
          [0, 1, 2, 0, 1, 2],
          [0, 1, 2, 2, 1, 0],
          [0, 2, 1, 0, 2, 1],
          [2, 1, 0, 0, 1, 2],
        ],
        setPhase: (degrees) => {
          settings = { ...settings, phaseDegrees: degrees };
          log.push(`phase ${String(degrees)}`);
        },
        setCamera: () => undefined,
        snapshot: (): AppSnapshot => ({
          status: 'ready',
          backend: 'cpu',
          quality: 'full',
          grid: null,
          maxima: null,
          timings: { solveMilliseconds: 12, evaluateMilliseconds: 30, totalMilliseconds: 43 },
          publishedAt: clockValue + 60,
          parameters,
          settings,
          playing: false,
          probe: { lateral: 0.5, along: 0.5 },
          issues: [],
          message: null,
        }),
        settled: () => Promise.resolve(),
        groundFrame: () => null,
        capture: () => Promise.resolve(null),
        ...overrides,
      };
      return { app, log, tick: (value: number) => (clockValue = value) };
    }

    it('measures a parameter change from the edit to the rendered frame', async () => {
      const { app, log } = fakeApp();
      let now = 0;
      const api = createAutomationApi(
        dependencies({
          app,
          clock: () => {
            now += 30;
            return now;
          },
        }),
      );
      const run = await api.measureUpdate({ patch: { phaseSag: 12 }, interactive: true });
      expect(log).toContain('parameters {"phaseSag":12} interactive=true');
      expect(run).toMatchObject({
        backend: 'cpu',
        quality: 'full',
        solveMilliseconds: 12,
        evaluateMilliseconds: 30,
        pipelineMilliseconds: 43,
      });
      expect(run.endToEndMilliseconds).toBeCloseTo(run.updateMilliseconds + run.renderMilliseconds);
    });

    it('prepares a demo scene, reports its frames and steps through them', async () => {
      const { app, log } = fakeApp();
      const api = createAutomationApi(dependencies({ app }));
      const run = await api.scene('phasing-change');
      expect(run).toMatchObject({ name: 'phasing-change', frameCount: 4 });
      expect(log.find((entry) => entry.startsWith('replace'))).toBe(
        'replace double-circuit ground',
      );
      expect(log).toContain('parameters {"phasing":[2,1,0,0,1,2]} interactive=undefined');
      await api.sceneFrame(3);
      expect(log.at(-1)).toBe('parameters {"phasing":[0,1,2,0,1,2]} interactive=undefined');
    });

    it('steps the field line scene by phase', async () => {
      const { app, log } = fakeApp();
      const api = createAutomationApi(dependencies({ app }));
      const run = await api.scene('lines-cycle');
      expect(run.frameCount).toBe(24);
      await api.sceneFrame(6);
      expect(log.at(-1)).toBe('phase 90');
    });

    it('refuses a frame without a prepared scene or beyond the last one', async () => {
      const { app } = fakeApp();
      const api = createAutomationApi(dependencies({ app }));
      await expect(api.sceneFrame(0)).rejects.toThrow('demo scene frame');
      await api.scene('profile-chart');
      await expect(api.sceneFrame(99)).rejects.toThrow('demo scene frame 99');
    });

    it('destroys the device and waits for the loss report', async () => {
      const { app } = fakeApp();
      let destroyed = false;
      const device = {
        status: 'ready',
        device: {
          limits: { maxComputeInvocationsPerWorkgroup: 256, maxStorageBufferBindingSize: 1 << 30 },
          queue: { onSubmittedWorkDone: () => Promise.resolve() },
          destroy: () => (destroyed = true),
        },
        adapter: {
          vendor: 'test',
          architecture: 'fake',
          device: '',
          description: '',
          software: true,
        },
        timestampQuery: true,
        lost: Promise.resolve({ reason: 'destroyed', message: 'gone' }),
      } as unknown as ReadyDevice;
      const api = createAutomationApi(dependencies({ app }, device));
      await api.loseDevice();
      expect(destroyed).toBe(true);
    });
  });
});
