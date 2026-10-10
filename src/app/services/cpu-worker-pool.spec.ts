import { beforeAll, describe, expect, it } from 'vitest';
import { createCpuBackend } from '../../core/backend/cpu-backend';
import { evaluateRange } from '../../core/backend/evaluate-range';
import type { FieldSource, GridSpec } from '../../core/backend/types';
import { solveLine } from '../../core/field3d/solve-line';
import { groupExcitation } from '../../core/model/excitation';
import { defaultParameters } from '../../core/model/parameters';
import { handleFieldMessage } from '../../workers/cpu-field-handler';
import {
  createCpuWorkerPool,
  poolSizeFor,
  type PoolWorker,
  type PoolWorkerFactory,
} from './cpu-worker-pool';

const spec: GridSpec = { height: 1, xMin: -30, xMax: 30, zMin: 400, zMax: 500, nx: 6, nz: 7 };
let source: FieldSource;

beforeAll(() => {
  const parameters = defaultParameters('horizontal');
  source = { system: solveLine(parameters).system, excitation: groupExcitation(parameters) };
});

interface FakeWorkers {
  readonly factory: PoolWorkerFactory;
  readonly created: PoolWorker[];
  readonly terminated: number[];
}

function fakeWorkers(respond: (message: unknown) => unknown = handleFieldMessage): FakeWorkers {
  const created: PoolWorker[] = [];
  const terminated: number[] = [];
  const factory: PoolWorkerFactory = () => {
    const worker: PoolWorker = {
      onmessage: null,
      onerror: null,
      postMessage: (message) => {
        queueMicrotask(() => worker.onmessage?.({ data: respond(message) } as MessageEvent));
      },
      terminate: () => terminated.push(created.indexOf(worker)),
    };
    created.push(worker);
    return worker;
  };
  return { factory, created, terminated };
}

describe('the CPU worker pool', () => {
  it('splits a grid over the workers and assembles the same values as one evaluation', async () => {
    const workers = fakeWorkers();
    const backend = createCpuBackend(createCpuWorkerPool(3, workers.factory));
    backend.load(source);
    const buffer = await backend.evaluateGrid(spec);
    const expected = evaluateRange(source, { kind: 'grid', spec }, 0, 42);
    expect(Array.from(await buffer.read())).toEqual(Array.from(expected));
    expect(workers.created).toHaveLength(3);
  });

  it('reuses its workers for the next request and terminates them on dispose', async () => {
    const workers = fakeWorkers();
    const backend = createCpuBackend(createCpuWorkerPool(2, workers.factory));
    backend.load(source);
    await backend.evaluateGrid(spec);
    await backend.evaluatePoints(Float64Array.of(0, 1, 450, 5, 1, 450));
    expect(workers.created).toHaveLength(2);
    backend.dispose();
    expect(workers.terminated).toEqual([0, 1]);
  });

  it('rejects when a worker answers with a failure', async () => {
    const workers = fakeWorkers((message) => ({
      type: 'field-failed',
      id: (message as { id: number }).id,
      message: 'boom',
    }));
    const backend = createCpuBackend(createCpuWorkerPool(1, workers.factory));
    backend.load(source);
    await expect(backend.evaluateGrid(spec)).rejects.toThrow('boom');
  });

  it('rejects every pending request when a worker raises an error', async () => {
    const workers = fakeWorkers(() => undefined);
    const backend = createCpuBackend(createCpuWorkerPool(2, workers.factory));
    backend.load(source);
    const request = backend.evaluateGrid(spec);
    await Promise.resolve();
    workers.created[0]?.onerror?.({ message: 'crashed' } as ErrorEvent);
    await expect(request).rejects.toThrow('crashed');
  });

  it('rejects pending requests when disposed and ignores unknown messages', async () => {
    const workers = fakeWorkers(() => ({ type: 'something-else', id: 1 }));
    const backend = createCpuBackend(createCpuWorkerPool(1, workers.factory));
    backend.load(source);
    const request = backend.evaluateGrid(spec);
    await Promise.resolve();
    await Promise.resolve();
    backend.dispose();
    await expect(request).rejects.toThrow('disposed');
  });

  it('uses half of the hardware threads, between one and four workers', () => {
    expect([1, 2, 4, 8, 20].map(poolSizeFor)).toEqual([1, 1, 2, 4, 4]);
  });
});
