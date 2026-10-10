export const deviceBoundFiles: readonly string[] = [
  'src/gpu/smoke.ts',
  'src/gpu/field-evaluator.ts',
];

export const workerEntryFiles: readonly string[] = [
  'src/workers/solver.worker.ts',
  'src/workers/cpu-field.worker.ts',
];

export const excludedFromCoverage: readonly string[] = [...deviceBoundFiles, ...workerEntryFiles];
