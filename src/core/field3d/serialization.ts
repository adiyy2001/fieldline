import type { ReferenceSpan } from '../geometry/discretize';
import { type ChargeSystem, chargeSystemFromBasis } from './charge-system';

export interface SerializedChargeSystem {
  readonly count: number;
  readonly groupCount: number;
  readonly reference: ReferenceSpan;
  readonly data: Float64Array;
  readonly groups: Int32Array;
  readonly conductors: Int32Array;
  readonly spans: Int32Array;
  readonly basisCharges: Float64Array;
}

export function serializeChargeSystem(system: ChargeSystem): SerializedChargeSystem {
  const { set, groupCount } = system;
  const basisCharges = new Float64Array(groupCount * set.count);
  system.basisCharges.forEach((charges, group) => basisCharges.set(charges, group * set.count));
  return {
    count: set.count,
    groupCount,
    reference: system.reference,
    data: set.data,
    groups: set.groups,
    conductors: set.conductors,
    spans: set.spans,
    basisCharges,
  };
}

export function deserializeChargeSystem(serialized: SerializedChargeSystem): ChargeSystem {
  const { count, groupCount } = serialized;
  const basis = Array.from({ length: groupCount }, (_, group) =>
    serialized.basisCharges.slice(group * count, (group + 1) * count),
  );
  return chargeSystemFromBasis(
    {
      count,
      data: serialized.data,
      groups: serialized.groups,
      conductors: serialized.conductors,
      spans: serialized.spans,
    },
    groupCount,
    serialized.reference,
    basis,
  );
}

export function transferablesOf(serialized: SerializedChargeSystem): ArrayBuffer[] {
  return [
    serialized.data.buffer,
    serialized.groups.buffer,
    serialized.conductors.buffer,
    serialized.spans.buffer,
    serialized.basisCharges.buffer,
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}
