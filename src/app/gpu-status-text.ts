import type { AcquireFailureReason, AdapterSummary } from '../gpu/device';
import type { GpuState, SmokeState } from './services/gpu-status';

export interface StatusText {
  headline: string;
  detail: string | null;
}

export interface AdapterRow {
  label: string;
  value: string;
}

export type SmokeOutcome = 'pending' | 'passed' | 'failed';

const unsupportedHeadlines: Record<AcquireFailureReason, string> = {
  'no-api': 'This browser does not expose WebGPU.',
  'no-adapter': 'WebGPU is present but no graphics adapter is available.',
  'device-failed': 'A graphics adapter was found but a device could not be created.',
};

const notReported = 'not reported';

export function describeGpuState(state: GpuState): StatusText {
  switch (state.status) {
    case 'checking':
      return { headline: 'Checking for WebGPU', detail: null };
    case 'ready':
      return { headline: 'WebGPU is ready.', detail: null };
    case 'unsupported':
      return { headline: unsupportedHeadlines[state.reason], detail: state.detail };
    case 'lost':
      return { headline: 'The graphics device was lost.', detail: state.report.message };
  }
}

export function adapterOf(state: GpuState): AdapterSummary | null {
  return state.status === 'ready' || state.status === 'lost' ? state.adapter : null;
}

export function describeAdapter(adapter: AdapterSummary): AdapterRow[] {
  return [
    { label: 'Vendor', value: adapter.vendor || notReported },
    { label: 'Architecture', value: adapter.architecture || notReported },
    { label: 'Device', value: adapter.device || notReported },
    { label: 'Description', value: adapter.description || notReported },
    { label: 'Type', value: adapter.software ? 'Software (CPU emulation)' : 'Hardware' },
  ];
}

export function smokeOutcome(state: SmokeState): SmokeOutcome {
  switch (state.status) {
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'finished':
      return state.report.correct === state.report.total ? 'passed' : 'failed';
  }
}

export function describeSmoke(state: SmokeState): string {
  switch (state.status) {
    case 'pending':
      return 'Compute check is running.';
    case 'failed':
      return `Compute check failed: ${state.detail}`;
    case 'finished':
      return `Compute check: ${String(state.report.correct)} of ${String(state.report.total)} values correct.`;
  }
}
