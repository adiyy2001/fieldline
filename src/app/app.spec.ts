import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeviceLostReport, DeviceResult } from '../gpu/device';
import type { SmokeReport } from '../gpu/smoke-expectation';
import { fakeDevice, neverLost, swiftShaderAdapterInfo } from '../gpu/testing/fake-gpu';
import { App } from './app';
import { appConfig } from './app.config';
import { DEVICE_ACQUIRER, SMOKE_RUNNER } from './services/gpu-status';

const hardwareAdapter = {
  vendor: 'nvidia',
  architecture: 'ampere',
  device: '',
  description: 'RTX test card',
  software: false,
};

function ready(
  adapter = hardwareAdapter,
  lost: Promise<DeviceLostReport> = neverLost(),
): DeviceResult {
  return { status: 'ready', device: fakeDevice(), adapter, timestampQuery: false, lost };
}

async function mount(
  result: DeviceResult | 'pending',
  smoke: SmokeReport | Error = { correct: 1000, total: 1000 },
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      ...appConfig.providers,
      {
        provide: DEVICE_ACQUIRER,
        useValue: () =>
          result === 'pending'
            ? new Promise<DeviceResult>(() => undefined)
            : Promise.resolve(result),
      },
      {
        provide: SMOKE_RUNNER,
        useValue: () => (smoke instanceof Error ? Promise.reject(smoke) : Promise.resolve(smoke)),
      },
    ],
  });
  const fixture: ComponentFixture<App> = TestBed.createComponent(App);
  await fixture.whenStable();
  for (let turn = 0; turn < 5; turn += 1) {
    await Promise.resolve();
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function statusRegion(root: HTMLElement): HTMLElement {
  const region = root.querySelector<HTMLElement>('[role="status"]');
  if (region === null) {
    throw new Error('the status region is missing');
  }
  return region;
}

describe('App', () => {
  it('names the project and says what it does', async () => {
    const root = await mount('pending');
    expect(root.querySelector('h1')?.textContent).toBe('fieldline');
    expect(root.querySelector('header p')?.textContent).toContain('overhead high-voltage lines');
  });

  it('shows a checking state until the device request answers', async () => {
    const region = statusRegion(await mount('pending'));
    expect(region.getAttribute('data-state')).toBe('checking');
    expect(region.textContent).toContain('Checking for WebGPU');
    expect(region.querySelector('.adapter')).toBeNull();
  });

  it('shows the ready state, the adapter and the compute check', async () => {
    const region = statusRegion(await mount(ready()));
    expect(region.getAttribute('data-state')).toBe('ready');
    expect(region.textContent).toContain('WebGPU is ready.');
    expect(region.textContent).toContain('nvidia');
    expect(region.textContent).toContain('ampere');
    expect(region.textContent).toContain('Hardware');
    expect(region.textContent).toContain('Compute check: 1000 of 1000 values correct.');
    expect(region.querySelector('.kernel')?.getAttribute('data-outcome')).toBe('passed');
  });

  it('marks a software adapter', async () => {
    const adapter = { ...swiftShaderAdapterInfo, software: true };
    const region = statusRegion(await mount(ready(adapter)));
    expect(region.textContent).toContain('Software (CPU emulation)');
    expect(region.textContent).toContain('not reported');
  });

  it('reports a compute check that returns wrong values', async () => {
    const region = statusRegion(await mount(ready(), { correct: 998, total: 1000 }));
    expect(region.textContent).toContain('Compute check: 998 of 1000 values correct.');
    expect(region.querySelector('.kernel')?.getAttribute('data-outcome')).toBe('failed');
  });

  it('reports a compute check that throws', async () => {
    const region = statusRegion(await mount(ready(), new Error('validation error')));
    expect(region.textContent).toContain('Compute check failed: validation error');
    expect(region.querySelector('.kernel')?.getAttribute('data-outcome')).toBe('failed');
  });

  it('explains why WebGPU is not available', async () => {
    const region = statusRegion(
      await mount({
        status: 'unsupported',
        reason: 'no-adapter',
        detail: 'requestAdapter returned null',
      }),
    );
    expect(region.getAttribute('data-state')).toBe('unsupported');
    expect(region.textContent).toContain('WebGPU is present but no graphics adapter is available.');
    expect(region.textContent).toContain('requestAdapter returned null');
    expect(region.querySelector('.kernel')).toBeNull();
  });

  it('reports a lost device', async () => {
    const lost = Promise.resolve<DeviceLostReport>({ reason: 'unknown', message: 'GPU reset' });
    const region = statusRegion(await mount(ready(hardwareAdapter, lost)));
    expect(region.getAttribute('data-state')).toBe('lost');
    expect(region.textContent).toContain('The graphics device was lost.');
    expect(region.textContent).toContain('GPU reset');
  });
});
