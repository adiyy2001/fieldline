import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SOLVE_CACHE_ENTRIES } from '../src/app/services/cached-solver';
import { validateParameters } from '../src/core/model/parameters';
import {
  LATENCY_CASES,
  LATENCY_SOURCE,
  UPDATE_TARGET_MILLISECONDS,
  summarizeLatency,
  type LatencySample,
} from './latency-measure';

function sample(update: number, overrides: Partial<LatencySample> = {}): LatencySample {
  return {
    backend: 'gpu',
    quality: 'full',
    solveMilliseconds: 10,
    evaluateMilliseconds: 20,
    pipelineMilliseconds: 30,
    updateMilliseconds: update,
    renderMilliseconds: 5,
    endToEndMilliseconds: update + 5,
    ...overrides,
  };
}

describe('the latency cases', () => {
  it('keep every patched configuration valid', () => {
    for (const latencyCase of LATENCY_CASES) {
      for (const patch of latencyCase.patches) {
        expect(validateParameters({ ...latencyCase.base, ...patch })).toEqual([]);
      }
    }
  });

  it('keep every sag of the sweep valid and distinct from the cache size', () => {
    const sweeping = LATENCY_CASES.filter((latencyCase) => latencyCase.sweep !== null);
    expect(sweeping.length).toBeGreaterThan(0);
    for (const latencyCase of sweeping) {
      const sweep = latencyCase.sweep;
      expect(sweep?.count).toBeGreaterThan(SOLVE_CACHE_ENTRIES);
      for (let index = 0; index < (sweep?.count ?? 0); index += 1) {
        const phaseSag = (sweep?.from ?? 0) + index * (sweep?.step ?? 0);
        expect(validateParameters({ ...latencyCase.base, phaseSag })).toEqual([]);
      }
    }
  });

  it('cover geometry, drag, voltage and phasing changes on both towers', () => {
    const kinds = new Set(LATENCY_CASES.map((latencyCase) => latencyCase.change));
    expect(kinds).toEqual(new Set(['geometry', 'drag', 'voltage', 'phasing']));
    expect(new Set(LATENCY_CASES.map((latencyCase) => latencyCase.tower)).size).toBe(2);
    expect(new Set(LATENCY_CASES.map((latencyCase) => latencyCase.name)).size).toBe(
      LATENCY_CASES.length,
    );
  });

  it('only mark the drag case as interactive', () => {
    expect(
      LATENCY_CASES.filter((latencyCase) => latencyCase.interactive).map(
        (latencyCase) => latencyCase.change,
      ),
    ).toEqual(['drag']);
  });

  it('ship an in-page script that parses', () => {
    expect(() => new Script(`(${LATENCY_SOURCE})`)).not.toThrow();
  });
});

describe('summarizeLatency', () => {
  it('reports medians and the share under the target', () => {
    const summary = summarizeLatency({
      name: 'case',
      samples: [sample(100), sample(120), sample(140)],
    });
    expect(summary).toMatchObject({
      name: 'case',
      backend: 'gpu',
      quality: 'full',
      updateMedianMilliseconds: 120,
      solveMedianMilliseconds: 10,
      renderMedianMilliseconds: 5,
      endToEndMedianMilliseconds: 125,
      withinTarget: true,
    });
  });

  it('fails the target when the median reaches it', () => {
    const slow = [sample(UPDATE_TARGET_MILLISECONDS), sample(UPDATE_TARGET_MILLISECONDS + 20)];
    expect(summarizeLatency({ name: 'slow', samples: slow }).withinTarget).toBe(false);
  });
});
