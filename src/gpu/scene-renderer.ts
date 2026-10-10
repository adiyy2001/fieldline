import type { Point3 } from '../core/field-types';
import { type CameraPose, cameraMatrices } from './camera';
import type { ReadyDevice } from './device';
import sceneSource from './shaders/scene.wgsl';
import { type Backdrop, LINE_INSTANCE_BYTES, SCENE_COLORS } from './scene-geometry';
import { readRgbaTexture } from './texture-readback';

export const SCENE_FORMAT: GPUTextureFormat = 'rgba8unorm';
export const SCENE_DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
export const SCENE_SAMPLES = 4;
export const SCENE_UNIFORM_BYTES = 112;

export const ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

export const PREMULTIPLIED_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

export interface SceneFrameInfo {
  readonly viewProjection: Float32Array;
  readonly inverseViewProjection: Float32Array;
  readonly cameraPosition: Point3;
  readonly width: number;
  readonly height: number;
  readonly seconds: number;
}

export interface SceneLayer {
  prepare(info: SceneFrameInfo): void;
  draw(pass: GPURenderPassEncoder): void;
}

export interface SceneView {
  readonly pose: CameraPose;
  readonly seconds: number;
}

export interface SceneRenderer {
  setBackdrop(backdrop: Backdrop | null): void;
  setLayers(layers: readonly SceneLayer[]): void;
  render(view: SceneView): void;
  capture(view: SceneView, width: number, height: number): Promise<Uint8Array>;
  dispose(): void;
}

export function depthStencilState(write: boolean): GPUDepthStencilState {
  return { format: SCENE_DEPTH_FORMAT, depthWriteEnabled: write, depthCompare: 'less' };
}

export const SCENE_MULTISAMPLE: GPUMultisampleState = { count: SCENE_SAMPLES };

interface Targets {
  readonly width: number;
  readonly height: number;
  readonly color: GPUTexture;
  readonly depth: GPUTexture;
}

function createTargets(device: GPUDevice, width: number, height: number): Targets {
  const size = { width, height };
  return {
    width,
    height,
    color: device.createTexture({
      size,
      format: SCENE_FORMAT,
      sampleCount: SCENE_SAMPLES,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
    depth: device.createTexture({
      size,
      format: SCENE_DEPTH_FORMAT,
      sampleCount: SCENE_SAMPLES,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }),
  };
}

function destroyTargets(targets: Targets | null): void {
  targets?.color.destroy();
  targets?.depth.destroy();
}

export function createSceneRenderer(
  ready: ReadyDevice,
  canvas: HTMLCanvasElement | null,
): SceneRenderer {
  const { device } = ready;
  const context = canvas?.getContext('webgpu') ?? null;
  if (canvas !== null && context === null) {
    throw new Error('The canvas has no WebGPU context');
  }
  context?.configure({ device, format: SCENE_FORMAT, alphaMode: 'opaque' });
  const module = device.createShaderModule({ code: sceneSource });
  const linePipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'lineMain' },
    fragment: {
      module,
      entryPoint: 'lineFragment',
      targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: depthStencilState(true),
    multisample: SCENE_MULTISAMPLE,
  });
  const groundPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'groundMain' },
    fragment: {
      module,
      entryPoint: 'lineFragment',
      targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: depthStencilState(false),
    multisample: SCENE_MULTISAMPLE,
  });
  const uniformBuffer = device.createBuffer({
    size: SCENE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  let backdrop: Backdrop | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  let lineBindGroup: GPUBindGroup | null = null;
  let groundBindGroup: GPUBindGroup | null = null;
  let layers: readonly SceneLayer[] = [];
  let displayTargets: Targets | null = null;

  function uploadBackdrop(next: Backdrop | null): void {
    instanceBuffer?.destroy();
    instanceBuffer = null;
    lineBindGroup = null;
    groundBindGroup = null;
    backdrop = next;
    if (next === null) {
      return;
    }
    instanceBuffer = device.createBuffer({
      size: Math.max(LINE_INSTANCE_BYTES, next.instances.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(instanceBuffer, 0, next.instances);
    const entries = [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: instanceBuffer } },
    ];
    lineBindGroup = device.createBindGroup({
      layout: linePipeline.getBindGroupLayout(0),
      entries,
    });
    groundBindGroup = device.createBindGroup({
      layout: groundPipeline.getBindGroupLayout(0),
      entries: entries.slice(0, 1),
    });
  }

  function frameInfo(view: SceneView, width: number, height: number): SceneFrameInfo {
    const matrices = cameraMatrices(view.pose, width / height);
    return {
      viewProjection: matrices.viewProjection,
      inverseViewProjection: matrices.inverseViewProjection,
      cameraPosition: matrices.position,
      width,
      height,
      seconds: view.seconds,
    };
  }

  function writeSceneUniform(info: SceneFrameInfo): void {
    const data = new Float32Array(SCENE_UNIFORM_BYTES / Float32Array.BYTES_PER_ELEMENT);
    data.set(info.viewProjection, 0);
    data.set([info.width, info.height, 0, 0], 16);
    if (backdrop !== null) {
      const { ground } = backdrop;
      data.set([ground.height, ground.halfWidth, ground.halfLength, ground.centerZ], 20);
    }
    data.set(SCENE_COLORS.ground, 24);
    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  function encodeScene(
    encoder: GPUCommandEncoder,
    targets: Targets,
    resolveTo: GPUTextureView,
    info: SceneFrameInfo,
  ): void {
    writeSceneUniform(info);
    layers.forEach((layer) => {
      layer.prepare(info);
    });
    const [red, green, blue, alpha] = SCENE_COLORS.background;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targets.color.createView(),
          resolveTarget: resolveTo,
          clearValue: { r: red, g: green, b: blue, a: alpha },
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: targets.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    if (backdrop !== null && lineBindGroup !== null && groundBindGroup !== null) {
      pass.setPipeline(groundPipeline);
      pass.setBindGroup(0, groundBindGroup);
      pass.draw(6);
      pass.setPipeline(linePipeline);
      pass.setBindGroup(0, lineBindGroup);
      pass.draw(6, backdrop.count);
    }
    layers.forEach((layer) => {
      layer.draw(pass);
    });
    pass.end();
  }

  return {
    setBackdrop: uploadBackdrop,
    setLayers(next) {
      layers = next;
    },
    render(view) {
      if (canvas === null || context === null) {
        throw new Error('This renderer has no canvas, use capture');
      }
      const width = Math.max(1, canvas.width);
      const height = Math.max(1, canvas.height);
      if (displayTargets?.width !== width || displayTargets.height !== height) {
        destroyTargets(displayTargets);
        displayTargets = createTargets(device, width, height);
      }
      const encoder = device.createCommandEncoder();
      encodeScene(
        encoder,
        displayTargets,
        context.getCurrentTexture().createView(),
        frameInfo(view, width, height),
      );
      device.queue.submit([encoder.finish()]);
    },
    async capture(view, width, height) {
      const targets = createTargets(device, width, height);
      const resolved = device.createTexture({
        size: { width, height },
        format: SCENE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      try {
        const info = frameInfo(view, width, height);
        const pixels = await readRgbaTexture(
          device,
          (encoder, staging, rowBytes) => {
            encodeScene(encoder, targets, resolved.createView(), info);
            encoder.copyTextureToBuffer(
              { texture: resolved },
              { buffer: staging, bytesPerRow: rowBytes },
              { width, height },
            );
          },
          width,
          height,
        );
        return pixels;
      } finally {
        destroyTargets(targets);
        resolved.destroy();
      }
    },
    dispose() {
      uploadBackdrop(null);
      destroyTargets(displayTargets);
      displayTargets = null;
      uniformBuffer.destroy();
      context?.unconfigure();
    },
  };
}
