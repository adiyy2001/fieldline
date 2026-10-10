export const deviceBoundFiles: readonly string[] = [
  'src/gpu/smoke.ts',
  'src/gpu/field-evaluator.ts',
  'src/gpu/heatmap-renderer.ts',
  'src/gpu/texture-readback.ts',
  'src/gpu/scene-renderer.ts',
  'src/gpu/volume-field.ts',
  'src/gpu/volume-layer.ts',
  'src/gpu/isosurface-layer.ts',
  'src/gpu/field-lines.ts',
  'src/app/automation/scene3d-scenarios.ts',
  'src/app/scene3d/scene3d-engine.ts',
];

export const workerEntryFiles: readonly string[] = [
  'src/workers/solver.worker.ts',
  'src/workers/cpu-field.worker.ts',
];

export const excludedFromCoverage: readonly string[] = [...deviceBoundFiles, ...workerEntryFiles];
