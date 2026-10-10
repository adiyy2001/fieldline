import { viridisTable } from '../core/heatmap/color';
import { HEATMAP_PARAMS_BYTES, type HeatmapUniforms, packHeatmapParams } from './heatmap-params';
import type { ReadyDevice } from './device';
import heatmapSource from './shaders/heatmap.wgsl';

export interface HeatmapRenderer {
  setField(source: GPUBuffer | Float32Array): void;
  draw(uniforms: HeatmapUniforms): void;
  capture(uniforms: HeatmapUniforms, width: number, height: number): Promise<Uint8Array>;
  dispose(): void;
}

const CAPTURE_FORMAT: GPUTextureFormat = 'rgba8unorm';
const BYTES_PER_PIXEL = 4;
const ROW_ALIGNMENT = 256;

function alignedRowBytes(width: number): number {
  return Math.ceil((width * BYTES_PER_PIXEL) / ROW_ALIGNMENT) * ROW_ALIGNMENT;
}

export function createHeatmapRenderer(
  ready: ReadyDevice,
  canvas: HTMLCanvasElement,
  presentationFormat: GPUTextureFormat,
): HeatmapRenderer {
  const { device } = ready;
  const context = canvas.getContext('webgpu');
  if (context === null) {
    throw new Error('The canvas has no WebGPU context');
  }
  context.configure({ device, format: presentationFormat, alphaMode: 'opaque' });
  const module = device.createShaderModule({ code: heatmapSource });
  const pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  const paramsBuffer = device.createBuffer({
    size: HEATMAP_PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const palette = viridisTable();
  const paletteBuffer = device.createBuffer({
    size: palette.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paletteBuffer, 0, palette);
  let fieldBuffer: GPUBuffer | null = null;
  let bindGroups = new Map<GPURenderPipeline, GPUBindGroup>();

  function pipelineFor(format: GPUTextureFormat): GPURenderPipeline {
    const existing = pipelines.get(format);
    if (existing !== undefined) {
      return existing;
    }
    const created = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    pipelines.set(format, created);
    return created;
  }

  function bindGroupFor(pipeline: GPURenderPipeline): GPUBindGroup {
    const existing = bindGroups.get(pipeline);
    if (existing !== undefined) {
      return existing;
    }
    if (fieldBuffer === null) {
      throw new Error('The heatmap has no field, call setField first');
    }
    const created = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsBuffer } },
        { binding: 1, resource: { buffer: fieldBuffer } },
        { binding: 2, resource: { buffer: paletteBuffer } },
      ],
    });
    bindGroups.set(pipeline, created);
    return created;
  }

  function ensureFieldBuffer(byteLength: number): GPUBuffer {
    if (fieldBuffer?.size === byteLength) {
      return fieldBuffer;
    }
    fieldBuffer?.destroy();
    bindGroups = new Map();
    fieldBuffer = device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    return fieldBuffer;
  }

  function encodePass(
    pipeline: GPURenderPipeline,
    target: GPUTextureView,
    encoder: GPUCommandEncoder,
  ): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: target, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroupFor(pipeline));
    pass.draw(3);
    pass.end();
  }

  return {
    setField(source) {
      if (source instanceof Float32Array) {
        const target = ensureFieldBuffer(source.byteLength);
        device.queue.writeBuffer(target, 0, source);
        return;
      }
      const target = ensureFieldBuffer(source.size);
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(source, 0, target, 0, source.size);
      device.queue.submit([encoder.finish()]);
    },
    draw(uniforms) {
      const size = { width: canvas.width, height: canvas.height };
      device.queue.writeBuffer(paramsBuffer, 0, packHeatmapParams({ ...uniforms, ...size }));
      const encoder = device.createCommandEncoder();
      encodePass(
        pipelineFor(presentationFormat),
        context.getCurrentTexture().createView(),
        encoder,
      );
      device.queue.submit([encoder.finish()]);
    },
    async capture(uniforms, width, height) {
      device.queue.writeBuffer(paramsBuffer, 0, packHeatmapParams({ ...uniforms, width, height }));
      const texture = device.createTexture({
        size: { width, height },
        format: CAPTURE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const rowBytes = alignedRowBytes(width);
      const staging = device.createBuffer({
        size: rowBytes * height,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      try {
        const encoder = device.createCommandEncoder();
        encodePass(pipelineFor(CAPTURE_FORMAT), texture.createView(), encoder);
        encoder.copyTextureToBuffer(
          { texture },
          { buffer: staging, bytesPerRow: rowBytes },
          { width, height },
        );
        device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const padded = new Uint8Array(staging.getMappedRange().slice(0));
        staging.unmap();
        const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
        for (let row = 0; row < height; row += 1) {
          pixels.set(
            padded.subarray(row * rowBytes, row * rowBytes + width * BYTES_PER_PIXEL),
            row * width * BYTES_PER_PIXEL,
          );
        }
        return pixels;
      } finally {
        texture.destroy();
        staging.destroy();
      }
    },
    dispose() {
      fieldBuffer?.destroy();
      fieldBuffer = null;
      paramsBuffer.destroy();
      paletteBuffer.destroy();
      context.unconfigure();
    },
  };
}
