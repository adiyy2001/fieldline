import type { ReadyDevice } from './device';
import raymarchSource from './shaders/raymarch.wgsl';
import {
  PREMULTIPLIED_BLEND,
  SCENE_FORMAT,
  SCENE_DEPTH_FORMAT,
  SCENE_MULTISAMPLE,
  type SceneFrameInfo,
  type SceneLayer,
} from './scene-renderer';
import type { BoxBounds } from './scene-geometry';
import type { VolumeField } from './volume-field';
import {
  DEFAULT_MARCH_STEPS,
  MARCH_PARAMS_BYTES,
  packMarchParams,
  referenceLengthOf,
} from './volume-params';

export interface VolumeLayer extends SceneLayer {
  setTransfer(table: Float32Array): void;
  setMaximum(maximum: number): void;
  dispose(): void;
}

export function createVolumeLayer(
  ready: ReadyDevice,
  field: VolumeField,
  box: BoxBounds,
  steps: number = DEFAULT_MARCH_STEPS,
): VolumeLayer {
  const { device } = ready;
  const module = device.createShaderModule({ code: raymarchSource });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertexMain' },
    fragment: {
      module,
      entryPoint: 'fragmentMain',
      targets: [{ format: SCENE_FORMAT, blend: PREMULTIPLIED_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: SCENE_DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'always' },
    multisample: SCENE_MULTISAMPLE,
  });
  const paramsBuffer = device.createBuffer({
    size: MARCH_PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const transferBuffer = device.createBuffer({
    size: 256 * 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: field.texture.createView({ dimension: '3d' }) },
      { binding: 2, resource: sampler },
      { binding: 3, resource: { buffer: transferBuffer } },
    ],
  });
  const dims = { nx: field.spec.nx, ny: field.spec.ny, nz: field.spec.nz };
  const referenceLength = referenceLengthOf(box);
  let maximum = 1;

  return {
    setTransfer(table) {
      device.queue.writeBuffer(transferBuffer, 0, table);
    },
    setMaximum(next) {
      maximum = next;
    },
    prepare(info: SceneFrameInfo) {
      device.queue.writeBuffer(
        paramsBuffer,
        0,
        packMarchParams({
          inverseViewProjection: info.inverseViewProjection,
          cameraPosition: info.cameraPosition,
          box,
          dims,
          steps,
          maximum,
          referenceLength,
          width: info.width,
          height: info.height,
        }),
      );
    },
    draw(pass) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
    },
    dispose() {
      paramsBuffer.destroy();
      transferBuffer.destroy();
    },
  };
}
