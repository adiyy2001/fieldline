import { describe, expect, it } from 'vitest';
import { viridisBytes } from './color';
import { paintScalarRaster } from './pixels';

function pixelAt(pixels: Uint8ClampedArray, width: number, column: number, row: number) {
  const offset = (row * width + column) * 4;
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
}

describe('scalar raster painting', () => {
  it('paints a uniform field with one colour', () => {
    const scalars = new Float32Array(4 * 6).fill(2);
    const pixels = paintScalarRaster({ scalars, nx: 4, nz: 6, width: 8, height: 5, maximum: 4 });
    const [red, green, blue] = viridisBytes(0.5);
    expect(pixelAt(pixels, 8, 0, 0)).toEqual([red, green, blue, 255]);
    expect(pixelAt(pixels, 8, 7, 4)).toEqual([red, green, blue, 255]);
  });

  it('puts z on the horizontal axis and x upwards', () => {
    const nx = 3;
    const nz = 4;
    const scalars = new Float32Array(nx * nz);
    for (let iz = 0; iz < nz; iz += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        scalars[ix + nx * iz] = iz + 10 * ix;
      }
    }
    const pixels = paintScalarRaster({ scalars, nx, nz, width: 4, height: 3, maximum: 23 });
    expect(pixelAt(pixels, 4, 0, 2)).toEqual([...viridisBytes(0), 255]);
    expect(pixelAt(pixels, 4, 3, 2)).toEqual([...viridisBytes(3 / 23), 255]);
    expect(pixelAt(pixels, 4, 0, 0)).toEqual([...viridisBytes(20 / 23), 255]);
    expect(pixelAt(pixels, 4, 3, 0)).toEqual([...viridisBytes(1), 255]);
  });

  it('interpolates bilinearly between grid nodes', () => {
    const scalars = Float32Array.from([0, 2, 0, 2]);
    const pixels = paintScalarRaster({ scalars, nx: 2, nz: 2, width: 3, height: 1, maximum: 2 });
    expect(pixelAt(pixels, 3, 1, 0)).toEqual([...viridisBytes(0.5), 255]);
  });

  it('paints the lowest colour when the maximum is zero', () => {
    const pixels = paintScalarRaster({
      scalars: new Float32Array(4),
      nx: 2,
      nz: 2,
      width: 2,
      height: 2,
      maximum: 0,
    });
    expect(pixelAt(pixels, 2, 1, 1)).toEqual([...viridisBytes(0), 255]);
  });

  it('copes with a single row of pixels', () => {
    const pixels = paintScalarRaster({
      scalars: Float32Array.from([1, 1, 1, 1]),
      nx: 2,
      nz: 2,
      width: 1,
      height: 1,
      maximum: 1,
    });
    expect(pixels).toHaveLength(4);
  });
});
