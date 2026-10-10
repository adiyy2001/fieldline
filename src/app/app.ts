import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatNumber } from '../core/exposure/contour-levels';
import { CPU_GRID_SIZE } from '../core/backend/regions';
import {
  adapterOf,
  describeAdapter,
  describeGpuState,
  describeSmoke,
  smokeOutcome,
} from './gpu-status-text';
import { GroundView } from './ground/ground-view';
import { ParameterPanel } from './panel/parameter-panel';
import { FieldBackends } from './services/field-backends';
import { GpuStatus } from './services/gpu-status';
import { PhaseClock } from './services/phase-clock';
import { Shortcuts } from './services/shortcuts';
import { UiState } from './services/ui-state';
import { HelpDialog } from './shell/help-dialog';
import { ViewTabs } from './shell/view-tabs';
import { FieldStore } from './state/field-store';

type ChipState = 'solving' | 'ready' | 'invalid' | 'failed';

@Component({
  selector: 'fl-root',
  imports: [GroundView, ParameterPanel, ViewTabs, HelpDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly gpu = inject(GpuStatus);
  private readonly backends = inject(FieldBackends);
  protected readonly store = inject(FieldStore);
  protected readonly ui = inject(UiState);

  protected readonly status = computed(() => this.gpu.state().status);
  protected readonly text = computed(() => describeGpuState(this.gpu.state()));
  protected readonly adapterRows = computed(() => {
    const adapter = adapterOf(this.gpu.state());
    return adapter === null ? [] : describeAdapter(adapter);
  });
  protected readonly smokeText = computed(() => describeSmoke(this.gpu.smoke()));
  protected readonly smokeOutcome = computed(() => smokeOutcome(this.gpu.smoke()));

  protected readonly chipState = computed<ChipState>(() => this.store.status());
  protected readonly chipText = computed(() => {
    const frame = this.store.frame();
    switch (this.store.status()) {
      case 'solving':
        return 'Solving';
      case 'invalid':
        return this.store.issues()[0]?.message ?? 'The parameters are not valid';
      case 'failed':
        return this.store.message() ?? 'The computation failed';
      case 'ready':
        return frame === null
          ? 'Ready'
          : `Ready in ${formatNumber(frame.timings.totalMilliseconds)} ms`;
    }
  });
  protected readonly fallbackVisible = computed(() => this.backends.kind() === 'cpu');
  protected readonly fallbackText = computed(() => {
    const reason = this.backends.fallbackReason();
    const grid = `${String(CPU_GRID_SIZE.nx)} by ${String(CPU_GRID_SIZE.nz)}`;
    const base = `The field is computed on the CPU in a worker with a coarser ${grid} grid.`;
    return reason === null ? base : `${reason} ${base}`;
  });

  constructor() {
    inject(PhaseClock);
    inject(Shortcuts).attach();
  }
}
