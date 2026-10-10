import { evaluateRange } from '../core/backend/evaluate-range';
import { deserializeChargeSystem } from '../core/field3d/serialization';
import { type FieldJobFailure, type FieldJobResult, isFieldJobRequest } from './field-protocol';
import { PROTOCOL_VERSION, requestId } from './protocol';

function failure(id: number, message: string): FieldJobFailure {
  return { version: PROTOCOL_VERSION, type: 'field-failed', id, message };
}

export function handleFieldMessage(message: unknown): FieldJobResult {
  if (!isFieldJobRequest(message)) {
    return failure(requestId(message), 'The message is not a version 1 evaluate-range request');
  }
  try {
    const system = deserializeChargeSystem(message.system);
    const values = evaluateRange(
      { system, excitation: { voltages: message.voltages, currents: message.currents } },
      message.layout,
      message.start,
      message.end,
    );
    return {
      version: PROTOCOL_VERSION,
      type: 'range-evaluated',
      id: message.id,
      start: message.start,
      values,
    };
  } catch (error) {
    return failure(message.id, error instanceof Error ? error.message : 'The evaluation failed');
  }
}
