export interface Catenary {
  readonly span: number;
  readonly sag: number;
  readonly parameter: number;
}

const MAX_NEWTON_ITERATIONS = 60;
const RELATIVE_STEP_TOLERANCE = 1e-12;

function sagResidual(parameter: number, span: number, sag: number): number {
  const half = span / (2 * parameter);
  const halfSinh = Math.sinh(half / 2);
  return 2 * parameter * halfSinh * halfSinh - sag;
}

function sagDerivative(parameter: number, span: number): number {
  const half = span / (2 * parameter);
  const halfSinh = Math.sinh(half / 2);
  return 2 * halfSinh * halfSinh - half * Math.sinh(half);
}

export function catenaryParameter(span: number, sag: number): number {
  if (!(span > 0)) {
    throw new RangeError('The span must be positive');
  }
  if (sag < 0) {
    throw new RangeError('The sag must not be negative');
  }
  if (sag === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let parameter = (span * span) / (8 * sag);
  for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS; iteration += 1) {
    const step = sagResidual(parameter, span, sag) / sagDerivative(parameter, span);
    parameter -= step;
    if (Math.abs(step) <= RELATIVE_STEP_TOLERANCE * Math.abs(parameter)) {
      return parameter;
    }
  }
  throw new RangeError('The catenary parameter did not converge');
}

export function createCatenary(span: number, sag: number): Catenary {
  return { span, sag, parameter: catenaryParameter(span, sag) };
}

export function heightAboveLowPoint(catenary: Catenary, z: number): number {
  if (!Number.isFinite(catenary.parameter)) {
    return 0;
  }
  const offset = (z - catenary.span / 2) / catenary.parameter;
  const halfSinh = Math.sinh(offset / 2);
  return 2 * catenary.parameter * halfSinh * halfSinh;
}

export function heightAt(catenary: Catenary, attachmentHeight: number, z: number): number {
  return attachmentHeight - catenary.sag + heightAboveLowPoint(catenary, z);
}

export function catenaryLength(catenary: Catenary): number {
  if (!Number.isFinite(catenary.parameter)) {
    return catenary.span;
  }
  return 2 * catenary.parameter * Math.sinh(catenary.span / (2 * catenary.parameter));
}
