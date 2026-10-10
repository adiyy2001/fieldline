import { describe, expect, it } from 'vitest';
import {
  FLOAT_BITS,
  FLOAT_WORDS,
  MARCH_PARAMS_BYTES,
  PACK_PARAMS_BYTES,
  decodeStatsWords,
  displayMaximum,
  packMarchParams,
  packPackParams,
  pointCountOf,
  referenceLengthOf,
} from './volume-params';

describe('volume pack parameters', () => {
  it('writes the dimensions, the count, the quantity offset and the phase', () => {
    const buffer = packPackParams({
      dims: { nx: 4, ny: 5, nz: 6 },
      quantity: 'magnetic',
      mode: 'instantaneous',
      phaseRadians: Math.PI / 3,
    });
    expect(buffer.byteLength).toBe(PACK_PARAMS_BYTES);
    const words = new Uint32Array(buffer);
    const floats = new Float32Array(buffer);
    expect(Array.from(words.subarray(0, 6))).toEqual([4, 5, 6, 120, 6, 1]);
    expect(floats[8]).toBeCloseTo(0.5, 6);
    expect(floats[9]).toBeCloseTo(Math.sqrt(3) / 2, 6);
    expect(floats[10]).toBe(1);
  });

  it('uses the kilovolt scale for the electric field and rms mode', () => {
    const floats = new Float32Array(
      packPackParams({
        dims: { nx: 1, ny: 1, nz: 1 },
        quantity: 'electric',
        mode: 'rms',
        phaseRadians: 0,
      }),
    );
    expect(floats[10]).toBeCloseTo(0.001, 9);
    expect(pointCountOf({ nx: 64, ny: 64, nz: 128 })).toBe(524_288);
  });

  it('decodes the float bit patterns of the maxima', () => {
    FLOAT_BITS[0] = 12.5;
    const electric = FLOAT_WORDS[0] ?? 0;
    FLOAT_BITS[0] = 3.25;
    const magnetic = FLOAT_WORDS[0] ?? 0;
    expect(decodeStatsWords(Uint32Array.of(electric, magnetic, 0, 0))).toEqual({
      electric: 12.5,
      magnetic: 3.25,
    });
  });

  it('scales the maximum by the square root of two in instantaneous mode', () => {
    const peaks = { electric: 10, magnetic: 40 };
    expect(displayMaximum('electric', 'rms', peaks)).toBe(10);
    expect(displayMaximum('magnetic', 'instantaneous', peaks)).toBeCloseTo(40 * Math.SQRT2, 12);
  });
});

describe('ray march parameters', () => {
  it('lays the matrix, camera, box, steps and viewport out as the shader reads them', () => {
    const matrix = Float32Array.from({ length: 16 }, (_, index) => index);
    const buffer = packMarchParams({
      inverseViewProjection: matrix,
      cameraPosition: { x: 1, y: 2, z: 3 },
      box: { min: { x: -1, y: -2, z: -3 }, max: { x: 4, y: 5, z: 6 } },
      dims: { nx: 8, ny: 9, nz: 10 },
      steps: 96,
      maximum: 7,
      referenceLength: 2.5,
      width: 640,
      height: 400,
    });
    expect(buffer.byteLength).toBe(MARCH_PARAMS_BYTES);
    const floats = Array.from(new Float32Array(buffer));
    expect(floats.slice(0, 16)).toEqual(Array.from(matrix));
    expect(floats.slice(16, 36)).toEqual([
      1, 2, 3, 0, -1, -2, -3, 7, 4, 5, 6, 96, 8, 9, 10, 2.5, 640, 400, 0, 0,
    ]);
  });

  it('uses a reference step of about a ninety sixth of the box diagonal', () => {
    const length = referenceLengthOf({ min: { x: 0, y: 0, z: 0 }, max: { x: 96, y: 0, z: 0 } });
    expect(length).toBe(1);
  });
});
