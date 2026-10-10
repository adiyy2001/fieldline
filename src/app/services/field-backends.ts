import { Injectable, effect, inject, signal } from '@angular/core';
import { createCpuBackend } from '../../core/backend/cpu-backend';
import type { FieldBackend } from '../../core/backend/types';
import type { ReadyDevice } from '../../gpu/device';
import { describeGpuState } from '../gpu-status-text';
import { GpuStatus } from './gpu-status';
import { CPU_EXECUTOR_FACTORY, GPU_BACKEND_FACTORY } from './tokens';

export type BackendKind = 'pending' | 'gpu' | 'cpu';

@Injectable({ providedIn: 'root' })
export class FieldBackends {
  private readonly status = inject(GpuStatus);
  private readonly gpuFactory = inject(GPU_BACKEND_FACTORY);
  private readonly cpuFactory = inject(CPU_EXECUTOR_FACTORY);
  private readonly kindState = signal<BackendKind>('pending');
  private readonly reasonState = signal<string | null>(null);
  private backend: Promise<FieldBackend> | null = null;
  private demoted = false;

  readonly kind = this.kindState.asReadonly();
  readonly fallbackReason = this.reasonState.asReadonly();

  constructor() {
    effect(() => {
      const state = this.status.state();
      if (state.status === 'lost') {
        this.demote(describeGpuState(state).headline);
      }
    });
  }

  get(): Promise<FieldBackend> {
    this.backend ??= this.create();
    return this.backend;
  }

  async device(): Promise<ReadyDevice | null> {
    const result = await this.status.deviceResult;
    return result.status === 'ready' && !this.demoted ? result : null;
  }

  demote(reason: string): void {
    if (this.demoted) {
      return;
    }
    this.demoted = true;
    const previous = this.backend;
    this.reasonState.set(reason);
    this.backend = Promise.resolve(this.createCpu());
    void previous?.then((backend) => {
      backend.dispose();
    });
  }

  private createCpu(): FieldBackend {
    this.kindState.set('cpu');
    return createCpuBackend(this.cpuFactory());
  }

  private async create(): Promise<FieldBackend> {
    const result = await this.status.deviceResult;
    if (result.status === 'ready' && !this.demoted) {
      this.kindState.set('gpu');
      return this.gpuFactory(result);
    }
    if (result.status === 'unsupported') {
      this.reasonState.set(describeGpuState(result).headline);
    }
    return this.createCpu();
  }
}
