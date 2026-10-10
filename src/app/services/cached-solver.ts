import type { LineParameters } from '../../core/model/parameters';
import { solveKey } from '../../core/model/solve-key';
import type { SolveOptions, SolveResult, SolverClient } from './solver-client';

export const SOLVE_CACHE_ENTRIES = 4;

export function withSolveCache(inner: SolverClient, capacity = SOLVE_CACHE_ENTRIES): SolverClient {
  const cache = new Map<string, Promise<SolveResult>>();

  function remember(key: string, result: Promise<SolveResult>): void {
    cache.delete(key);
    cache.set(key, result);
    const oldest = cache.keys().next();
    if (cache.size > capacity && oldest.done !== true) {
      cache.delete(oldest.value);
    }
  }

  return {
    solve(parameters: LineParameters, options: SolveOptions = {}): Promise<SolveResult> {
      const key = solveKey(parameters, {
        draft: options.draft ?? false,
        withResidual: options.withResidual ?? false,
      });
      const cached = cache.get(key);
      if (cached !== undefined) {
        remember(key, cached);
        return cached;
      }
      const pending = inner.solve(parameters, options);
      remember(key, pending);
      pending.catch(() => {
        if (cache.get(key) === pending) {
          cache.delete(key);
        }
      });
      return pending;
    },
    dispose(): void {
      cache.clear();
      inner.dispose();
    },
  };
}
