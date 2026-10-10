import { describe, expect, it } from 'vitest';
import type { FieldBackend } from '../../core/backend/types';
import { defaultConfiguration } from '../../core/model/settings';
import { defaultParameters } from '../../core/model/parameters';
import { FakeBackends, fakeGpuBackend, inlineCpuBackend, inlineSolver } from '../testing/doubles';
import { createFieldPipeline, gridSizeFor } from './field-pipeline';
import type { SolverClient } from './solver-client';

function pipelineWith(
  backends: FakeBackends,
  solver: SolverClient = inlineSolver(),
  clock: () => number = () => performance.now(),
) {
  return createFieldPipeline({ solver, backends, clock });
}

const full = { configuration: defaultConfiguration(), quality: 'full' as const };

describe('the field pipeline', () => {
  it('produces a CPU frame with a profile and timings', async () => {
    const outcome = await pipelineWith(new FakeBackends()).run(full);
    expect(outcome.status).toBe('frame');
    if (outcome.status !== 'frame') {
      return;
    }
    const { frame } = outcome;
    expect(frame.backend).toBe('cpu');
    expect(frame.source).toBeInstanceOf(Float32Array);
    expect([frame.grid.nx, frame.grid.nz]).toEqual([128, 256]);
    expect(frame.grid.height).toBe(1);
    expect(frame.profile.samples).toHaveLength(241);
    expect(frame.referenceMidZ).toBe(450);
    expect(frame.timings.totalMilliseconds).toBeGreaterThanOrEqual(0);
    expect(frame.values.length).toBe(128 * 256 * 12);
    expect(frame.maxima.electric).toBeGreaterThan(1);
    expect(frame.maxima.magnetic).toBeGreaterThan(1);
  });

  it('uses the draft size and the draft solve while a slider moves', async () => {
    const outcome = await pipelineWith(new FakeBackends()).run({ ...full, quality: 'draft' });
    expect(outcome.status === 'frame' && [outcome.frame.grid.nx, outcome.frame.grid.nz]).toEqual([
      64, 128,
    ]);
    expect(outcome.status === 'frame' && outcome.frame.profile.samples.length).toBe(121);
  });

  it('keeps the device buffer of a GPU frame and releases it on request', async () => {
    const gpu = fakeGpuBackend();
    const outcome = await pipelineWith(new FakeBackends(gpu)).run(full);
    expect(outcome.status === 'frame' && outcome.frame.backend).toBe('gpu');
    if (outcome.status === 'frame') {
      expect(outcome.frame.source).not.toBeInstanceOf(Float32Array);
      outcome.frame.release();
    }
    expect(gpu.released).toHaveLength(1);
  });

  it('evaluates the grid at the chosen height', async () => {
    const configuration = {
      ...defaultConfiguration(),
      settings: { ...defaultConfiguration().settings, evaluationHeight: 1.8 },
    };
    const outcome = await pipelineWith(new FakeBackends()).run({ configuration, quality: 'full' });
    expect(outcome.status === 'frame' && outcome.frame.grid.height).toBe(1.8);
    expect(outcome.status === 'frame' && outcome.frame.profile.spec.height).toBe(1.8);
  });

  it('builds the 2D cross-section without calling the solver', async () => {
    let solves = 0;
    const solver: SolverClient = {
      solve: () => {
        solves += 1;
        return Promise.reject(new Error('not expected'));
      },
      dispose: () => undefined,
    };
    const configuration = {
      ...defaultConfiguration(),
      settings: { ...defaultConfiguration().settings, model: 'cross-section-2d' as const },
    };
    const outcome = await pipelineWith(new FakeBackends(), solver).run({
      configuration,
      quality: 'full',
    });
    expect(solves).toBe(0);
    expect(outcome.status === 'frame' && outcome.frame.backend).toBe('cross-section');
    expect(outcome.status === 'frame' && outcome.frame.grid.nz).toBe(2);
  });

  it('reports invalid parameters without solving', async () => {
    const parameters = { ...defaultParameters(), lineToLineKilovolts: 5 };
    const outcome = await pipelineWith(new FakeBackends()).run({
      configuration: { ...defaultConfiguration(), parameters },
      quality: 'full',
    });
    expect(outcome.status).toBe('invalid');
  });

  it('drops the answer of an older request', async () => {
    const pipeline = pipelineWith(new FakeBackends(), inlineSolver(5));
    const first = pipeline.run(full);
    const second = pipeline.run({ ...full, quality: 'draft' });
    expect((await first).status).toBe('stale');
    expect((await second).status).toBe('frame');
  });

  it('releases the buffer of a stale GPU frame', async () => {
    const gpu = fakeGpuBackend();
    const pipeline = pipelineWith(new FakeBackends(gpu));
    const first = pipeline.run(full);
    const second = pipeline.run(full);
    expect((await first).status).toBe('stale');
    expect((await second).status).toBe('frame');
  });

  it('falls back to the CPU backend when the GPU fails', async () => {
    const failing = {
      ...fakeGpuBackend(),
      evaluateGrid: () => Promise.reject(new Error('device error')),
    };
    const backends = new FakeBackends(failing);
    const outcome = await pipelineWith(backends).run(full);
    expect(backends.demotions).toEqual(['device error']);
    expect(outcome.status === 'frame' && outcome.frame.backend).toBe('cpu');
  });

  it('fails when the CPU backend fails', async () => {
    const failing = {
      ...inlineCpuBackend(),
      evaluateGrid: () => Promise.reject(new Error('boom')),
    };
    const outcome = await pipelineWith(new FakeBackends(failing)).run(full);
    expect(outcome).toEqual({ status: 'failed', message: 'boom' });
  });

  it('reports a second failure after the fallback', async () => {
    const failing = (message: string): FieldBackend => ({
      ...inlineCpuBackend(),
      evaluateGrid: () => Promise.reject(new Error(message)),
    });
    const gpu: FieldBackend = { ...failing('first'), kind: 'gpu' };
    const backends = new FakeBackends(gpu, () => failing('second'));
    const outcome = await pipelineWith(backends).run(full);
    expect(backends.demotions).toEqual(['first']);
    expect(outcome).toEqual({ status: 'failed', message: 'second' });
  });

  it('chooses the grid by backend and quality', () => {
    expect(gridSizeFor('gpu', 'full')).toEqual({ nx: 512, nz: 1024 });
    expect(gridSizeFor('gpu', 'draft')).toEqual({ nx: 256, nz: 512 });
    expect(gridSizeFor('cpu', 'full')).toEqual({ nx: 128, nz: 256 });
    expect(gridSizeFor('cpu', 'draft')).toEqual({ nx: 64, nz: 128 });
  });
});
