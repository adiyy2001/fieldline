import { viridisBytes } from './color';

export interface RasterSize {
  readonly width: number;
  readonly height: number;
}

export interface ScalarRaster extends RasterSize {
  readonly scalars: Float32Array;
  readonly nx: number;
  readonly nz: number;
  readonly maximum: number;
}

function sampleBilinear(
  scalars: Float32Array,
  nx: number,
  nz: number,
  lateral: number,
  along: number,
): number {
  const x = Math.min(nx - 1, Math.max(0, lateral * (nx - 1)));
  const z = Math.min(nz - 1, Math.max(0, along * (nz - 1)));
  const x0 = Math.min(nx - 2, Math.floor(x));
  const z0 = Math.min(nz - 2, Math.floor(z));
  const fx = nx > 1 ? x - x0 : 0;
  const fz = nz > 1 ? z - z0 : 0;
  const x1 = Math.min(nx - 1, x0 + 1);
  const z1 = Math.min(nz - 1, z0 + 1);
  const at = (ix: number, iz: number): number => scalars[ix + nx * iz] ?? 0;
  const bottom = at(x0, z0) * (1 - fx) + at(x1, z0) * fx;
  const top = at(x0, z1) * (1 - fx) + at(x1, z1) * fx;
  return bottom * (1 - fz) + top * fz;
}

export function paintScalarRaster(raster: ScalarRaster): Uint8ClampedArray {
  const { width, height, scalars, nx, nz, maximum } = raster;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const scale = maximum > 0 ? 1 / maximum : 0;
  for (let row = 0; row < height; row += 1) {
    const lateral = 1 - (row + 0.5) / height;
    for (let column = 0; column < width; column += 1) {
      const along = (column + 0.5) / width;
      const value = sampleBilinear(scalars, nx, nz, lateral, along);
      const [red, green, blue] = viridisBytes(value * scale);
      const offset = (row * width + column) * 4;
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
