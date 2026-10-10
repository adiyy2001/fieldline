import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { storeProviders } from '../testing/store-providers';
import { until } from '../testing/doubles';
import { FieldStore, swapPhasing } from './field-store';

function createStore(options: Parameters<typeof storeProviders>[0] = {}) {
  TestBed.configureTestingModule({ providers: storeProviders(options) });
  return TestBed.inject(FieldStore);
}

describe('the field store', () => {
  it('starts from the default configuration and solves once', async () => {
    const store = createStore();
    expect(store.parameters().lineToLineKilovolts).toBe(400);
    expect(store.status()).toBe('solving');
    await until(() => store.status() === 'ready');
    expect(store.frame()?.quality).toBe('full');
    expect(store.frame()?.backend).toBe('cpu');
  });

  it('restores the configuration from the URL', async () => {
    const store = createStore({ search: '?v=1&kv=500&q=b&r=inst&ang=45&ht=1.8' });
    expect(store.parameters().lineToLineKilovolts).toBe(500);
    expect(store.settings()).toMatchObject({
      quantity: 'magnetic',
      mode: 'instantaneous',
      phaseDegrees: 45,
      evaluationHeight: 1.8,
    });
    await until(() => store.status() === 'ready');
    expect(store.frame()?.grid.height).toBe(1.8);
  });

  it('draws a draft while a value is dragged and returns to full quality', async () => {
    const store = createStore();
    await until(() => store.status() === 'ready');
    const qualities: string[] = [];
    store.setParameters({ lineToLineKilovolts: 420 }, { interactive: true });
    await until(() => {
      const quality = store.frame()?.quality;
      if (quality !== undefined && qualities[qualities.length - 1] !== quality) {
        qualities.push(quality);
      }
      return qualities.length >= 3;
    });
    expect(qualities.slice(-2)).toEqual(['draft', 'full']);
    expect(store.frame()?.grid.nx).toBe(128);
  });

  it('shows only the latest of several quick edits', async () => {
    const store = createStore({ solverDelayMilliseconds: 10 });
    await until(() => store.status() === 'ready');
    store.setParameters({ lineToLineKilovolts: 300 });
    store.setParameters({ lineToLineKilovolts: 350 });
    store.setParameters({ lineToLineKilovolts: 500 });
    await until(() => store.status() === 'ready' && store.frame()?.quality === 'full');
    const frame = store.frame();
    expect(frame).not.toBeNull();
    expect(store.parameters().lineToLineKilovolts).toBe(500);
    const reference = frame?.evaluator({ x: 10, y: 1, z: 450 });
    expect(reference).toBeDefined();
  });

  it('reports invalid parameters and keeps the previous frame', async () => {
    const store = createStore();
    await until(() => store.status() === 'ready');
    const before = store.frame();
    store.setParameters({ lineToLineKilovolts: 5 });
    await until(() => store.status() === 'invalid');
    expect(store.issues().length).toBeGreaterThan(0);
    expect(store.frame()).toBe(before);
  });

  it('does not re-solve for display-only changes', async () => {
    const store = createStore();
    await until(() => store.status() === 'ready');
    const before = store.frame();
    store.setSettings({ quantity: 'magnetic' });
    store.setPhase(30);
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(store.frame()).toBe(before);
    expect(store.status()).toBe('ready');
  });

  it('re-evaluates when the evaluation height changes', async () => {
    const store = createStore();
    await until(() => store.status() === 'ready');
    store.setSettings({ evaluationHeight: 1.8 });
    await until(() => store.frame()?.grid.height === 1.8);
  });

  it('switches to the 2D cross-section model', async () => {
    const store = createStore();
    await until(() => store.status() === 'ready');
    store.setSettings({ model: 'cross-section-2d' });
    await until(() => store.frame()?.backend === 'cross-section');
    expect(store.frame()?.grid.nz).toBe(2);
  });

  it('changes the tower kind and keeps the electrical values', async () => {
    const store = createStore();
    store.setParameters({ lineToLineKilovolts: 220 });
    store.setTowerKind('delta');
    expect(store.parameters().tower.kind).toBe('delta');
    expect(store.parameters().lineToLineKilovolts).toBe(220);
    await until(() => store.status() === 'ready');
  });

  it('writes the compact state to the URL', async () => {
    const writes: string[] = [];
    const store = createStore({ writes });
    await until(() => store.status() === 'ready');
    TestBed.tick();
    store.setParameters({ lineToLineKilovolts: 500 });
    TestBed.tick();
    await until(() => writes.join(' ').includes('kv=500'));
  });

  it('steps the phase in 15 degree steps and stops the animation', () => {
    const store = createStore();
    store.setPlaying(true);
    store.stepPhase(1);
    expect(store.settings().phaseDegrees).toBe(15);
    expect(store.settings().mode).toBe('instantaneous');
    expect(store.playing()).toBe(false);
    store.stepPhase(-2);
    expect(store.settings().phaseDegrees).toBe(345);
  });

  it('moves the probe inside the grid', () => {
    const store = createStore();
    store.moveProbe(-2, 0);
    store.moveProbe(0, 3);
    expect(store.probe()).toEqual({ lateral: 0, along: 1 });
  });

  it('ignores views that are not built yet', () => {
    const store = createStore();
    store.setView('volume');
    expect(store.view()).toBe('ground');
  });

  it('animates only for the instantaneous mode on the ground view', () => {
    const store = createStore();
    store.setPlaying(true);
    expect(store.animating()).toBe(false);
    store.setSettings({ mode: 'instantaneous' });
    expect(store.animating()).toBe(true);
    store.setPlaying(false);
    expect(store.animating()).toBe(false);
  });
});

describe('swapping phase letters', () => {
  it('swaps with the holder inside the same circuit', () => {
    expect(swapPhasing([0, 1, 2, 0, 1, 2], 0, 1)).toEqual([1, 0, 2, 0, 1, 2]);
  });

  it('leaves the other circuit alone', () => {
    expect(swapPhasing([0, 1, 2, 0, 1, 2], 4, 0)).toEqual([0, 1, 2, 1, 0, 2]);
  });

  it('keeps a position that already holds the phase', () => {
    expect(swapPhasing([0, 1, 2], 1, 1)).toEqual([0, 1, 2]);
  });
});
