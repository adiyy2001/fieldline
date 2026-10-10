import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../../core/model/parameters';
import { withSolveCache } from './cached-solver';
import type { SolveResult, SolverClient } from './solver-client';

interface FakeSolver extends SolverClient {
  readonly calls: number[];
  disposed: number;
  failNext: boolean;
}

function fakeSolver(): FakeSolver {
  const fake: FakeSolver = {
    calls: [],
    disposed: 0,
    failNext: false,
    solve: () => {
      fake.calls.push(fake.calls.length);
      if (fake.failNext) {
        fake.failNext = false;
        return Promise.reject(new Error('broken'));
      }
      return Promise.resolve({ system: {}, response: {} } as unknown as SolveResult);
    },
    dispose: () => {
      fake.disposed += 1;
    },
  };
  return fake;
}

describe('withSolveCache', () => {
  const base = defaultParameters('horizontal');

  it('reuses the answer when only the excitation changed', async () => {
    const inner = fakeSolver();
    const solver = withSolveCache(inner);
    const first = await solver.solve(base);
    const second = await solver.solve({ ...base, lineToLineKilovolts: 220, phasing: [2, 1, 0] });
    expect(second).toBe(first);
    expect(inner.calls).toHaveLength(1);
  });

  it('solves again when the geometry changed', async () => {
    const inner = fakeSolver();
    const solver = withSolveCache(inner);
    await solver.solve(base);
    await solver.solve({ ...base, phaseSag: base.phaseSag + 2 });
    expect(inner.calls).toHaveLength(2);
  });

  it('keeps draft and full answers apart', async () => {
    const inner = fakeSolver();
    const solver = withSolveCache(inner);
    await solver.solve(base, { draft: true });
    await solver.solve(base);
    expect(inner.calls).toHaveLength(2);
  });

  it('forgets the oldest answer beyond its capacity', async () => {
    const inner = fakeSolver();
    const solver = withSolveCache(inner, 2);
    for (const sag of [1, 2, 3]) {
      await solver.solve({ ...base, phaseSag: sag });
    }
    await solver.solve({ ...base, phaseSag: 3 });
    await solver.solve({ ...base, phaseSag: 1 });
    expect(inner.calls).toHaveLength(4);
  });

  it('does not keep a failed solve', async () => {
    const inner = fakeSolver();
    inner.failNext = true;
    const solver = withSolveCache(inner);
    await expect(solver.solve(base)).rejects.toThrow('broken');
    await Promise.resolve();
    await solver.solve(base);
    expect(inner.calls).toHaveLength(2);
  });

  it('clears the cache and disposes the inner client', async () => {
    const inner = fakeSolver();
    const solver = withSolveCache(inner);
    await solver.solve(base);
    solver.dispose();
    expect(inner.disposed).toBe(1);
    await solver.solve(base);
    expect(inner.calls).toHaveLength(2);
  });
});
