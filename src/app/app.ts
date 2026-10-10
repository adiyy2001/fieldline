import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  adapterOf,
  describeAdapter,
  describeGpuState,
  describeSmoke,
  smokeOutcome,
} from './gpu-status-text';
import { GpuStatus } from './services/gpu-status';

@Component({
  selector: 'fl-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly gpu = inject(GpuStatus);

  protected readonly status = computed(() => this.gpu.state().status);
  protected readonly text = computed(() => describeGpuState(this.gpu.state()));
  protected readonly adapterRows = computed(() => {
    const adapter = adapterOf(this.gpu.state());
    return adapter === null ? [] : describeAdapter(adapter);
  });
  protected readonly smokeText = computed(() => describeSmoke(this.gpu.smoke()));
  protected readonly smokeOutcome = computed(() => smokeOutcome(this.gpu.smoke()));
}
