import { Injectable, InjectionToken, effect, inject } from '@angular/core';
import { FieldStore } from '../state/field-store';

export interface FrameScheduler {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export const FRAME_SCHEDULER = new InjectionToken<FrameScheduler>('FRAME_SCHEDULER', {
  providedIn: 'root',
  factory: () => ({
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
      cancelAnimationFrame(handle);
    },
  }),
});

export const MAXIMUM_FRAME_STEP_MILLISECONDS = 100;

@Injectable({ providedIn: 'root' })
export class PhaseClock {
  private readonly store = inject(FieldStore);
  private readonly scheduler = inject(FRAME_SCHEDULER);

  constructor() {
    effect((onCleanup) => {
      if (!this.store.animating()) {
        return;
      }
      let previous: number | null = null;
      let handle = 0;
      const tick = (timestamp: number): void => {
        if (previous !== null) {
          this.store.advancePhase(Math.min(timestamp - previous, MAXIMUM_FRAME_STEP_MILLISECONDS));
        }
        previous = timestamp;
        handle = this.scheduler.request(tick);
      };
      handle = this.scheduler.request(tick);
      onCleanup(() => {
        this.scheduler.cancel(handle);
      });
    });
  }
}
