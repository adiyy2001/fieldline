import type { SerializedChargeSystem } from '../core/field3d/serialization';
import type { ResidualReport } from '../core/field3d/residual';
import type { LineParameters, ValidationIssue } from '../core/model/parameters';

export const PROTOCOL_VERSION = 1;

export interface SolveRequest {
  readonly version: typeof PROTOCOL_VERSION;
  readonly type: 'solve';
  readonly id: number;
  readonly parameters: LineParameters;
  readonly draft: boolean;
  readonly withResidual: boolean;
}

export interface SolvedResponse {
  readonly version: typeof PROTOCOL_VERSION;
  readonly type: 'solved';
  readonly id: number;
  readonly system: SerializedChargeSystem;
  readonly segmentsPerSpan: number;
  readonly residual?: ResidualReport;
  readonly milliseconds: number;
}

export interface FailedResponse {
  readonly version: typeof PROTOCOL_VERSION;
  readonly type: 'failed';
  readonly id: number;
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
}

export type SolverRequest = SolveRequest;
export type SolverResponse = SolvedResponse | FailedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isSolveRequest(value: unknown): value is SolveRequest {
  return (
    isRecord(value) &&
    value['version'] === PROTOCOL_VERSION &&
    value['type'] === 'solve' &&
    typeof value['id'] === 'number' &&
    isRecord(value['parameters']) &&
    typeof value['draft'] === 'boolean' &&
    typeof value['withResidual'] === 'boolean'
  );
}

export function requestId(value: unknown): number {
  return isRecord(value) && typeof value['id'] === 'number' ? value['id'] : -1;
}
