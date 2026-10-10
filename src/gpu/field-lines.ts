import type { FieldSource } from '../core/backend/types';
import type { FieldQuantity } from '../core/exposure/levels';
import type { LineSeed, TraceBox } from '../core/fieldlines/types';
import { viridisTable } from '../core/heatmap/color';
import type { ReadyDevice } from './device';
import linesDrawSource from './shaders/lines_draw.wgsl';
import {
  SCENE_FORMAT,
  SCENE_MULTISAMPLE,
  type SceneFrameInfo,
  type SceneLayer,
  depthStencilState,
} from './scene-renderer';
import { GPU_SEGMENT_BYTES, packGpuSegments } from './segment-pack';
import { composeLinesKernel } from './shader-modules';
import { readBuffer } from './texture-readback';
import {
  DRAW_PARAMS_BYTES,
  INFO_WORDS,
  POINT_FLOATS,
  SEED_FLOATS,
  TRACE_PARAMS_BYTES,
  type TracedBuffers,
  packLineDrawParams,
  packSeeds,
  packTraceParams,
} from './trace-params';

export interface TraceRequest {
  readonly source: FieldSource;
  readonly seeds: readonly LineSeed[];
  readonly box: TraceBox;
  readonly groundHeight: number;
  readonly stepCount: number;
}

export interface TraceSelection {
  readonly quantity: FieldQuantity;
  readonly phaseRadians: number;
}

export interface FieldLinesLayer extends SceneLayer {
  load(request: TraceRequest): void;
  trace(selection: TraceSelection): void;
  setMaximum(maximum: number): void;
  read(): Promise<TracedBuffers>;
  lineCount(): number;
  dispose(): void;
}

export function createFieldLinesLayer(ready: ReadyDevice): FieldLinesLayer {
  const { device } = ready;
  const traceModule = device.createShaderModule({ code: composeLinesKernel() });
  const tracePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: traceModule, entryPoint: 'traceMain' },
  });
  const drawModule = device.createShaderModule({ code: linesDrawSource });
  const drawPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: drawModule, entryPoint: 'vertexMain' },
    fragment: {
      module: drawModule,
      entryPoint: 'fragmentMain',
      targets: [{ format: SCENE_FORMAT }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: depthStencilState(true),
    multisample: SCENE_MULTISAMPLE,
  });
  const traceParams = device.createBuffer({
    size: TRACE_PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const drawParams = device.createBuffer({
    size: DRAW_PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const palette = viridisTable();
  const paletteBuffer = device.createBuffer({
    size: palette.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paletteBuffer, 0, palette);
  let loaded: TraceRequest | null = null;
  let segmentBuffer: GPUBuffer | null = null;
  let seedBuffer: GPUBuffer | null = null;
  let pointBuffer: GPUBuffer | null = null;
  let magnitudeBuffer: GPUBuffer | null = null;
  let infoBuffer: GPUBuffer | null = null;
  let traceGroup: GPUBindGroup | null = null;
  let drawGroup: GPUBindGroup | null = null;
  let lines = 0;
  let steps = 0;
  let maximum = 1;
  let traced = false;

  function releaseBuffers(): void {
    [segmentBuffer, seedBuffer, pointBuffer, magnitudeBuffer, infoBuffer].forEach((buffer) => {
      buffer?.destroy();
    });
    segmentBuffer = null;
    seedBuffer = null;
    pointBuffer = null;
    magnitudeBuffer = null;
    infoBuffer = null;
    traceGroup = null;
    drawGroup = null;
  }

  return {
    load(request) {
      releaseBuffers();
      loaded = request;
      lines = request.seeds.length;
      steps = request.stepCount;
      traced = false;
      const segments = packGpuSegments(request.source, { x: 0, y: 0, z: 0 });
      const stride = steps + 1;
      const create = (size: number, usage: GPUBufferUsageFlags) =>
        device.createBuffer({ size: Math.max(16, size), usage });
      segmentBuffer = create(
        Math.max(segments.byteLength, GPU_SEGMENT_BYTES),
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      );
      seedBuffer = create(
        Math.max(1, lines) * SEED_FLOATS * Float32Array.BYTES_PER_ELEMENT,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      );
      pointBuffer = create(
        Math.max(1, lines) * stride * POINT_FLOATS * Float32Array.BYTES_PER_ELEMENT,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      );
      magnitudeBuffer = create(
        Math.max(1, lines) * stride * Float32Array.BYTES_PER_ELEMENT,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      );
      infoBuffer = create(
        Math.max(1, lines) * INFO_WORDS * Uint32Array.BYTES_PER_ELEMENT,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      );
      device.queue.writeBuffer(segmentBuffer, 0, segments);
      device.queue.writeBuffer(seedBuffer, 0, packSeeds(request.seeds));
      traceGroup = device.createBindGroup({
        layout: tracePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: traceParams } },
          { binding: 1, resource: { buffer: segmentBuffer } },
          { binding: 2, resource: { buffer: seedBuffer } },
          { binding: 3, resource: { buffer: pointBuffer } },
          { binding: 4, resource: { buffer: magnitudeBuffer } },
          { binding: 5, resource: { buffer: infoBuffer } },
        ],
      });
      drawGroup = device.createBindGroup({
        layout: drawPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: drawParams } },
          { binding: 1, resource: { buffer: pointBuffer } },
          { binding: 2, resource: { buffer: magnitudeBuffer } },
          { binding: 3, resource: { buffer: infoBuffer } },
          { binding: 4, resource: { buffer: paletteBuffer } },
        ],
      });
    },
    trace(selection) {
      if (loaded === null || traceGroup === null) {
        throw new Error('The field lines have no input, call load first');
      }
      device.queue.writeBuffer(
        traceParams,
        0,
        packTraceParams({
          box: loaded.box,
          groundHeight: loaded.groundHeight,
          phaseRadians: selection.phaseRadians,
          quantity: selection.quantity,
          segmentCount: loaded.source.system.set.count,
          stepCount: steps,
          lineCount: lines,
        }),
      );
      if (lines > 0) {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(tracePipeline);
        pass.setBindGroup(0, traceGroup);
        pass.dispatchWorkgroups(lines);
        pass.end();
        device.queue.submit([encoder.finish()]);
      }
      traced = true;
    },
    setMaximum(next) {
      maximum = next;
    },
    lineCount: () => lines,
    async read() {
      if (pointBuffer === null || magnitudeBuffer === null || infoBuffer === null) {
        throw new Error('The field lines have no input, call load first');
      }
      const stride = steps + 1;
      const [points, magnitudes, info] = await Promise.all([
        readBuffer(device, pointBuffer, lines * stride * POINT_FLOATS * 4),
        readBuffer(device, magnitudeBuffer, lines * stride * 4),
        readBuffer(device, infoBuffer, lines * INFO_WORDS * 4),
      ]);
      return {
        points: new Float32Array(points),
        magnitudes: new Float32Array(magnitudes),
        info: new Uint32Array(info),
        lineCount: lines,
        stepCount: steps,
      };
    },
    prepare(info: SceneFrameInfo) {
      device.queue.writeBuffer(
        drawParams,
        0,
        packLineDrawParams({
          viewProjection: info.viewProjection,
          width: info.width,
          height: info.height,
          seconds: info.seconds,
          maximum,
          lineCount: lines,
          stepCount: steps,
        }),
      );
    },
    draw(pass) {
      if (!traced || drawGroup === null || lines === 0) {
        return;
      }
      pass.setPipeline(drawPipeline);
      pass.setBindGroup(0, drawGroup);
      pass.draw(6, lines * steps);
    },
    dispose() {
      releaseBuffers();
      traceParams.destroy();
      drawParams.destroy();
      paletteBuffer.destroy();
    },
  };
}
