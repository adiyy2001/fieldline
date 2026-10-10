export const BYTES_PER_PIXEL = 4;
const ROW_ALIGNMENT = 256;

export function alignedRowBytes(width: number): number {
  return Math.ceil((width * BYTES_PER_PIXEL) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
}

export function unpadRows(padded: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = alignedRowBytes(width);
  const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let row = 0; row < height; row += 1) {
    pixels.set(
      padded.subarray(row * rowBytes, row * rowBytes + width * BYTES_PER_PIXEL),
      row * width * BYTES_PER_PIXEL,
    );
  }
  return pixels;
}
