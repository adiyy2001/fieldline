export const deviceBoundFiles: readonly string[] = ['src/gpu/smoke.ts'];

export const workerEntryFiles: readonly string[] = ['src/workers/solver.worker.ts'];

export const excludedFromCoverage: readonly string[] = [...deviceBoundFiles, ...workerEntryFiles];
