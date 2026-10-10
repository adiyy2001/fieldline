import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FieldStore } from '../state/field-store';
import { storeProviders } from '../testing/store-providers';
import { FRAME_SCHEDULER, type FrameScheduler, PhaseClock } from './phase-clock';
import { PREFERS_REDUCED_MOTION } from './tokens';

class ManualScheduler implements FrameScheduler {
  readonly callbacks = new Map<number, (timestamp: number) => void>();
  private next = 1;

  request(callback: (timestamp: number) => void): number {
    const handle = this.next++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  frame(timestamp: number): void {
    const pending = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of pending) {
      callback(timestamp);
    }
  }
}

function setup(reducedMotion = false) {
  const scheduler = new ManualScheduler();
  TestBed.configureTestingModule({
    providers: [
      ...storeProviders(),
      { provide: FRAME_SCHEDULER, useValue: scheduler },
      { provide: PREFERS_REDUCED_MOTION, useValue: () => reducedMotion },
    ],
  });
  const store = TestBed.inject(FieldStore);
  TestBed.inject(PhaseClock);
  return { store, scheduler };
}

describe('the phase clock', () => {
  it('does nothing in rms mode', () => {
    const { scheduler } = setup();
    TestBed.tick();
    expect(scheduler.callbacks.size).toBe(0);
  });

  it('advances the phase by a full cycle in ten seconds', () => {
    const { store, scheduler } = setup();
    store.setSettings({ mode: 'instantaneous' });
    TestBed.tick();
    scheduler.frame(0);
    scheduler.frame(100);
    expect(store.settings().phaseDegrees).toBeCloseTo(3.6, 9);
    for (let time = 200; time <= 1000; time += 100) {
      scheduler.frame(time);
    }
    expect(store.settings().phaseDegrees).toBeCloseTo(36, 9);
  });

  it('limits the step after a long pause between frames', () => {
    const { store, scheduler } = setup();
    store.setSettings({ mode: 'instantaneous' });
    TestBed.tick();
    scheduler.frame(0);
    scheduler.frame(60_000);
    expect(store.settings().phaseDegrees).toBeCloseTo(3.6, 9);
  });

  it('stops when the animation is paused', () => {
    const { store, scheduler } = setup();
    store.setSettings({ mode: 'instantaneous' });
    TestBed.tick();
    store.setPlaying(false);
    TestBed.tick();
    expect(scheduler.callbacks.size).toBe(0);
  });

  it('starts paused when the user prefers reduced motion', () => {
    const { store, scheduler } = setup(true);
    store.setSettings({ mode: 'instantaneous' });
    TestBed.tick();
    expect(store.playing()).toBe(false);
    expect(scheduler.callbacks.size).toBe(0);
  });
});
