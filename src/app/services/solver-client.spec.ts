import { describe, expect, it } from 'vitest';
import { defaultParameters } from '../../core/model/parameters';
import { handleSolverMessage } from '../../workers/solver-handler';
import { createSolverClient, SolveFailure } from './solver-client';
import type { WorkerPort } from './worker-port';

function fakeSolverWorker(
  respond: (message: unknown) => unknown = (m) => handleSolverMessage(m, () => 0),
) {
  const terminated: boolean[] = [];
  const worker: WorkerPort = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => {
      queueMicrotask(() => worker.onmessage?.({ data: respond(message) } as MessageEvent));
    },
    terminate: () => terminated.push(true),
  };
  return { worker, terminated };
}

describe('the solver client', () => {
  it('returns a charge system with the residual when it is asked for', async () => {
    const { worker } = fakeSolverWorker();
    const client = createSolverClient(() => worker);
    const result = await client.solve(defaultParameters('horizontal'), { withResidual: true });
    expect(result.system.set.count).toBe(210);
    expect(result.response.residual?.checkPointCount).toBeGreaterThan(0);
    expect(result.response.segmentsPerSpan).toBe(12);
  });

  it('asks for the draft quality when told to', async () => {
    const { worker } = fakeSolverWorker();
    const client = createSolverClient(() => worker);
    const result = await client.solve(defaultParameters('horizontal'), { draft: true });
    expect(result.response.segmentsPerSpan).toBe(8);
    expect(result.system.set.count).toBe(5 * (3 * 8 + 6));
  });

  it('starts one worker and reuses it', async () => {
    let created = 0;
    const { worker } = fakeSolverWorker();
    const client = createSolverClient(() => {
      created += 1;
      return worker;
    });
    await client.solve(defaultParameters('delta'));
    await client.solve(defaultParameters('delta'));
    expect(created).toBe(1);
  });

  it('rejects with the validation issues of a failed solve', async () => {
    const { worker } = fakeSolverWorker();
    const client = createSolverClient(() => worker);
    const invalid = { ...defaultParameters('horizontal'), lineToLineKilovolts: -5 };
    const failure = await client.solve(invalid).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SolveFailure);
    expect((failure as SolveFailure).issues.length).toBeGreaterThan(0);
  });

  it('matches answers to requests by id, whatever the order', async () => {
    const replies: ((value: unknown) => void)[] = [];
    const worker: WorkerPort = {
      onmessage: null,
      onerror: null,
      postMessage: (message) => {
        replies.push(() =>
          worker.onmessage?.({ data: handleSolverMessage(message, () => 0) } as MessageEvent),
        );
      },
      terminate: () => undefined,
    };
    const client = createSolverClient(() => worker);
    const first = client.solve({ ...defaultParameters('horizontal'), segmentsPerSpan: 6 });
    const second = client.solve({ ...defaultParameters('horizontal'), segmentsPerSpan: 8 });
    replies[1]?.(undefined);
    replies[0]?.(undefined);
    expect((await first).response.segmentsPerSpan).toBe(6);
    expect((await second).response.segmentsPerSpan).toBe(8);
  });

  it('ignores unrelated messages, rejects on a worker error and on dispose', async () => {
    const quiet = fakeSolverWorker(() => ({ type: 'noise' }));
    const client = createSolverClient(() => quiet.worker);
    const stuck = client.solve(defaultParameters('horizontal'));
    await Promise.resolve();
    await Promise.resolve();
    quiet.worker.onerror?.({ message: 'crashed' } as ErrorEvent);
    await expect(stuck).rejects.toThrow('crashed');
    const second = client.solve(defaultParameters('horizontal'));
    client.dispose();
    await expect(second).rejects.toThrow('disposed');
    expect(quiet.terminated).toEqual([true]);
  });
});
