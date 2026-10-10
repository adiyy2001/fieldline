import { gpuCaseTable } from './case-table-buffer';
import type { ReadyDevice } from './device';
import surfaceDrawSource from './shaders/surface_draw.wgsl';
import {
  ALPHA_BLEND,
  SCENE_FORMAT,
  SCENE_MULTISAMPLE,
  type SceneFrameInfo,
  type SceneLayer,
  depthStencilState,
} from './scene-renderer';
import { composeMarchingCubes } from './shader-modules';
import {
  EXTRACT_PARAMS_BYTES,
  INDIRECT_ARGUMENT_BYTES,
  INDIRECT_ARGUMENT_WORDS,
  MAXIMUM_SURFACE_LEVELS,
  PRODUCED_COUNTER_WORD,
  SURFACE_COLORS,
  SURFACE_DRAW_BYTES,
  SURFACE_VERTEX_BYTES,
  packExtractParams,
  packSurfaceDraw,
  usableVertexCount,
  vertexCapacityFor,
} from './surface-params';
import { readBuffer } from './texture-readback';
import type { VolumeField } from './volume-field';

export interface SurfaceCounts {
  readonly produced: number;
  readonly drawn: number;
  readonly capacity: number;
}

export interface IsosurfaceLayer extends SceneLayer {
  extract(levels: readonly number[]): void;
  counts(): Promise<readonly SurfaceCounts[]>;
  readVertices(level: number): Promise<Float32Array>;
  dispose(): void;
}

interface LevelSlot {
  readonly params: GPUBuffer;
  readonly vertices: GPUBuffer;
  readonly arguments: GPUBuffer;
  readonly extractGroup: GPUBindGroup;
  readonly finalizeGroup: GPUBindGroup;
  readonly drawGroup: GPUBindGroup;
}

export function createIsosurfaceLayer(ready: ReadyDevice, field: VolumeField): IsosurfaceLayer {
  const { device } = ready;
  const table = gpuCaseTable();
  const { spec } = field;
  const cellCount = (spec.nx - 1) * (spec.ny - 1) * (spec.nz - 1);
  const capacity = vertexCapacityFor(cellCount, device.limits.maxStorageBufferBindingSize);
  const extractModule = device.createShaderModule({
    code: composeMarchingCubes(table.caseOffset, table.caseStride),
  });
  const extractPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: extractModule, entryPoint: 'extractMain' },
  });
  const finalizePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: extractModule, entryPoint: 'finalizeMain' },
  });
  const drawModule = device.createShaderModule({ code: surfaceDrawSource });
  const drawPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: drawModule, entryPoint: 'vertexMain' },
    fragment: {
      module: drawModule,
      entryPoint: 'fragmentMain',
      targets: [
        {
          format: SCENE_FORMAT,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: ALPHA_BLEND.alpha,
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depthStencilState(false),
    multisample: SCENE_MULTISAMPLE,
  });
  const caseBuffer = device.createBuffer({
    size: table.data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(caseBuffer, 0, table.data);
  const drawBuffer = device.createBuffer({
    size: SURFACE_DRAW_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const slots: LevelSlot[] = [];
  let activeLevels = 0;

  function createSlot(): LevelSlot {
    const params = device.createBuffer({
      size: EXTRACT_PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const vertices = device.createBuffer({
      size: capacity * SURFACE_VERTEX_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const args = device.createBuffer({
      size: INDIRECT_ARGUMENT_BYTES,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.INDIRECT |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
    return {
      params,
      vertices,
      arguments: args,
      extractGroup: device.createBindGroup({
        layout: extractPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: params } },
          { binding: 1, resource: { buffer: field.magnitudes } },
          { binding: 2, resource: { buffer: caseBuffer } },
          { binding: 3, resource: { buffer: vertices } },
          { binding: 4, resource: { buffer: args } },
        ],
      }),
      finalizeGroup: device.createBindGroup({
        layout: finalizePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: params } },
          { binding: 4, resource: { buffer: args } },
        ],
      }),
      drawGroup: device.createBindGroup({
        layout: drawPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: drawBuffer } },
          { binding: 1, resource: { buffer: vertices } },
        ],
      }),
    };
  }

  function slotAt(index: number): LevelSlot {
    while (slots.length <= index) {
      slots.push(createSlot());
    }
    const slot = slots[index];
    if (slot === undefined) {
      throw new RangeError(`Level slot ${String(index)} does not exist`);
    }
    return slot;
  }

  return {
    extract(levels) {
      const used = levels.slice(0, MAXIMUM_SURFACE_LEVELS);
      activeLevels = used.length;
      const encoder = device.createCommandEncoder();
      used.forEach((level, index) => {
        const slot = slotAt(index);
        device.queue.writeBuffer(slot.params, 0, packExtractParams(spec, level, index, capacity));
        device.queue.writeBuffer(slot.arguments, 0, new Uint32Array(INDIRECT_ARGUMENT_WORDS));
        const pass = encoder.beginComputePass();
        pass.setPipeline(extractPipeline);
        pass.setBindGroup(0, slot.extractGroup);
        pass.dispatchWorkgroups(
          Math.ceil((spec.nx - 1) / 4),
          Math.ceil((spec.ny - 1) / 4),
          Math.ceil((spec.nz - 1) / 4),
        );
        pass.end();
        const finalizing = encoder.beginComputePass();
        finalizing.setPipeline(finalizePipeline);
        finalizing.setBindGroup(0, slot.finalizeGroup);
        finalizing.dispatchWorkgroups(1);
        finalizing.end();
      });
      device.queue.submit([encoder.finish()]);
    },
    async counts() {
      const result: SurfaceCounts[] = [];
      for (let index = 0; index < activeLevels; index += 1) {
        const words = new Uint32Array(
          await readBuffer(device, slotAt(index).arguments, INDIRECT_ARGUMENT_BYTES),
        );
        const produced = words[PRODUCED_COUNTER_WORD] ?? 0;
        result.push({ produced, drawn: words[0] ?? 0, capacity });
      }
      return result;
    },
    async readVertices(level) {
      const slot = slotAt(level);
      const words = new Uint32Array(
        await readBuffer(device, slot.arguments, INDIRECT_ARGUMENT_BYTES),
      );
      const count = usableVertexCount(words[PRODUCED_COUNTER_WORD] ?? 0, capacity);
      return count === 0
        ? new Float32Array(0)
        : new Float32Array(await readBuffer(device, slot.vertices, count * SURFACE_VERTEX_BYTES));
    },
    prepare(info: SceneFrameInfo) {
      device.queue.writeBuffer(
        drawBuffer,
        0,
        packSurfaceDraw(info.viewProjection, info.cameraPosition, SURFACE_COLORS),
      );
    },
    draw(pass) {
      pass.setPipeline(drawPipeline);
      for (let index = 0; index < activeLevels; index += 1) {
        const slot = slotAt(index);
        pass.setBindGroup(0, slot.drawGroup);
        pass.drawIndirect(slot.arguments, 0);
      }
    },
    dispose() {
      slots.forEach((slot) => {
        slot.params.destroy();
        slot.vertices.destroy();
        slot.arguments.destroy();
      });
      slots.length = 0;
      caseBuffer.destroy();
      drawBuffer.destroy();
    },
  };
}
