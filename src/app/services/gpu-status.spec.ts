import { TestBed } from '@angular/core/testing';
import type { DeviceLostReport, DeviceResult, ReadyDevice } from '../../gpu/device';
import type { SmokeReport } from '../../gpu/smoke-expectation';
import { fakeDevice, hardwareAdapterInfo, neverLost } from '../../gpu/testing/fake-gpu';
import { runSmokeKernel } from '../../gpu/smoke';
import {
  DEVICE_ACQUIRER,
  GpuStatus,
  SMOKE_RUNNER,
  type DeviceAcquirer,
  type SmokeRunner,
} from './gpu-status';

const adapter = { ...hardwareAdapterInfo, software: false };
const passing: SmokeReport = { correct: 1000, total: 1000 };

function readyDevice(lost: Promise<DeviceLostReport> = neverLost()): ReadyDevice {
  return { status: 'ready', device: fakeDevice(), adapter, timestampQuery: false, lost };
}

function service(acquire: DeviceAcquirer, runSmoke: SmokeRunner): GpuStatus {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEVICE_ACQUIRER, useValue: acquire },
      { provide: SMOKE_RUNNER, useValue: runSmoke },
    ],
  });
  return TestBed.inject(GpuStatus);
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
}

describe('GpuStatus', () => {
  it('is checking until the device request answers', () => {
    const status = service(
      () => new Promise<DeviceResult>(() => undefined),
      () => Promise.resolve(passing),
    );
    expect(status.state()).toEqual({ status: 'checking' });
    expect(status.smoke()).toEqual({ status: 'pending' });
  });

  it('is ready with the adapter and the smoke report once the device exists', async () => {
    const status = service(
      () => Promise.resolve(readyDevice()),
      () => Promise.resolve(passing),
    );
    await flush();
    expect(status.state()).toEqual({ status: 'ready', adapter });
    expect(status.smoke()).toEqual({ status: 'finished', report: passing });
  });

  it('passes the device to the smoke runner', async () => {
    const runSmoke = vi.fn<SmokeRunner>(() => Promise.resolve(passing));
    const ready = readyDevice();
    service(() => Promise.resolve(ready), runSmoke);
    await flush();
    expect(runSmoke).toHaveBeenCalledExactlyOnceWith(ready.device);
  });

  it('keeps the unsupported reason and skips the smoke kernel', async () => {
    const runSmoke = vi.fn<SmokeRunner>(() => Promise.resolve(passing));
    const status = service(
      () => Promise.resolve({ status: 'unsupported', reason: 'no-adapter', detail: 'none' }),
      runSmoke,
    );
    await flush();
    expect(status.state()).toEqual({ status: 'unsupported', reason: 'no-adapter', detail: 'none' });
    expect(status.smoke()).toEqual({ status: 'pending' });
    expect(runSmoke).not.toHaveBeenCalled();
  });

  it('records a failing smoke kernel without leaving the ready state', async () => {
    const status = service(
      () => Promise.resolve(readyDevice()),
      () => Promise.reject(new Error('validation error')),
    );
    await flush();
    expect(status.state().status).toBe('ready');
    expect(status.smoke()).toEqual({ status: 'failed', detail: 'validation error' });
  });

  it('switches to lost when the device is lost later', async () => {
    let lose: (report: DeviceLostReport) => void = () => undefined;
    const lost = new Promise<DeviceLostReport>((resolve) => {
      lose = resolve;
    });
    const status = service(
      () => Promise.resolve(readyDevice(lost)),
      () => Promise.resolve(passing),
    );
    await flush();
    expect(status.state().status).toBe('ready');
    lose({ reason: 'unknown', message: 'GPU reset' });
    await flush();
    expect(status.state()).toEqual({
      status: 'lost',
      adapter,
      report: { reason: 'unknown', message: 'GPU reset' },
    });
  });

  it('asks the browser for a device by default, which jsdom does not offer', async () => {
    const acquire = TestBed.inject(DEVICE_ACQUIRER);
    await expect(acquire()).resolves.toMatchObject({ status: 'unsupported', reason: 'no-api' });
  });

  it('runs the real smoke kernel by default', () => {
    expect(TestBed.inject(SMOKE_RUNNER)).toBe(runSmokeKernel);
  });
});
