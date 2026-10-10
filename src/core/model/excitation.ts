import type { Complex } from '../complex';
import { phaseCurrentPhasors, phaseVoltagePhasors } from '../phasor';
import type { LineParameters } from './parameters';

export interface Excitation {
  readonly voltages: readonly Complex[];
  readonly currents: readonly Complex[];
}

const ZERO_PHASOR: Complex = { re: 0, im: 0 };

export function pickPhasors(
  phasing: readonly number[],
  phasors: readonly Complex[],
): readonly Complex[] {
  return phasing.map((phase) => phasors[phase] ?? phasors[0] ?? ZERO_PHASOR);
}

export function groupExcitation(
  parameters: LineParameters,
  phasing: readonly number[] = parameters.phasing,
): Excitation {
  const voltages = phaseVoltagePhasors(parameters.lineToLineKilovolts * 1000);
  const currents = phaseCurrentPhasors(
    parameters.currentAmperes,
    parameters.powerFactorAngleDegrees,
  );
  return { voltages: pickPhasors(phasing, voltages), currents: pickPhasors(phasing, currents) };
}
