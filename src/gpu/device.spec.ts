import { acquireDevice, isSoftwareAdapter, summarizeAdapter } from './device';
import {
  fakeAdapter,
  fakeDevice,
  fakeGpu,
  hardwareAdapterInfo,
  swiftShaderAdapterInfo,
  type RequestDevice,
} from './testing/fake-gpu';

describe('acquireDevice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports no-api when navigator.gpu is missing', async () => {
    const result = await acquireDevice(undefined);
    expect(result).toEqual({
      status: 'unsupported',
      reason: 'no-api',
      detail: 'navigator.gpu is not available',
    });
  });

  it('reports no-api when there is no navigator at all', async () => {
    vi.stubGlobal('navigator', undefined);
    await expect(acquireDevice()).resolves.toMatchObject({
      status: 'unsupported',
      reason: 'no-api',
    });
  });

  it('uses navigator.gpu when no GPU object is passed in', async () => {
    const requestAdapter = vi.fn(() => Promise.resolve(null));
    vi.stubGlobal('navigator', { gpu: fakeGpu(requestAdapter) });
    await expect(acquireDevice()).resolves.toMatchObject({ reason: 'no-adapter' });
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('reports no-adapter when requestAdapter returns null', async () => {
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(null)));
    expect(result).toEqual({
      status: 'unsupported',
      reason: 'no-adapter',
      detail: 'requestAdapter returned null',
    });
  });

  it('reports no-adapter with the message when requestAdapter rejects', async () => {
    const result = await acquireDevice(fakeGpu(() => Promise.reject(new Error('blocked'))));
    expect(result).toEqual({ status: 'unsupported', reason: 'no-adapter', detail: 'blocked' });
  });

  it('reports no-adapter with the text of a rejection that is not an Error', async () => {
    const result = await acquireDevice(fakeGpu(() => Promise.reject('plain text')));
    expect(result).toMatchObject({ reason: 'no-adapter', detail: 'plain text' });
  });

  it('reports device-failed when requestDevice rejects', async () => {
    const adapter = fakeAdapter({
      requestDevice: () => Promise.reject(new Error('out of memory')),
    });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    expect(result).toEqual({
      status: 'unsupported',
      reason: 'device-failed',
      detail: 'out of memory',
    });
  });

  it('asks for the high performance adapter', async () => {
    const requestAdapter = vi.fn(() => Promise.resolve(null));
    await acquireDevice(fakeGpu(requestAdapter));
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
  });

  it('returns the device with the adapter summary', async () => {
    const device = fakeDevice();
    const adapter = fakeAdapter({ requestDevice: () => Promise.resolve(device) });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.device).toBe(device);
      expect(result.adapter).toEqual({
        vendor: 'acme',
        architecture: 'gen-9',
        device: 'dev-1',
        description: 'Acme test adapter',
        software: false,
      });
      expect(result.timestampQuery).toBe(false);
    }
  });

  it('requests timestamp queries only when the adapter has them', async () => {
    const requestDevice = vi.fn<RequestDevice>(() => Promise.resolve(fakeDevice()));
    const withFeature = fakeAdapter({ features: ['timestamp-query'], requestDevice });
    const first = await acquireDevice(fakeGpu(() => Promise.resolve(withFeature)));
    expect(requestDevice).toHaveBeenLastCalledWith({ requiredFeatures: ['timestamp-query'] });
    expect(first).toMatchObject({ status: 'ready', timestampQuery: true });

    const without = fakeAdapter({ requestDevice });
    const second = await acquireDevice(fakeGpu(() => Promise.resolve(without)));
    expect(requestDevice).toHaveBeenLastCalledWith({});
    expect(second).toMatchObject({ status: 'ready', timestampQuery: false });
  });

  it('flags a software adapter', async () => {
    const adapter = fakeAdapter({ info: swiftShaderAdapterInfo });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    expect(result).toMatchObject({ status: 'ready', adapter: { software: true } });
  });

  it('reports a lost device through the lost promise', async () => {
    let lose: (info: { reason: GPUDeviceLostReason; message: string }) => void = () => undefined;
    const lost = new Promise<{ reason: GPUDeviceLostReason; message: string }>((resolve) => {
      lose = resolve;
    });
    const adapter = fakeAdapter({ requestDevice: () => Promise.resolve(fakeDevice(lost)) });
    const result = await acquireDevice(fakeGpu(() => Promise.resolve(adapter)));
    if (result.status !== 'ready') {
      throw new Error('expected a ready device');
    }
    lose({ reason: 'unknown', message: 'GPU reset' });
    await expect(result.lost).resolves.toEqual({ reason: 'unknown', message: 'GPU reset' });
  });
});

describe('isSoftwareAdapter', () => {
  it('treats SwiftShader, llvmpipe and fallback adapters as software', () => {
    expect(isSoftwareAdapter(swiftShaderAdapterInfo)).toBe(true);
    expect(isSoftwareAdapter({ ...hardwareAdapterInfo, description: 'llvmpipe (LLVM 17)' })).toBe(
      true,
    );
    expect(isSoftwareAdapter({ ...hardwareAdapterInfo, isFallbackAdapter: true })).toBe(true);
  });

  it('treats a named hardware adapter as hardware', () => {
    expect(isSoftwareAdapter(hardwareAdapterInfo)).toBe(false);
    expect(
      isSoftwareAdapter({
        vendor: 'nvidia',
        architecture: 'ampere',
        device: '',
        description: 'NVIDIA GeForce RTX 3070 Ti Laptop GPU',
        isFallbackAdapter: false,
      }),
    ).toBe(false);
  });
});

describe('summarizeAdapter', () => {
  it('keeps the four identity strings and adds the software flag', () => {
    expect(summarizeAdapter(swiftShaderAdapterInfo)).toEqual({
      vendor: 'google',
      architecture: 'swiftshader',
      device: '',
      description: '',
      software: true,
    });
  });
});
