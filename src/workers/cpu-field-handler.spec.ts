import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateRange } from '../core/backend/evaluate-range';
import type { FieldSource, PointLayout } from '../core/backend/types';
import { serializeChargeSystem } from '../core/field3d/serialization';
import { solveLine } from '../core/field3d/solve-line';
import { groupExcitation } from '../core/model/excitation';
import { defaultParameters } from '../core/model/parameters';
import { handleFieldMessage } from './cpu-field-handler';
import type { FieldJobRequest } from './field-protocol';
import { PROTOCOL_VERSION } from './protocol';

let source: FieldSource;
let request: FieldJobRequest;
const layout: PointLayout = {
  kind: 'grid',
  spec: { height: 1, xMin: -20, xMax: 20, zMin: 400, zMax: 500, nx: 4, nz: 3 },
};

beforeAll(() => {
  const parameters = defaultParameters('delta');
  const { system } = solveLine(parameters);
  source = { system, excitation: groupExcitation(parameters) };
  request = {
    version: PROTOCOL_VERSION,
    type: 'evaluate-range',
    id: 7,
    system: serializeChargeSystem(system),
    voltages: source.excitation.voltages,
    currents: source.excitation.currents,
    layout,
    start: 4,
    end: 10,
  };
});

describe('the CPU field handler', () => {
  it('evaluates the requested range like the core function', () => {
    const result = handleFieldMessage(request);
    expect(result.type).toBe('range-evaluated');
    if (result.type === 'range-evaluated') {
      expect(result.id).toBe(7);
      expect(result.start).toBe(4);
      expect(Array.from(result.values)).toEqual(Array.from(evaluateRange(source, layout, 4, 10)));
    }
  });

  it('answers a malformed message with a failure that keeps the id', () => {
    const result = handleFieldMessage({ type: 'evaluate-range', id: 3 });
    expect(result).toMatchObject({ type: 'field-failed', id: 3 });
  });

  it('answers a message of another protocol version with a failure', () => {
    expect(handleFieldMessage({ ...request, version: 2 }).type).toBe('field-failed');
  });

  it('reports an evaluation error instead of throwing', () => {
    const broken = { ...request, layout: { kind: 'points' } };
    const result = handleFieldMessage(broken);
    expect(result).toMatchObject({ type: 'field-failed', id: 7 });
  });
});
