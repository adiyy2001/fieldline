import { LINE_CHARGE_FIELD_CONSTANT, LINE_CURRENT_FIELD_CONSTANT } from '../constants';
import { ZERO } from '../complex';
import type { ComplexSeries } from '../field-types';
import type { ComplexVector3 } from '../phasor';
import type { CrossSection } from './cross-section';

export function potentialAt(
  section: CrossSection,
  charges: ComplexSeries,
  x: number,
  y: number,
): { re: number; im: number } {
  let re = 0;
  let im = 0;
  section.wires.forEach((wire, index) => {
    const direct = Math.max(Math.hypot(x - wire.x, y - wire.y), wire.radius);
    const image = Math.max(Math.hypot(x - wire.x, y + wire.y), wire.radius);
    const logRatio = Math.log(image / direct);
    re += (charges.re[index] ?? 0) * logRatio;
    im += (charges.im[index] ?? 0) * logRatio;
  });
  return {
    re: re * LINE_CHARGE_FIELD_CONSTANT,
    im: im * LINE_CHARGE_FIELD_CONSTANT,
  };
}

export function electricFieldAt(
  section: CrossSection,
  charges: ComplexSeries,
  x: number,
  y: number,
): ComplexVector3 {
  let xRe = 0;
  let xIm = 0;
  let yRe = 0;
  let yIm = 0;
  section.wires.forEach((wire, index) => {
    const dx = x - wire.x;
    const dyDirect = y - wire.y;
    const dyImage = y + wire.y;
    const radiusSquared = wire.radius * wire.radius;
    const direct = 1 / Math.max(dx * dx + dyDirect * dyDirect, radiusSquared);
    const image = 1 / Math.max(dx * dx + dyImage * dyImage, radiusSquared);
    const horizontal = dx * (direct - image);
    const vertical = dyDirect * direct - dyImage * image;
    const chargeRe = charges.re[index] ?? 0;
    const chargeIm = charges.im[index] ?? 0;
    xRe += chargeRe * horizontal;
    xIm += chargeIm * horizontal;
    yRe += chargeRe * vertical;
    yIm += chargeIm * vertical;
  });
  const k = LINE_CHARGE_FIELD_CONSTANT;
  return {
    x: { re: xRe * k, im: xIm * k },
    y: { re: yRe * k, im: yIm * k },
    z: ZERO,
  };
}

export function magneticFieldAt(
  section: CrossSection,
  currents: ComplexSeries,
  x: number,
  y: number,
): ComplexVector3 {
  let xRe = 0;
  let xIm = 0;
  let yRe = 0;
  let yIm = 0;
  section.wires.forEach((wire, index) => {
    const dx = x - wire.x;
    const dy = y - wire.y;
    const inverse = 1 / Math.max(dx * dx + dy * dy, wire.radius * wire.radius);
    const currentRe = currents.re[index] ?? 0;
    const currentIm = currents.im[index] ?? 0;
    xRe -= currentRe * dy * inverse;
    xIm -= currentIm * dy * inverse;
    yRe += currentRe * dx * inverse;
    yIm += currentIm * dx * inverse;
  });
  const k = LINE_CURRENT_FIELD_CONSTANT;
  return {
    x: { re: xRe * k, im: xIm * k },
    y: { re: yRe * k, im: yIm * k },
    z: ZERO,
  };
}
