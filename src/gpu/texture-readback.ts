import { alignedRowBytes, unpadRows } from './row-padding';

export async function readBuffer(
  device: GPUDevice,
  source: GPUBuffer,
  byteLength: number,
): Promise<ArrayBuffer> {
  const staging = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(source, 0, staging, 0, byteLength);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const copy = staging.getMappedRange().slice(0);
    staging.unmap();
    return copy;
  } finally {
    staging.destroy();
  }
}

export async function readRgbaTexture(
  device: GPUDevice,
  encode: (encoder: GPUCommandEncoder, staging: GPUBuffer, rowBytes: number) => void,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const rowBytes = alignedRowBytes(width);
  const staging = device.createBuffer({
    size: rowBytes * height,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const encoder = device.createCommandEncoder();
    encode(encoder, staging, rowBytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(staging.getMappedRange().slice(0));
    staging.unmap();
    return unpadRows(padded, width, height);
  } finally {
    staging.destroy();
  }
}
