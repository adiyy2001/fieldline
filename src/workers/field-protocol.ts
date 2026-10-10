import type { Complex } from '../core/complex';
import type { PointLayout } from '../core/backend/types';
import type { SerializedChargeSystem } from '../core/field3d/serialization';
import { PROTOCOL_VERSION } from './protocol';

export interface FieldJobRequest {
  readonly version: typeof PROTOCOL_VERSION;
  readonly type: 'evaluate-range';
  readonly id: number;
  readonly system: SerializedChargeSystem;
  readonly voltages: readonly Complex[];
  readonly currents: readonly Complex[];
  readonly layout: PointLayout;
  readonly start: number;
  readonly end: number;
}

export interface FieldJobResponse {
  readonly version: typeof PROTOCOL_VERSION;
  readonly type: 'range-evaluated';
  readonly id: number;
  readonly start: number;
  readonly values: Float32Array;
}

export interface FieldJobFailure {
  readonly version: typeof PROTOCOL_VERSION;
  readonly type: 'field-failed';
  readonly id: number;
  readonly message: string;
}

export type FieldJobResult = FieldJobResponse | FieldJobFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLayout(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['kind'] === 'grid' || value['kind'] === 'volume' || value['kind'] === 'points')
  );
}

export function isFieldJobRequest(value: unknown): value is FieldJobRequest {
  return (
    isRecord(value) &&
    value['version'] === PROTOCOL_VERSION &&
    value['type'] === 'evaluate-range' &&
    typeof value['id'] === 'number' &&
    typeof value['start'] === 'number' &&
    typeof value['end'] === 'number' &&
    isRecord(value['system']) &&
    Array.isArray(value['voltages']) &&
    Array.isArray(value['currents']) &&
    isLayout(value['layout'])
  );
}
