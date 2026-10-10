import { InjectionToken } from '@angular/core';
import { type CpuExecutor } from '../../core/backend/cpu-backend';
import type { ReadyDevice } from '../../gpu/device';
import { type GpuFieldBackend, createGpuFieldBackend } from '../../gpu/field-evaluator';
import { withSolveCache } from './cached-solver';
import { createCpuWorkerPool } from './cpu-worker-pool';
import { type SolverClient, createSolverClient } from './solver-client';

export type GpuBackendFactory = (ready: ReadyDevice) => GpuFieldBackend;
export type CpuExecutorFactory = () => CpuExecutor;

export const SOLVER_CLIENT = new InjectionToken<SolverClient>('SOLVER_CLIENT', {
  providedIn: 'root',
  factory: () => withSolveCache(createSolverClient()),
});

export const GPU_BACKEND_FACTORY = new InjectionToken<GpuBackendFactory>('GPU_BACKEND_FACTORY', {
  providedIn: 'root',
  factory: () => (ready) => createGpuFieldBackend(ready),
});

export const CPU_EXECUTOR_FACTORY = new InjectionToken<CpuExecutorFactory>('CPU_EXECUTOR_FACTORY', {
  providedIn: 'root',
  factory: () => () => createCpuWorkerPool(),
});

export const PREFERS_REDUCED_MOTION = new InjectionToken<() => boolean>('PREFERS_REDUCED_MOTION', {
  providedIn: 'root',
  factory: () => () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
