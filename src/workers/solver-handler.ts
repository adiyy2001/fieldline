import { potentialResidual } from '../core/field3d/residual';
import { serializeChargeSystem } from '../core/field3d/serialization';
import { solveLine } from '../core/field3d/solve-line';
import { DRAFT_SEGMENTS_PER_SPAN, validateParameters } from '../core/model/parameters';
import {
  type FailedResponse,
  PROTOCOL_VERSION,
  type SolveRequest,
  type SolverResponse,
  isSolveRequest,
  requestId,
} from './protocol';

export type Clock = () => number;

function failure(
  id: number,
  message: string,
  issues: FailedResponse['issues'] = [],
): FailedResponse {
  return { version: PROTOCOL_VERSION, type: 'failed', id, message, issues };
}

function segmentsFor(request: SolveRequest): number {
  const requested = request.parameters.segmentsPerSpan;
  return request.draft ? Math.min(requested, DRAFT_SEGMENTS_PER_SPAN) : requested;
}

function solve(request: SolveRequest, clock: Clock): SolverResponse {
  const issues = validateParameters(request.parameters);
  if (issues.length > 0) {
    return failure(request.id, 'The parameters are not valid', issues);
  }
  const started = clock();
  const segmentsPerSpan = segmentsFor(request);
  const { system } = solveLine(request.parameters, { segmentsPerSpan });
  const residual = request.withResidual ? potentialResidual(system) : undefined;
  const response = {
    version: PROTOCOL_VERSION,
    type: 'solved',
    id: request.id,
    system: serializeChargeSystem(system),
    segmentsPerSpan,
    milliseconds: clock() - started,
  } as const;
  return residual === undefined ? response : { ...response, residual };
}

export function handleSolverMessage(message: unknown, clock: Clock): SolverResponse {
  if (!isSolveRequest(message)) {
    return failure(requestId(message), 'The message is not a version 1 solve request');
  }
  try {
    return solve(message, clock);
  } catch (error) {
    return failure(message.id, error instanceof Error ? error.message : 'The solve failed');
  }
}
