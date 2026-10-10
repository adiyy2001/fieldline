import type { VolumeSpec } from '../core/backend/types';
import type { FieldQuantity } from '../core/exposure/levels';
import type { DisplayMode } from '../core/model/settings';
import type { ReadyDevice } from './device';
import packSource from './shaders/volume_pack.wgsl';
import { readBuffer } from './texture-readback';
import {
  PACK_PARAMS_BYTES,
  STATS_WORDS,
  decodeStatsWords,
  packPackParams,
  pointCountOf,
} from './volume-params';

export interface VolumeSelection {
  readonly quantity: FieldQuantity;
  readonly mode: DisplayMode;
  readonly phaseRadians: number;
}

export interface RmsPeaks {
  readonly electric: number;
  readonly magnetic: number;
}

export interface VolumeField {
  readonly spec: VolumeSpec;
  readonly texture: GPUTexture;
  readonly magnitudes: GPUBuffer;
  setField(field: GPUBuffer): void;
  pack(selection: VolumeSelection): void;
  measure(): Promise<RmsPeaks>;
  readMagnitudes(): Promise<Float32Array>;
  dispose(): void;
}

export function createVolumeField(ready: ReadyDevice, spec: VolumeSpec): VolumeField {
  const { device } = ready;
  const count = pointCountOf({ nx: spec.nx, ny: spec.ny, nz: spec.nz });
  const module = device.createShaderModule({ code: packSource });
  const packPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'packMain' },
  });
  const statsPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'statsMain' },
  });
  const paramsBuffer = device.createBuffer({
    size: PACK_PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const magnitudes = device.createBuffer({
    size: Math.max(16, count * Float32Array.BYTES_PER_ELEMENT),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const maxima = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const texture = device.createTexture({
    size: { width: spec.nx, height: spec.ny, depthOrArrayLayers: spec.nz },
    dimension: '3d',
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  let packGroup: GPUBindGroup | null = null;
  let statsGroup: GPUBindGroup | null = null;
  let lastSelection: VolumeSelection | null = null;

  function requireGroups(): { pack: GPUBindGroup; stats: GPUBindGroup } {
    if (packGroup === null || statsGroup === null) {
      throw new Error('The volume has no field, call setField first');
    }
    return { pack: packGroup, stats: statsGroup };
  }

  return {
    spec,
    texture,
    magnitudes,
    setField(field) {
      packGroup = device.createBindGroup({
        layout: packPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuffer } },
          { binding: 1, resource: { buffer: field } },
          { binding: 2, resource: { buffer: magnitudes } },
          { binding: 3, resource: texture.createView({ dimension: '3d' }) },
        ],
      });
      statsGroup = device.createBindGroup({
        layout: statsPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuffer } },
          { binding: 1, resource: { buffer: field } },
          { binding: 4, resource: { buffer: maxima } },
        ],
      });
    },
    pack(selection) {
      const { pack } = requireGroups();
      lastSelection = selection;
      device.queue.writeBuffer(
        paramsBuffer,
        0,
        packPackParams({
          dims: { nx: spec.nx, ny: spec.ny, nz: spec.nz },
          ...selection,
        }),
      );
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(packPipeline);
      pass.setBindGroup(0, pack);
      pass.dispatchWorkgroups(
        Math.ceil(spec.nx / 4),
        Math.ceil(spec.ny / 4),
        Math.ceil(spec.nz / 4),
      );
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    async measure() {
      const { stats } = requireGroups();
      const selection = lastSelection ?? { quantity: 'electric', mode: 'rms', phaseRadians: 0 };
      device.queue.writeBuffer(
        paramsBuffer,
        0,
        packPackParams({ dims: { nx: spec.nx, ny: spec.ny, nz: spec.nz }, ...selection }),
      );
      device.queue.writeBuffer(maxima, 0, new Uint32Array(STATS_WORDS + 2));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(statsPipeline);
      pass.setBindGroup(0, stats);
      pass.dispatchWorkgroups(Math.ceil(count / 64));
      pass.end();
      device.queue.submit([encoder.finish()]);
      return decodeStatsWords(new Uint32Array(await readBuffer(device, maxima, 16)));
    },
    async readMagnitudes() {
      return new Float32Array(
        await readBuffer(device, magnitudes, count * Float32Array.BYTES_PER_ELEMENT),
      );
    },
    dispose() {
      paramsBuffer.destroy();
      magnitudes.destroy();
      maxima.destroy();
      texture.destroy();
      packGroup = null;
      statsGroup = null;
    },
  };
}
