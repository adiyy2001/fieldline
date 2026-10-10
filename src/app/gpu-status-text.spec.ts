import type { AdapterSummary } from '../gpu/device';
import {
  adapterOf,
  describeAdapter,
  describeGpuState,
  describeSmoke,
  smokeOutcome,
} from './gpu-status-text';
import type { GpuState, SmokeState } from './services/gpu-status';

const hardware: AdapterSummary = {
  vendor: 'nvidia',
  architecture: 'ampere',
  device: '',
  description: 'RTX test card',
  software: false,
};

describe('describeGpuState', () => {
  it('describes each state in one headline', () => {
    expect(describeGpuState({ status: 'checking' }).headline).toBe('Checking for WebGPU');
    expect(describeGpuState({ status: 'ready', adapter: hardware }).headline).toBe(
      'WebGPU is ready.',
    );
  });

  it.each([
    ['no-api', 'This browser does not expose WebGPU.'],
    ['no-adapter', 'WebGPU is present but no graphics adapter is available.'],
    ['device-failed', 'A graphics adapter was found but a device could not be created.'],
  ] as const)('explains the unsupported reason %s', (reason, headline) => {
    const state: GpuState = { status: 'unsupported', reason, detail: 'raw detail' };
    expect(describeGpuState(state)).toEqual({ headline, detail: 'raw detail' });
  });

  it('carries the loss message as detail', () => {
    const state: GpuState = {
      status: 'lost',
      adapter: hardware,
      report: { reason: 'unknown', message: 'GPU reset' },
    };
    expect(describeGpuState(state)).toEqual({
      headline: 'The graphics device was lost.',
      detail: 'GPU reset',
    });
  });
});

describe('adapterOf', () => {
  it('has an adapter only after a device was created', () => {
    expect(adapterOf({ status: 'checking' })).toBeNull();
    expect(adapterOf({ status: 'unsupported', reason: 'no-api', detail: '' })).toBeNull();
    expect(adapterOf({ status: 'ready', adapter: hardware })).toBe(hardware);
    expect(
      adapterOf({
        status: 'lost',
        adapter: hardware,
        report: { reason: 'destroyed', message: '' },
      }),
    ).toBe(hardware);
  });
});

describe('describeAdapter', () => {
  it('lists the identity strings and the type', () => {
    expect(describeAdapter(hardware)).toEqual([
      { label: 'Vendor', value: 'nvidia' },
      { label: 'Architecture', value: 'ampere' },
      { label: 'Device', value: 'not reported' },
      { label: 'Description', value: 'RTX test card' },
      { label: 'Type', value: 'Hardware' },
    ]);
  });

  it('says that nothing was reported for empty strings', () => {
    const empty = { vendor: '', architecture: '', device: '', description: '', software: false };
    const values = describeAdapter(empty).map((row) => row.value);
    expect(values).toEqual([
      'not reported',
      'not reported',
      'not reported',
      'not reported',
      'Hardware',
    ]);
  });

  it('marks a software adapter', () => {
    const rows = describeAdapter({ ...hardware, software: true });
    expect(rows.at(-1)).toEqual({ label: 'Type', value: 'Software (CPU emulation)' });
  });
});

describe('smoke text', () => {
  const finished = (correct: number): SmokeState => ({
    status: 'finished',
    report: { correct, total: 1000 },
  });

  it('describes pending, finished and failed runs', () => {
    expect(describeSmoke({ status: 'pending' })).toBe('Compute check is running.');
    expect(describeSmoke(finished(1000))).toBe('Compute check: 1000 of 1000 values correct.');
    expect(describeSmoke({ status: 'failed', detail: 'no device' })).toBe(
      'Compute check failed: no device',
    );
  });

  it('passes only when every value is correct', () => {
    expect(smokeOutcome({ status: 'pending' })).toBe('pending');
    expect(smokeOutcome(finished(1000))).toBe('passed');
    expect(smokeOutcome(finished(999))).toBe('failed');
    expect(smokeOutcome({ status: 'failed', detail: '' })).toBe('failed');
  });
});
