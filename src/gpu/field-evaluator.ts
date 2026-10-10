import { layoutCenter, layoutPointCount } from '../core/backend/layout';
import {
  FIELD_COMPONENTS,
  type FieldBackend,
  type FieldBuffer,
  type FieldSource,
  type GridSpec,
  type PointLayout,
  type VolumeSpec,
} from '../core/backend/types';
import type { ReadyDevice } from './device';
import {
  PARAMS_BYTES,
  kernelKindOf,
  packParams,
  packPointsRelativeTo,
  workgroupCounts,
} from './dispatch-layout';
import { GPU_SEGMENT_BYTES, packGpuSegments } from './segment-pack';
import {
  DEFAULT_WORKGROUPS,
  type KernelKind,
  type KernelOptions,
  composeKernel,
} from './shader-modules';

export interface GpuFieldBuffer extends FieldBuffer {
  readonly buffer: GPUBuffer;
  readonly byteLength: number;
}

export interface KernelTimings {
  readonly kernel: KernelKind;
  readonly pointCount: number;
  readonly segmentCount: number;
  readonly wallMilliseconds: number;
  readonly gpuMilliseconds: number | null;
}

export interface GpuFieldBackend extends FieldBackend {
  readonly kind: 'gpu';
  lastTimings(): KernelTimings | null;
}

export interface GpuBackendOptions {
  readonly tiled?: boolean;
  readonly groundWorkgroup?: number;
}

const NANOSECONDS_PER_MILLISECOND = 1e6;
const TIMESTAMP_BYTES = 16;

function kernelOptionsFor(kind: KernelKind, options: GpuBackendOptions): KernelOptions {
  const side = options.groundWorkgroup;
  const workgroup =
    kind === 'ground' && side !== undefined ? { x: side, y: side, z: 1 } : DEFAULT_WORKGROUPS[kind];
  return { tiled: options.tiled ?? true, workgroup };
}

async function readFloats(device: GPUDevice, source: GPUBuffer, byteLength: number) {
  const staging = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(source, 0, staging, 0, byteLength);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    return values;
  } finally {
    staging.destroy();
  }
}

async function readTimestamps(device: GPUDevice, resolved: GPUBuffer): Promise<number> {
  const staging = device.createBuffer({
    size: TIMESTAMP_BYTES,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(resolved, 0, staging, 0, TIMESTAMP_BYTES);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const ticks = new BigUint64Array(staging.getMappedRange().slice(0));
    staging.unmap();
    return Number((ticks[1] ?? 0n) - (ticks[0] ?? 0n)) / NANOSECONDS_PER_MILLISECOND;
  } finally {
    staging.destroy();
  }
}

export function createGpuFieldBackend(
  ready: ReadyDevice,
  options: GpuBackendOptions = {},
): GpuFieldBackend {
  const { device } = ready;
  const pipelines = new Map<KernelKind, Promise<GPUComputePipeline>>();
  const owned = new Set<GPUBuffer>();
  let source: FieldSource | null = null;
  let timings: KernelTimings | null = null;

  function pipelineFor(kind: KernelKind): Promise<GPUComputePipeline> {
    const existing = pipelines.get(kind);
    if (existing !== undefined) {
      return existing;
    }
    const module = device.createShaderModule({
      code: composeKernel(kind, kernelOptionsFor(kind, options)),
    });
    const created = device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });
    pipelines.set(kind, created);
    return created;
  }

  function releaseBuffer(buffer: GPUBuffer): void {
    owned.delete(buffer);
    buffer.destroy();
  }

  async function evaluate(layout: PointLayout): Promise<GpuFieldBuffer> {
    if (source === null) {
      throw new Error('The GPU backend has no charge system, call load first');
    }
    const kind = kernelKindOf(layout);
    const pointCount = layoutPointCount(layout);
    const byteLength = pointCount * FIELD_COMPONENTS * Float32Array.BYTES_PER_ELEMENT;
    if (byteLength > device.limits.maxStorageBufferBindingSize) {
      throw new RangeError(`${pointCount} points need more than the storage buffer limit`);
    }
    const pipeline = await pipelineFor(kind);
    const origin = layoutCenter(layout);
    const segmentData = packGpuSegments(source, origin);
    const segmentCount = source.system.set.count;
    const workgroup = kernelOptionsFor(kind, options).workgroup;
    const transient: GPUBuffer[] = [];
    device.pushErrorScope('validation');
    const paramsBuffer = device.createBuffer({
      size: PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const segmentBuffer = device.createBuffer({
      size: Math.max(segmentData.byteLength, GPU_SEGMENT_BYTES),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const outputBuffer = device.createBuffer({
      size: Math.max(byteLength, FIELD_COMPONENTS * Float32Array.BYTES_PER_ELEMENT),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    transient.push(paramsBuffer, segmentBuffer);
    device.queue.writeBuffer(paramsBuffer, 0, packParams(layout, origin, segmentCount));
    device.queue.writeBuffer(segmentBuffer, 0, segmentData);
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: { buffer: segmentBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ];
    if (layout.kind === 'points') {
      const packed = packPointsRelativeTo(layout.coordinates, origin);
      const pointBuffer = device.createBuffer({
        size: Math.max(packed.byteLength, 16),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(pointBuffer, 0, packed);
      transient.push(pointBuffer);
      entries.push({ binding: 3, resource: { buffer: pointBuffer } });
    }
    const querySet = ready.timestampQuery
      ? device.createQuerySet({ type: 'timestamp', count: 2 })
      : null;
    const resolved =
      querySet === null
        ? null
        : device.createBuffer({
            size: TIMESTAMP_BYTES,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          });
    const started = performance.now();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass(
      querySet === null
        ? {}
        : {
            timestampWrites: {
              querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          },
    );
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }),
    );
    const [groupsX, groupsY, groupsZ] = workgroupCounts(layout, workgroup);
    pass.dispatchWorkgroups(groupsX, groupsY, groupsZ);
    pass.end();
    if (querySet !== null && resolved !== null) {
      encoder.resolveQuerySet(querySet, 0, 2, resolved, 0);
    }
    device.queue.submit([encoder.finish()]);
    const validationError = await device.popErrorScope();
    if (validationError !== null) {
      transient.forEach((buffer) => {
        buffer.destroy();
      });
      outputBuffer.destroy();
      throw new Error(validationError.message);
    }
    await device.queue.onSubmittedWorkDone();
    const wallMilliseconds = performance.now() - started;
    const gpuMilliseconds = resolved === null ? null : await readTimestamps(device, resolved);
    transient.forEach((buffer) => {
      buffer.destroy();
    });
    resolved?.destroy();
    querySet?.destroy();
    timings = { kernel: kind, pointCount, segmentCount, wallMilliseconds, gpuMilliseconds };
    owned.add(outputBuffer);
    return {
      pointCount,
      buffer: outputBuffer,
      byteLength,
      read: () => readFloats(device, outputBuffer, byteLength),
      release: () => {
        releaseBuffer(outputBuffer);
      },
    };
  }

  return {
    kind: 'gpu',
    load: (next) => {
      source = next;
    },
    evaluateGrid: (spec: GridSpec) => evaluate({ kind: 'grid', spec }),
    evaluateVolume: (spec: VolumeSpec) => evaluate({ kind: 'volume', spec }),
    evaluatePoints: (coordinates: Float64Array) => evaluate({ kind: 'points', coordinates }),
    lastTimings: () => timings,
    dispose: () => {
      source = null;
      owned.forEach((buffer) => {
        buffer.destroy();
      });
      owned.clear();
    },
  };
}
