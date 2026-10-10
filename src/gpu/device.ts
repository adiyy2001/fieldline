export interface AdapterSummary {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  software: boolean;
}

export type AcquireFailureReason = 'no-api' | 'no-adapter' | 'device-failed';

export interface DeviceLostReport {
  reason: GPUDeviceLostReason;
  message: string;
}

export interface ReadyDevice {
  status: 'ready';
  device: GPUDevice;
  adapter: AdapterSummary;
  timestampQuery: boolean;
  lost: Promise<DeviceLostReport>;
}

export interface UnsupportedDevice {
  status: 'unsupported';
  reason: AcquireFailureReason;
  detail: string;
}

export type DeviceResult = ReadyDevice | UnsupportedDevice;

type AdapterIdentity = Pick<
  GPUAdapterInfo,
  'vendor' | 'architecture' | 'device' | 'description' | 'isFallbackAdapter'
>;

const softwareAdapterMarkers = ['swiftshader', 'llvmpipe', 'softpipe', 'basic render'];

export function isSoftwareAdapter(info: AdapterIdentity): boolean {
  const identity = [info.vendor, info.architecture, info.device, info.description]
    .join(' ')
    .toLowerCase();
  return (
    info.isFallbackAdapter || softwareAdapterMarkers.some((marker) => identity.includes(marker))
  );
}

export function summarizeAdapter(info: AdapterIdentity): AdapterSummary {
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    software: isSoftwareAdapter(info),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function browserGpu(): GPU | undefined {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? navigator.gpu : undefined;
}

function reportLoss(device: GPUDevice): Promise<DeviceLostReport> {
  return device.lost.then((info) => ({ reason: info.reason, message: info.message }));
}

async function createDevice(adapter: GPUAdapter): Promise<ReadyDevice | UnsupportedDevice> {
  const timestampQuery = adapter.features.has('timestamp-query');
  try {
    const device = await adapter.requestDevice(
      timestampQuery ? { requiredFeatures: ['timestamp-query'] } : {},
    );
    return {
      status: 'ready',
      device,
      adapter: summarizeAdapter(adapter.info),
      timestampQuery,
      lost: reportLoss(device),
    };
  } catch (error) {
    return { status: 'unsupported', reason: 'device-failed', detail: describeError(error) };
  }
}

export async function acquireDevice(gpu: GPU | undefined = browserGpu()): Promise<DeviceResult> {
  if (gpu === undefined) {
    return { status: 'unsupported', reason: 'no-api', detail: 'navigator.gpu is not available' };
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch (error) {
    return { status: 'unsupported', reason: 'no-adapter', detail: describeError(error) };
  }
  if (adapter === null) {
    return { status: 'unsupported', reason: 'no-adapter', detail: 'requestAdapter returned null' };
  }
  return createDevice(adapter);
}
