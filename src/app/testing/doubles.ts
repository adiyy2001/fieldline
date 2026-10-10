import { createCpuBackend, createInlineExecutor } from '../../core/backend/cpu-backend';
import type { FieldBackend, FieldBuffer, FieldSource, GridSpec } from '../../core/backend/types';
import { handleSolverMessage } from '../../workers/solver-handler';
import type { BackendSource } from '../services/field-pipeline';
import { type SolverClient, createSolverClient } from '../services/solver-client';
import type { WorkerPort } from '../services/worker-port';

export function inlineSolverWorker(delayMilliseconds = 0): WorkerPort {
  const worker: WorkerPort = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => {
      const respond = () => {
        worker.onmessage?.({ data: handleSolverMessage(message, () => 0) } as MessageEvent);
      };
      if (delayMilliseconds > 0) {
        setTimeout(respond, delayMilliseconds);
      } else {
        queueMicrotask(respond);
      }
    },
    terminate: () => undefined,
  };
  return worker;
}

export function inlineSolver(delayMilliseconds = 0): SolverClient {
  return createSolverClient(() => inlineSolverWorker(delayMilliseconds));
}

export function inlineCpuBackend(): FieldBackend {
  return createCpuBackend(createInlineExecutor());
}

export interface FakeGpuBackend extends FieldBackend {
  readonly kind: 'gpu';
  readonly released: GPUBuffer[];
  lastTimings(): null;
}

export function fakeGpuBackend(): FakeGpuBackend {
  const cpu = inlineCpuBackend();
  const released: GPUBuffer[] = [];
  return {
    kind: 'gpu',
    released,
    lastTimings: () => null,
    load: (source: FieldSource) => {
      cpu.load(source);
    },
    evaluateGrid: async (spec: GridSpec): Promise<FieldBuffer> => {
      const inner = await cpu.evaluateGrid({ ...spec, nx: 4, nz: 4 });
      const buffer = { label: 'fake' } as unknown as GPUBuffer;
      return {
        pointCount: inner.pointCount,
        buffer,
        read: () => inner.read(),
        release: () => {
          released.push(buffer);
        },
      } as FieldBuffer;
    },
    evaluateVolume: (spec) => cpu.evaluateVolume(spec),
    evaluatePoints: (coordinates) => cpu.evaluatePoints(coordinates),
    dispose: () => {
      cpu.dispose();
    },
  };
}

export class FakeBackends implements BackendSource {
  readonly demotions: string[] = [];
  private backend: FieldBackend;
  private readonly fallback: () => FieldBackend;

  constructor(
    initial: FieldBackend = inlineCpuBackend(),
    fallback: () => FieldBackend = inlineCpuBackend,
  ) {
    this.backend = initial;
    this.fallback = fallback;
  }

  get(): Promise<FieldBackend> {
    return Promise.resolve(this.backend);
  }

  demote(reason: string): void {
    this.demotions.push(reason);
    this.backend = this.fallback();
  }
}

export async function until(condition: () => boolean, timeoutMilliseconds = 8000): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error('the condition was not met in time');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 4));
  }
}
