import { LINE_CHARGE_FIELD_CONSTANT, LINE_CURRENT_FIELD_CONSTANT, TWO_PI } from '../constants';
import { VACUUM_PERMITTIVITY } from '../constants';

export interface SingleConductor {
  readonly voltage: number;
  readonly height: number;
  readonly radius: number;
}

export function lineCharge(conductor: SingleConductor): number {
  return (
    (TWO_PI * VACUUM_PERMITTIVITY * conductor.voltage) /
    Math.log((2 * conductor.height) / conductor.radius)
  );
}

export function singleConductorPotential(conductor: SingleConductor, x: number, y: number): number {
  const charge = lineCharge(conductor);
  const direct = Math.hypot(x, y - conductor.height);
  const image = Math.hypot(x, y + conductor.height);
  return LINE_CHARGE_FIELD_CONSTANT * charge * Math.log(image / direct);
}

export function singleConductorField(
  conductor: SingleConductor,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  const charge = lineCharge(conductor);
  const directY = y - conductor.height;
  const imageY = y + conductor.height;
  const directSquared = x * x + directY * directY;
  const imageSquared = x * x + imageY * imageY;
  return {
    x: LINE_CHARGE_FIELD_CONSTANT * charge * (x / directSquared - x / imageSquared),
    y: LINE_CHARGE_FIELD_CONSTANT * charge * (directY / directSquared - imageY / imageSquared),
  };
}

export function longConductorFluxDensity(current: number, distance: number): number {
  return (LINE_CURRENT_FIELD_CONSTANT * current) / distance;
}
