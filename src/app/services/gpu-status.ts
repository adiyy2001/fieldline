import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  acquireDevice,
  type AcquireFailureReason,
  type AdapterSummary,
  type DeviceLostReport,
  type DeviceResult,
} from '../../gpu/device';
import { runSmokeKernel } from '../../gpu/smoke';
import type { SmokeReport } from '../../gpu/smoke-expectation';

export type DeviceAcquirer = () => Promise<DeviceResult>;
export type SmokeRunner = (device: GPUDevice) => Promise<SmokeReport>;

export const DEVICE_ACQUIRER = new InjectionToken<DeviceAcquirer>('DEVICE_ACQUIRER', {
  providedIn: 'root',
  factory: () => () => acquireDevice(),
});

export const SMOKE_RUNNER = new InjectionToken<SmokeRunner>('SMOKE_RUNNER', {
  providedIn: 'root',
  factory: () => runSmokeKernel,
});

export type GpuState =
  | { status: 'checking' }
  | { status: 'ready'; adapter: AdapterSummary }
  | { status: 'unsupported'; reason: AcquireFailureReason; detail: string }
  | { status: 'lost'; adapter: AdapterSummary; report: DeviceLostReport };

export type SmokeState =
  | { status: 'pending' }
  | { status: 'finished'; report: SmokeReport }
  | { status: 'failed'; detail: string };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable({ providedIn: 'root' })
export class GpuStatus {
  private readonly acquire = inject(DEVICE_ACQUIRER);
  private readonly runSmoke = inject(SMOKE_RUNNER);
  private readonly gpuState = signal<GpuState>({ status: 'checking' });
  private readonly smokeState = signal<SmokeState>({ status: 'pending' });

  readonly state = this.gpuState.asReadonly();
  readonly smoke = this.smokeState.asReadonly();

  constructor() {
    void this.start();
  }

  private async start(): Promise<void> {
    const result = await this.acquire();
    if (result.status === 'unsupported') {
      this.gpuState.set(result);
      return;
    }
    this.gpuState.set({ status: 'ready', adapter: result.adapter });
    void result.lost.then((report) => {
      this.gpuState.set({ status: 'lost', adapter: result.adapter, report });
    });
    await this.measureSmoke(result.device);
  }

  private async measureSmoke(device: GPUDevice): Promise<void> {
    try {
      this.smokeState.set({ status: 'finished', report: await this.runSmoke(device) });
    } catch (error) {
      this.smokeState.set({ status: 'failed', detail: describeError(error) });
    }
  }
}
