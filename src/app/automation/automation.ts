import { Injectable, inject } from '@angular/core';
import { arrangementPhasing } from '../../core/optimizer/arrangements';
import { rankArrangements } from '../../core/optimizer/ranking';
import { createGpuFieldBackend } from '../../gpu/field-evaluator';
import { OptimizerData } from '../optimizer/optimizer-data';
import { CPU_EXECUTOR_FACTORY, SOLVER_CLIENT } from '../services/tokens';
import { GpuStatus } from '../services/gpu-status';
import { HeatmapCapture } from '../services/heatmap-capture';
import { Scene3dState } from '../scene3d/scene3d-state';
import { FieldStore } from '../state/field-store';
import { createAutomationApi } from './automation-api';
import type { AppBridge, FieldlineAutomation } from './automation-types';

export const AUTOMATION_QUERY_PARAMETER = 'automation';

declare global {
  interface Window {
    fieldline?: FieldlineAutomation;
  }
}

const SETTLE_POLL_MILLISECONDS = 8;
const SETTLE_TIMEOUT_MILLISECONDS = 120_000;

export async function waitForSettled(
  condition: () => boolean,
  timeoutMilliseconds = SETTLE_TIMEOUT_MILLISECONDS,
): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error('The application did not settle in time');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, SETTLE_POLL_MILLISECONDS));
  }
}

export type AutomationHost = Pick<Window, 'fieldline'>;

export function isAutomationRequested(search: string): boolean {
  return new URLSearchParams(search).has(AUTOMATION_QUERY_PARAMETER);
}

export function installAutomation(
  host: AutomationHost,
  search: string,
  create: () => FieldlineAutomation,
): boolean {
  if (!isAutomationRequested(search) || host.fieldline !== undefined) {
    return false;
  }
  host.fieldline = create();
  return true;
}

@Injectable({ providedIn: 'root' })
export class Automation {
  private readonly gpu = inject(GpuStatus);
  private readonly store = inject(FieldStore);
  private readonly capture = inject(HeatmapCapture);
  private readonly scene = inject(Scene3dState);
  private readonly optimizer = inject(OptimizerData);
  private readonly solver = inject(SOLVER_CLIENT);
  private readonly cpuExecutor = inject(CPU_EXECUTOR_FACTORY);

  private bridge(): AppBridge {
    const store = this.store;
    return {
      setParameters: (patch, options) => {
        store.setParameters(patch, options);
      },
      replaceConfiguration: (parameters, settings) => {
        store.setPlaying(false);
        store.replaceConfiguration(parameters, settings);
      },
      phasingsBestFirst: () => {
        const results = this.optimizer.results();
        return results.length === 0
          ? null
          : rankArrangements(results, this.optimizer.criterion()).map((ranked) =>
              arrangementPhasing(ranked.result.arrangement),
            );
      },
      setSettings: (patch) => {
        store.setSettings(patch);
      },
      setPhase: (degrees) => {
        store.setPlaying(false);
        store.setPhase(degrees);
      },
      setCamera: (request) => {
        this.scene.setOrbit(request.view, request);
      },
      settled: () => waitForSettled(() => store.status() !== 'solving'),
      snapshot: () => {
        const frame = store.frame();
        return {
          status: store.status(),
          backend: frame?.backend ?? null,
          quality: frame?.quality ?? null,
          grid: frame?.grid ?? null,
          maxima: frame?.maxima ?? null,
          timings: frame?.timings ?? null,
          publishedAt: store.publishedAt(),
          parameters: store.parameters(),
          settings: store.settings(),
          playing: store.playing(),
          probe: store.probe(),
          issues: store.issues().map((issue) => issue.message),
          message: store.message(),
        };
      },
      groundFrame: () => {
        const frame = store.frame();
        return frame === null ? null : { grid: frame.grid, values: frame.values };
      },
      capture: (request) => this.capture.capture(request),
    };
  }

  installIfRequested(host: AutomationHost, search: string): boolean {
    return installAutomation(host, search, () =>
      createAutomationApi({
        acquireDevice: () => this.gpu.deviceResult,
        solver: this.solver,
        createGpuBackend: createGpuFieldBackend,
        createCpuExecutor: () => this.cpuExecutor(),
        app: this.bridge(),
        clock: () => performance.now(),
        nextFrame: () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => {
              resolve();
            }),
          ),
      }),
    );
  }
}
