import smokeSource from './shaders/smoke.wgsl';
import {
  compareSmokeValues,
  expectedSmokeValues,
  smokeElementCount,
  smokeWorkgroupSize,
  workgroupCount,
  type SmokeReport,
} from './smoke-expectation';

export async function runSmokeKernel(device: GPUDevice): Promise<SmokeReport> {
  const byteLength = smokeElementCount * Uint32Array.BYTES_PER_ELEMENT;
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: smokeSource });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  const storage = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const staging = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: storage } }],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount(smokeElementCount, smokeWorkgroupSize));
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, staging, 0, byteLength);
    device.queue.submit([encoder.finish()]);
    const validationError = await device.popErrorScope();
    if (validationError !== null) {
      throw new Error(validationError.message);
    }
    await staging.mapAsync(GPUMapMode.READ);
    const values = new Uint32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    return compareSmokeValues(values, expectedSmokeValues(smokeElementCount));
  } finally {
    storage.destroy();
    staging.destroy();
  }
}
