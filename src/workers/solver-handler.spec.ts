import { deserializeChargeSystem } from '../core/field3d/serialization';
import { defaultParameters } from '../core/model/parameters';
import { PROTOCOL_VERSION, isSolveRequest, requestId, type SolveRequest } from './protocol';
import { handleSolverMessage } from './solver-handler';

function request(overrides: Partial<SolveRequest> = {}): SolveRequest {
  return {
    version: PROTOCOL_VERSION,
    type: 'solve',
    id: 7,
    parameters: defaultParameters('horizontal'),
    draft: false,
    withResidual: false,
    ...overrides,
  };
}

function steppingClock() {
  let now = 0;
  return () => {
    now += 25;
    return now;
  };
}

describe('the solver message protocol', () => {
  it('recognizes a version 1 solve request and nothing else', () => {
    expect(isSolveRequest(request())).toBe(true);
    expect(isSolveRequest({ ...request(), version: 2 })).toBe(false);
    expect(isSolveRequest({ ...request(), type: 'other' })).toBe(false);
    expect(isSolveRequest({ ...request(), id: 'a' })).toBe(false);
    expect(isSolveRequest({ ...request(), parameters: 3 })).toBe(false);
    expect(isSolveRequest({ ...request(), draft: 1 })).toBe(false);
    expect(isSolveRequest(null)).toBe(false);
    expect(isSolveRequest('solve')).toBe(false);
  });

  it('reads the id of a message when there is one', () => {
    expect(requestId({ id: 3 })).toBe(3);
    expect(requestId({ id: 'x' })).toBe(-1);
    expect(requestId(undefined)).toBe(-1);
  });
});

describe('handling a solve request', () => {
  it('answers with the serialized system, the segment count and the elapsed time', () => {
    const response = handleSolverMessage(request(), steppingClock());
    if (response.type !== 'solved') {
      throw new Error(`unexpected ${response.type}`);
    }
    expect(response.id).toBe(7);
    expect(response.version).toBe(PROTOCOL_VERSION);
    expect(response.segmentsPerSpan).toBe(12);
    expect(response.milliseconds).toBe(25);
    expect(response.residual).toBeUndefined();
    expect(deserializeChargeSystem(response.system).set.count).toBe(210);
  });

  it('adds the potential residual on request', () => {
    const response = handleSolverMessage(request({ withResidual: true }), steppingClock());
    if (response.type !== 'solved') {
      throw new Error(`unexpected ${response.type}`);
    }
    expect(response.residual?.checkPointCount).toBe(205);
    expect(response.residual?.interiorMaximum).toBeLessThan(6e-3);
  });

  it('uses 8 segments per span in draft mode and never more than the parameters ask', () => {
    const draft = handleSolverMessage(request({ draft: true }), steppingClock());
    const coarse = handleSolverMessage(
      request({ draft: true, parameters: { ...defaultParameters(), segmentsPerSpan: 5 } }),
      steppingClock(),
    );
    expect(draft.type === 'solved' && draft.segmentsPerSpan).toBe(8);
    expect(coarse.type === 'solved' && coarse.segmentsPerSpan).toBe(5);
    expect(draft.type === 'solved' && draft.system.count).toBe(5 * (3 * 8 + 6));
  });

  it('refuses invalid parameters with the list of issues', () => {
    const response = handleSolverMessage(
      request({ parameters: { ...defaultParameters(), lineToLineKilovolts: 5 } }),
      steppingClock(),
    );
    expect(response.type).toBe('failed');
    expect(response.id).toBe(7);
    expect(response.type === 'failed' && response.issues[0]?.field).toBe('lineToLineKilovolts');
  });

  it('answers a malformed message with a failure and the id -1', () => {
    const response = handleSolverMessage({ type: 'solve' }, steppingClock());
    expect(response).toMatchObject({ type: 'failed', id: -1 });
  });

  it('turns an exception in the solver into a failure', () => {
    const broken = request({ parameters: {} as SolveRequest['parameters'] });
    const response = handleSolverMessage(broken, steppingClock());
    expect(response).toMatchObject({ type: 'failed', id: 7 });
    expect(response.type === 'failed' && response.message.length).toBeGreaterThan(0);
  });
});
