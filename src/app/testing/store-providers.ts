import type { Provider } from '@angular/core';
import { createInlineExecutor } from '../../core/backend/cpu-backend';
import type { DeviceResult } from '../../gpu/device';
import { DEVICE_ACQUIRER, SMOKE_RUNNER } from '../services/gpu-status';
import { CPU_EXECUTOR_FACTORY, GPU_BACKEND_FACTORY, SOLVER_CLIENT } from '../services/tokens';
import { LOCATION_ACCESS } from '../services/url-sync';
import { fakeGpuBackend, inlineSolver } from './doubles';

export interface StoreProviderOptions {
  readonly search?: string;
  readonly solverDelayMilliseconds?: number;
  readonly writes?: string[];
  readonly gpu?: boolean;
}

function fakeReadyDevice(): DeviceResult {
  return {
    status: 'ready',
    device: {} as GPUDevice,
    adapter: {
      vendor: 'test',
      architecture: 'test',
      device: 'test',
      description: 'test',
      software: false,
    },
    timestampQuery: false,
    lost: new Promise(() => undefined),
  };
}

export function storeProviders(options: StoreProviderOptions = {}): Provider[] {
  return [
    {
      provide: DEVICE_ACQUIRER,
      useValue: () =>
        Promise.resolve(
          options.gpu === true
            ? fakeReadyDevice()
            : ({ status: 'unsupported', reason: 'no-api', detail: 'test' } as const),
        ),
    },
    { provide: GPU_BACKEND_FACTORY, useValue: () => fakeGpuBackend() },
    { provide: SMOKE_RUNNER, useValue: () => Promise.resolve({ correct: 1, total: 1 }) },
    { provide: CPU_EXECUTOR_FACTORY, useValue: () => createInlineExecutor() },
    { provide: SOLVER_CLIENT, useValue: inlineSolver(options.solverDelayMilliseconds ?? 0) },
    {
      provide: LOCATION_ACCESS,
      useValue: {
        search: () => options.search ?? '',
        replaceQuery: (query: string) => options.writes?.push(query),
      },
    },
  ];
}
