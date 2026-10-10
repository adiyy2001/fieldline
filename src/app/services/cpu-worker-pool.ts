import type { CpuExecutor } from '../../core/backend/cpu-backend';
import { layoutPointCount, splitIntoRows } from '../../core/backend/layout';
import { FIELD_COMPONENTS, type FieldSource, type PointLayout } from '../../core/backend/types';
import { serializeChargeSystem } from '../../core/field3d/serialization';
import type { FieldJobRequest, FieldJobResult } from '../../workers/field-protocol';
import { PROTOCOL_VERSION } from '../../workers/protocol';

export interface PoolWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type PoolWorkerFactory = () => PoolWorker;

export const MAXIMUM_POOL_SIZE = 4;

interface PendingJob {
  readonly start: number;
  readonly resolve: (job: { start: number; values: Float32Array }) => void;
  readonly reject: (error: Error) => void;
}

export function defaultWorkerFactory(): PoolWorker {
  return new Worker(new URL('../../workers/cpu-field.worker', import.meta.url), {
    type: 'module',
  });
}

export function poolSizeFor(hardwareConcurrency: number): number {
  return Math.max(1, Math.min(MAXIMUM_POOL_SIZE, Math.floor(hardwareConcurrency / 2)));
}

function isFieldResult(value: unknown): value is FieldJobResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value.type === 'range-evaluated' || value.type === 'field-failed')
  );
}

export function createCpuWorkerPool(
  size: number = poolSizeFor(globalThis.navigator.hardwareConcurrency),
  factory: PoolWorkerFactory = defaultWorkerFactory,
): CpuExecutor {
  const workers: PoolWorker[] = [];
  const pending = new Map<number, PendingJob>();
  let nextId = 1;

  function failAll(error: Error): void {
    for (const job of pending.values()) {
      job.reject(error);
    }
    pending.clear();
  }

  function handleMessage(data: unknown): void {
    if (!isFieldResult(data)) {
      return;
    }
    const job = pending.get(data.id);
    if (job === undefined) {
      return;
    }
    pending.delete(data.id);
    if (data.type === 'field-failed') {
      job.reject(new Error(data.message));
    } else {
      job.resolve({ start: data.start, values: data.values });
    }
  }

  function ensureWorkers(): void {
    while (workers.length < size) {
      const worker = factory();
      worker.onmessage = (event) => {
        handleMessage(event.data);
      };
      worker.onerror = (event) => {
        failAll(new Error(event.message));
      };
      workers.push(worker);
    }
  }

  function submit(
    worker: PoolWorker,
    request: Omit<FieldJobRequest, 'id'>,
    start: number,
  ): Promise<{ start: number; values: Float32Array }> {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { start, resolve, reject });
      worker.postMessage({ ...request, id });
    });
  }

  return {
    async run(source: FieldSource, layout: PointLayout): Promise<Float32Array> {
      ensureWorkers();
      const result = new Float32Array(layoutPointCount(layout) * FIELD_COMPONENTS);
      const system = serializeChargeSystem(source.system);
      const ranges = splitIntoRows(layout, workers.length);
      const jobs = ranges.map((range, index) => {
        const worker = workers[index];
        if (worker === undefined) {
          return Promise.reject(new Error('The pool has no worker for this range'));
        }
        return submit(
          worker,
          {
            version: PROTOCOL_VERSION,
            type: 'evaluate-range',
            system,
            voltages: source.excitation.voltages,
            currents: source.excitation.currents,
            layout,
            start: range.start,
            end: range.end,
          },
          range.start,
        );
      });
      for (const part of await Promise.all(jobs)) {
        result.set(part.values, part.start * FIELD_COMPONENTS);
      }
      return result;
    },
    dispose(): void {
      failAll(new Error('The pool was disposed'));
      for (const worker of workers) {
        worker.terminate();
      }
      workers.length = 0;
    },
  };
}
