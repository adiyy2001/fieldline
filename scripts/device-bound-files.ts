export const deviceBoundFiles: readonly string[] = ['src/gpu/smoke.ts'];

export const workerEntryFiles: readonly string[] = [];

export const excludedFromCoverage: readonly string[] = [...deviceBoundFiles, ...workerEntryFiles];
