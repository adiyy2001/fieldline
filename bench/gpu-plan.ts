import type {
  AdapterReport,
  KernelBenchRequest,
  KernelBenchRow,
  MirrorRequest,
  MirrorRun,
  ParityRequest,
  ParityRun,
} from '../src/app/automation/automation-types';
import type { TowerKind } from '../src/core/geometry/tower';
import { PARITY_TARGET } from '../src/core/validation/parity';

export const BENCH_TOWERS: readonly TowerKind[] = ['horizontal', 'delta', 'double-circuit'];

export const FULL_GROUND_SIZE = { nx: 512, nz: 1024 };
export const FULL_VOLUME_SIZE = { nx: 64, ny: 64, nz: 128 };

const KERNEL_REPEATS = 3;

const KERNEL_VARIANTS = [
  { tiled: true, groundWorkgroup: 8 },
  { tiled: true, groundWorkgroup: 16 },
  { tiled: false, groundWorkgroup: 8 },
  { tiled: false, groundWorkgroup: 16 },
] as const;

const KERNEL_CASES = [
  {
    segmentsPerSpan: 6,
    ground: [
      { nx: 128, nz: 256 },
      { nx: 256, nz: 512 },
    ],
    volume: [
      { nx: 16, ny: 16, nz: 32 },
      { nx: 32, ny: 32, nz: 64 },
    ],
  },
  {
    segmentsPerSpan: 12,
    ground: [{ nx: 256, nz: 512 }, FULL_GROUND_SIZE],
    volume: [{ nx: 32, ny: 32, nz: 64 }, FULL_VOLUME_SIZE],
  },
  {
    segmentsPerSpan: 24,
    ground: [{ nx: 256, nz: 512 }],
    volume: [{ nx: 32, ny: 32, nz: 64 }],
  },
] as const;

export type PlanStep =
  | { readonly method: 'adapter' }
  | { readonly method: 'runKernelBench'; readonly request: KernelBenchRequest }
  | { readonly method: 'runParity'; readonly request: ParityRequest }
  | { readonly method: 'runMirror'; readonly request: MirrorRequest };

export function buildPlan(): readonly PlanStep[] {
  return [
    { method: 'adapter' },
    ...KERNEL_CASES.map((kernelCase): PlanStep => ({
      method: 'runKernelBench',
      request: {
        tower: 'horizontal',
        segmentsPerSpan: [kernelCase.segmentsPerSpan],
        ground: kernelCase.ground,
        volume: kernelCase.volume,
        variants: KERNEL_VARIANTS,
        repeats: KERNEL_REPEATS,
      },
    })),
    ...BENCH_TOWERS.map((tower): PlanStep => ({
      method: 'runParity',
      request: { tower, ground: FULL_GROUND_SIZE, volume: FULL_VOLUME_SIZE },
    })),
    ...BENCH_TOWERS.map((tower): PlanStep => ({
      method: 'runMirror',
      request: { tower, ground: FULL_GROUND_SIZE },
    })),
  ];
}

export interface PlanResults {
  readonly adapter: AdapterReport | null;
  readonly kernelRows: readonly KernelBenchRow[];
  readonly parityRuns: readonly ParityRun[];
  readonly mirrorRuns: readonly MirrorRun[];
}

export function collectResults(
  plan: readonly PlanStep[],
  outputs: readonly unknown[],
): PlanResults {
  let adapter: AdapterReport | null = null;
  const kernelRows: KernelBenchRow[] = [];
  const parityRuns: ParityRun[] = [];
  const mirrorRuns: MirrorRun[] = [];
  plan.forEach((step, index) => {
    const output = outputs[index];
    if (step.method === 'adapter') {
      adapter = output as AdapterReport | null;
    } else if (step.method === 'runKernelBench') {
      kernelRows.push(...(output as readonly KernelBenchRow[]));
    } else if (step.method === 'runParity') {
      parityRuns.push(output as ParityRun);
    } else {
      mirrorRuns.push(output as MirrorRun);
    }
  });
  return { adapter, kernelRows, parityRuns, mirrorRuns };
}

export function adapterSlug(adapter: AdapterReport): string {
  const words = [adapter.vendor, adapter.architecture || adapter.device || adapter.description];
  return (
    words
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown-adapter'
  );
}

export interface ParitySummary {
  readonly electricMaximum: number;
  readonly magneticMaximum: number;
  readonly mirrorMaximum: number;
  readonly allFinite: boolean;
  readonly withinTarget: boolean;
}

export function summarizeParity(results: PlanResults): ParitySummary {
  const scenarios = results.parityRuns.flatMap((run) => run.scenarios);
  const electricMaximum = Math.max(0, ...scenarios.map((scenario) => scenario.electric.maximum));
  const magneticMaximum = Math.max(0, ...scenarios.map((scenario) => scenario.magnetic.maximum));
  const mirrorMaximum = Math.max(
    0,
    ...results.mirrorRuns.flatMap((run) => [run.electric.maximum, run.magnetic.maximum]),
  );
  const allFinite = scenarios.every((scenario) => scenario.finite);
  return {
    electricMaximum,
    magneticMaximum,
    mirrorMaximum,
    allFinite,
    withinTarget:
      allFinite &&
      scenarios.length > 0 &&
      Math.max(electricMaximum, magneticMaximum, mirrorMaximum) < PARITY_TARGET,
  };
}
