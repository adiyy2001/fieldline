import { Injectable, inject } from '@angular/core';
import { createGpuFieldBackend } from '../../gpu/field-evaluator';
import { createCpuWorkerPool } from '../services/cpu-worker-pool';
import { GpuStatus } from '../services/gpu-status';
import { createSolverClient } from '../services/solver-client';
import { createAutomationApi } from './automation-api';
import type { FieldlineAutomation } from './automation-types';

export const AUTOMATION_QUERY_PARAMETER = 'automation';

declare global {
  interface Window {
    fieldline?: FieldlineAutomation;
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

  installIfRequested(host: AutomationHost, search: string): boolean {
    return installAutomation(host, search, () =>
      createAutomationApi({
        acquireDevice: () => this.gpu.deviceResult,
        solver: createSolverClient(),
        createGpuBackend: createGpuFieldBackend,
        createCpuExecutor: () => createCpuWorkerPool(),
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
