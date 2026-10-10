import { Injectable, inject } from '@angular/core';
import { createGpuFieldBackend } from '../../gpu/field-evaluator';
import { CPU_EXECUTOR_FACTORY, SOLVER_CLIENT } from '../services/tokens';
import { GpuStatus } from '../services/gpu-status';
import { HeatmapCapture } from '../services/heatmap-capture';
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
  private readonly solver = inject(SOLVER_CLIENT);
  private readonly cpuExecutor = inject(CPU_EXECUTOR_FACTORY);

  private bridge(): AppBridge {
    const store = this.store;
    return {
      setParameters: (patch) => {
        store.setParameters(patch);
      },
      setSettings: (patch) => {
        store.setSettings(patch);
      },
      setPhase: (degrees) => {
        store.setPlaying(false);
        store.setPhase(degrees);
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
