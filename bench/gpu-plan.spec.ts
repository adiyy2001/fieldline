import { describe, expect, it } from 'vitest';
import type {
  AdapterReport,
  ParityRun,
  ScenarioParity,
} from '../src/app/automation/automation-types';
import { adapterSlug, buildPlan, collectResults, summarizeParity } from './gpu-plan';

const statistics = (maximum: number) => ({
  maximum,
  mean: maximum / 10,
  worstIndex: 3,
  comparedPoints: 100,
  totalPoints: 120,
});

function scenario(electric: number, magnetic: number, finite = true): ScenarioParity {
  return {
    scenario: 'ground',
    pointCount: 100,
    electric: statistics(electric),
    magnetic: statistics(magnetic),
    finite,
    worstElectricPoint: null,
    worstMagneticPoint: null,
    gpuKernelMilliseconds: 1,
    gpuWallMilliseconds: 2,
    cpuMilliseconds: 3,
  };
}

function run(...scenarios: ScenarioParity[]): ParityRun {
  return { tower: 'horizontal', segmentCount: 10, solveMilliseconds: 1, scenarios };
}

const adapter = (overrides: Partial<AdapterReport>): AdapterReport => ({
  vendor: 'nvidia',
  architecture: 'ampere',
  device: '',
  description: '',
  software: false,
  timestampQuery: true,
  maxComputeInvocationsPerWorkgroup: 1024,
  maxStorageBufferBindingSize: 2 ** 31,
  ...overrides,
});

describe('adapterSlug', () => {
  it('joins vendor and architecture', () => {
    expect(adapterSlug(adapter({}))).toBe('nvidia-ampere');
    expect(adapterSlug(adapter({ vendor: 'intel', architecture: 'gen-12lp' }))).toBe(
      'intel-gen-12lp',
    );
  });

  it('falls back to the device name and then to a placeholder', () => {
    expect(adapterSlug(adapter({ architecture: '', device: 'RTX 3070 Ti' }))).toBe(
      'nvidia-rtx-3070-ti',
    );
    expect(adapterSlug(adapter({ vendor: '', architecture: '' }))).toBe('unknown-adapter');
  });
});

describe('buildPlan', () => {
  it('starts with the adapter, times kernels and then checks all three towers', () => {
    const plan = buildPlan();
    expect(plan[0]?.method).toBe('adapter');
    expect(plan.filter((step) => step.method === 'runKernelBench').length).toBeGreaterThanOrEqual(
      2,
    );
    const towers = plan.flatMap((step) =>
      step.method === 'runParity' ? [step.request.tower] : [],
    );
    expect(towers).toEqual(['horizontal', 'delta', 'double-circuit']);
    expect(plan.filter((step) => step.method === 'runMirror')).toHaveLength(3);
  });

  it('runs the kernel timings tiled and untiled at both workgroup sizes', () => {
    const step = buildPlan().find((candidate) => candidate.method === 'runKernelBench');
    const variants = step?.method === 'runKernelBench' ? step.request.variants : [];
    expect(new Set(variants.map((variant) => variant.tiled))).toEqual(new Set([true, false]));
    expect(new Set(variants.map((variant) => variant.groundWorkgroup))).toEqual(new Set([8, 16]));
  });
});

describe('collectResults and summarizeParity', () => {
  const plan = buildPlan();

  it('sorts outputs back by step kind', () => {
    const outputs = plan.map((step) => {
      switch (step.method) {
        case 'adapter':
          return adapter({});
        case 'runKernelBench':
          return [{ kernel: 'ground' }];
        case 'runParity':
          return run(scenario(1e-5, 2e-5));
        case 'runMirror':
          return {
            electric: { comparedPoints: 1, maximum: 3e-6 },
            magnetic: { comparedPoints: 1, maximum: 4e-6 },
          };
      }
    });
    const results = collectResults(plan, outputs);
    expect(results.adapter?.vendor).toBe('nvidia');
    expect(results.kernelRows.length).toBe(
      plan.filter((s) => s.method === 'runKernelBench').length,
    );
    expect(results.parityRuns).toHaveLength(3);
    expect(results.mirrorRuns).toHaveLength(3);
    const summary = summarizeParity(results);
    expect(summary.electricMaximum).toBe(1e-5);
    expect(summary.magneticMaximum).toBe(2e-5);
    expect(summary.mirrorMaximum).toBe(4e-6);
    expect(summary.withinTarget).toBe(true);
  });

  it('fails the target on a large error, a non-finite value or an empty run', () => {
    const base = { adapter: null, kernelRows: [], mirrorRuns: [] };
    expect(summarizeParity({ ...base, parityRuns: [run(scenario(2e-3, 0))] }).withinTarget).toBe(
      false,
    );
    expect(
      summarizeParity({ ...base, parityRuns: [run(scenario(0, 0, false))] }).withinTarget,
    ).toBe(false);
    expect(summarizeParity({ ...base, parityRuns: [] }).withinTarget).toBe(false);
  });
});
