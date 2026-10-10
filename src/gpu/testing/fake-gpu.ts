export interface FakeAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  isFallbackAdapter: boolean;
}

export type RequestDevice = (descriptor?: GPUDeviceDescriptor) => Promise<GPUDevice>;

export interface FakeAdapterOptions {
  info?: FakeAdapterInfo;
  features?: readonly string[];
  requestDevice?: RequestDevice;
}

export interface FakeLostInfo {
  reason: GPUDeviceLostReason;
  message: string;
}

export const hardwareAdapterInfo: FakeAdapterInfo = {
  vendor: 'acme',
  architecture: 'gen-9',
  device: 'dev-1',
  description: 'Acme test adapter',
  isFallbackAdapter: false,
};

export const swiftShaderAdapterInfo: FakeAdapterInfo = {
  vendor: 'google',
  architecture: 'swiftshader',
  device: '',
  description: '',
  isFallbackAdapter: false,
};

export function neverLost(): Promise<FakeLostInfo> {
  return new Promise<FakeLostInfo>(() => undefined);
}

export function fakeDevice(lost: Promise<FakeLostInfo> = neverLost()): GPUDevice {
  return { lost } as unknown as GPUDevice;
}

export function fakeAdapter(options: FakeAdapterOptions = {}): GPUAdapter {
  return {
    info: options.info ?? hardwareAdapterInfo,
    features: new Set(options.features ?? []),
    requestDevice: options.requestDevice ?? (() => Promise.resolve(fakeDevice())),
  } as unknown as GPUAdapter;
}

export function fakeGpu(
  requestAdapter: (options?: GPURequestAdapterOptions) => Promise<GPUAdapter | null>,
): GPU {
  return { requestAdapter } as unknown as GPU;
}
