import type { Provider } from '@angular/core';
import { createInlineExecutor } from '../../core/backend/cpu-backend';
import { DEVICE_ACQUIRER, SMOKE_RUNNER } from '../services/gpu-status';
import { CPU_EXECUTOR_FACTORY, SOLVER_CLIENT } from '../services/tokens';
import { LOCATION_ACCESS } from '../services/url-sync';
import { inlineSolver } from './doubles';

export interface StoreProviderOptions {
  readonly search?: string;
  readonly solverDelayMilliseconds?: number;
  readonly writes?: string[];
}

export function storeProviders(options: StoreProviderOptions = {}): Provider[] {
  return [
    {
      provide: DEVICE_ACQUIRER,
      useValue: () =>
        Promise.resolve({ status: 'unsupported', reason: 'no-api', detail: 'test' } as const),
    },
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
