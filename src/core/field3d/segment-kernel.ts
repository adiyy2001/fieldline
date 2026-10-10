import { ELECTRIC_CONSTANT, MAGNETIC_CONSTANT } from '../constants';
import { SEGMENT_STRIDE } from './segment-set';

export const DIRECT = 1;
export const IMAGE = -1;
export const TERMS_LENGTH = 11;

export function createTerms(): Float64Array {
  return new Float64Array(TERMS_LENGTH);
}

interface SegmentFrame {
  readonly data: Float64Array;
  readonly offset: number;
}

function fillTerms(
  { data, offset }: SegmentFrame,
  ySign: number,
  px: number,
  py: number,
  pz: number,
  terms: Float64Array,
): void {
  const ux = data[offset + 3] ?? 0;
  const uy = ySign * (data[offset + 4] ?? 0);
  const uz = data[offset + 5] ?? 0;
  const length = data[offset + 6] ?? 0;
  const radius = data[offset + 7] ?? 0;
  const sx = px - (data[offset] ?? 0);
  const sy = py - ySign * (data[offset + 1] ?? 0);
  const sz = pz - (data[offset + 2] ?? 0);
  const along = sx * ux + sy * uy + sz * uz;
  const rx = sx - along * ux;
  const ry = sy - along * uy;
  const rz = sz - along * uz;
  const rho = Math.max(Math.sqrt(rx * rx + ry * ry + rz * rz), radius);
  const remaining = length - along;
  const nearDistance = Math.sqrt(along * along + rho * rho);
  const farDistance = Math.sqrt(remaining * remaining + rho * rho);
  terms[0] = rx / rho;
  terms[1] = ry / rho;
  terms[2] = rz / rho;
  terms[3] = ux;
  terms[4] = uy;
  terms[5] = uz;
  terms[6] = (remaining / farDistance + along / nearDistance) / rho;
  terms[7] = 1 / farDistance - 1 / nearDistance;
  terms[8] = along;
  terms[9] = rho;
  terms[10] = remaining;
}

function potentialFromTerms(terms: Float64Array): number {
  const rho = terms[9] ?? 1;
  return (
    ELECTRIC_CONSTANT * (Math.asinh((terms[10] ?? 0) / rho) + Math.asinh((terms[8] ?? 0) / rho))
  );
}

export function segmentPotential(
  data: Float64Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  terms: Float64Array,
): number {
  fillTerms({ data, offset: index * SEGMENT_STRIDE }, DIRECT, px, py, pz, terms);
  return potentialFromTerms(terms);
}

export function segmentPotentialWithImage(
  data: Float64Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  terms: Float64Array,
): number {
  const frame = { data, offset: index * SEGMENT_STRIDE };
  fillTerms(frame, DIRECT, px, py, pz, terms);
  const direct = potentialFromTerms(terms);
  fillTerms(frame, IMAGE, px, py, pz, terms);
  return direct - potentialFromTerms(terms);
}

function writeElectric(terms: Float64Array, sign: number, out: Float64Array): void {
  const radial = (terms[6] ?? 0) * ELECTRIC_CONSTANT * sign;
  const axial = (terms[7] ?? 0) * ELECTRIC_CONSTANT * sign;
  out[0] = (out[0] ?? 0) + radial * (terms[0] ?? 0) + axial * (terms[3] ?? 0);
  out[1] = (out[1] ?? 0) + radial * (terms[1] ?? 0) + axial * (terms[4] ?? 0);
  out[2] = (out[2] ?? 0) + radial * (terms[2] ?? 0) + axial * (terms[5] ?? 0);
}

export function segmentElectricField(
  data: Float64Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  terms: Float64Array,
  out: Float64Array,
): void {
  out.fill(0);
  fillTerms({ data, offset: index * SEGMENT_STRIDE }, DIRECT, px, py, pz, terms);
  writeElectric(terms, 1, out);
}

export function segmentElectricFieldWithImage(
  data: Float64Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  terms: Float64Array,
  out: Float64Array,
): void {
  out.fill(0);
  const frame = { data, offset: index * SEGMENT_STRIDE };
  fillTerms(frame, DIRECT, px, py, pz, terms);
  writeElectric(terms, 1, out);
  fillTerms(frame, IMAGE, px, py, pz, terms);
  writeElectric(terms, -1, out);
}

export function segmentMagneticField(
  data: Float64Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  terms: Float64Array,
  out: Float64Array,
): void {
  fillTerms({ data, offset: index * SEGMENT_STRIDE }, DIRECT, px, py, pz, terms);
  writeMagnetic(terms, out);
}

function writeMagnetic(terms: Float64Array, out: Float64Array): void {
  const k = (terms[6] ?? 0) * MAGNETIC_CONSTANT;
  const rx = terms[0] ?? 0;
  const ry = terms[1] ?? 0;
  const rz = terms[2] ?? 0;
  const ux = terms[3] ?? 0;
  const uy = terms[4] ?? 0;
  const uz = terms[5] ?? 0;
  out[0] = k * (uy * rz - uz * ry);
  out[1] = k * (uz * rx - ux * rz);
  out[2] = k * (ux * ry - uy * rx);
}

export interface SegmentFieldBuffers {
  readonly direct: Float64Array;
  readonly image: Float64Array;
  readonly electric: Float64Array;
  readonly magnetic: Float64Array;
}

export function createFieldBuffers(): SegmentFieldBuffers {
  return {
    direct: createTerms(),
    image: createTerms(),
    electric: new Float64Array(3),
    magnetic: new Float64Array(3),
  };
}

export function segmentFieldsWithImage(
  data: Float64Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  buffers: SegmentFieldBuffers,
): void {
  const frame = { data, offset: index * SEGMENT_STRIDE };
  const { direct, image, electric, magnetic } = buffers;
  electric.fill(0);
  fillTerms(frame, DIRECT, px, py, pz, direct);
  writeElectric(direct, 1, electric);
  fillTerms(frame, IMAGE, px, py, pz, image);
  writeElectric(image, -1, electric);
  writeMagnetic(direct, magnetic);
}
