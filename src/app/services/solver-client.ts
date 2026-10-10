import type { ChargeSystem } from '../../core/field3d/charge-system';
import { deserializeChargeSystem } from '../../core/field3d/serialization';
import type { LineParameters, ValidationIssue } from '../../core/model/parameters';
import {
  PROTOCOL_VERSION,
  type SolvedResponse,
  type SolveRequest,
  type SolverResponse,
} from '../../workers/protocol';
import type { WorkerPort, WorkerPortFactory } from './worker-port';

export interface SolveOptions {
  readonly draft?: boolean;
  readonly withResidual?: boolean;
}

export interface SolveResult {
  readonly system: ChargeSystem;
  readonly response: SolvedResponse;
}

export class SolveFailure extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.issues = issues;
  }
}

export interface SolverClient {
  solve(parameters: LineParameters, options?: SolveOptions): Promise<SolveResult>;
  dispose(): void;
}

interface Pending {
  readonly resolve: (result: SolveResult) => void;
  readonly reject: (error: Error) => void;
}

export function defaultSolverWorker(): WorkerPort {
  return new Worker(new URL('../../workers/solver.worker', import.meta.url), { type: 'module' });
}

function isSolverResponse(value: unknown): value is SolverResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value.type === 'solved' || value.type === 'failed')
  );
}

export function createSolverClient(factory: WorkerPortFactory = defaultSolverWorker): SolverClient {
  const pending = new Map<number, Pending>();
  let worker: WorkerPort | null = null;
  let nextId = 1;

  function failAll(error: Error): void {
    for (const job of pending.values()) {
      job.reject(error);
    }
    pending.clear();
  }

  function receive(data: unknown): void {
    if (!isSolverResponse(data)) {
      return;
    }
    const job = pending.get(data.id);
    if (job === undefined) {
      return;
    }
    pending.delete(data.id);
    if (data.type === 'failed') {
      job.reject(new SolveFailure(data.message, data.issues));
    } else {
      job.resolve({ system: deserializeChargeSystem(data.system), response: data });
    }
  }

  function ensureWorker(): WorkerPort {
    if (worker === null) {
      const created = factory();
      created.onmessage = (event) => {
        receive(event.data);
      };
      created.onerror = (event) => {
        failAll(new Error(event.message));
      };
      worker = created;
    }
    return worker;
  }

  return {
    solve(parameters, options = {}): Promise<SolveResult> {
      const port = ensureWorker();
      const id = nextId;
      nextId += 1;
      const request: SolveRequest = {
        version: PROTOCOL_VERSION,
        type: 'solve',
        id,
        parameters,
        draft: options.draft ?? false,
        withResidual: options.withResidual ?? false,
      };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        port.postMessage(request);
      });
    },
    dispose(): void {
      failAll(new Error('The solver client was disposed'));
      worker?.terminate();
      worker = null;
    },
  };
}
