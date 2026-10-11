import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeatmapCapture } from '../services/heatmap-capture';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import { GroundView } from './ground-view';

async function mount(search = ''): Promise<{
  fixture: ComponentFixture<GroundView>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
}> {
  TestBed.configureTestingModule({ providers: storeProviders({ search }) });
  const fixture = TestBed.createComponent(GroundView);
  const store = TestBed.inject(FieldStore);
  fixture.detectChanges();
  await until(() => store.status() === 'ready');
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, store };
}

describe('the ground view', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(380);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a placeholder until the first field arrives', () => {
    TestBed.configureTestingModule({ providers: storeProviders() });
    const fixture = TestBed.createComponent(GroundView);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.placeholder')?.textContent).toContain('Solving the line');
    expect(root.querySelector('[data-testid="ground-caption"]')?.textContent).toContain('Solving');
  });

  it('describes the field and the probe in text', async () => {
    const { root } = await mount();
    expect(root.querySelector('[data-testid="ground-caption"]')?.textContent).toContain(
      'CPU fallback',
    );
    const probe = root.querySelector('[data-testid="ground-probe"]')?.textContent ?? '';
    expect(probe).toContain('Probe at x = 0 m, z = ');
    expect(probe).toContain('kV/m');
    expect(probe).toContain('µT');
    expect(root.querySelector('.placeholder')).toBeNull();
  });

  it('draws axes with units, the line footprint and level labels', async () => {
    const { root } = await mount();
    expect(root.textContent).toContain('Distance along the line z (m)');
    expect(root.textContent).toContain('Lateral position x (m)');
    expect(root.querySelectorAll('.tick-label').length).toBeGreaterThan(4);
    expect(root.querySelectorAll('.conductor').length).toBeGreaterThan(3);
    const towers = Array.from(root.querySelectorAll('.tower'));
    expect(towers.length).toBeGreaterThan(1);
    for (const tower of towers) {
      expect(Number(tower.getAttribute('height'))).toBeGreaterThan(0);
    }
    expect(root.querySelectorAll('.level-label').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.probe-marker')).toHaveLength(1);
  });

  it('lists the contour levels with a dash name so colour is never the only cue', async () => {
    const { root } = await mount();
    const entries = Array.from(root.querySelectorAll('.levels li')).map((item) => item.textContent);
    expect(entries.length).toBeGreaterThan(2);
    expect(entries.some((text) => text.includes('solid'))).toBe(true);
    expect(entries.some((text) => text.includes('dashes'))).toBe(true);
    expect(root.querySelector('.bar')?.getAttribute('aria-label')).toContain('Colour scale');
  });

  it('names the quantity and mode in the scale title', async () => {
    const { root } = await mount('?v=1&q=b&r=inst');
    expect(root.querySelector('.scale-title')?.textContent).toBe(
      'Magnetic flux density, instantaneous, in µT',
    );
  });

  it('moves the probe with the arrow keys and moves faster with shift', async () => {
    const { fixture, root, store } = await mount();
    const stage = root.querySelector<HTMLElement>('.stage');
    expect(stage?.getAttribute('tabindex')).toBe('0');
    const start = store.probe();
    stage?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    const step = store.probe().along - start.along;
    expect(step).toBeGreaterThan(0);
    stage?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, cancelable: true }),
    );
    expect(store.probe().along - start.along - step).toBeGreaterThan(step * 3);
    stage?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
    expect(store.probe().lateral).toBeGreaterThan(start.lateral);
    stage?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    stage?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    stage?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="ground-probe"]')?.textContent).toContain('Probe');
  });

  it('places the probe where the pointer is inside the plot only', async () => {
    const { fixture, root, store } = await mount();
    const overlay = root.querySelector('svg.overlay');
    if (overlay === null) {
      throw new Error('overlay missing');
    }
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 900,
      bottom: 380,
      width: 900,
      height: 380,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const before = store.probe();
    overlay.dispatchEvent(new MouseEvent('pointermove', { clientX: 2, clientY: 2 }));
    expect(store.probe()).toEqual(before);
    overlay.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 100 }));
    expect(store.probe()).not.toEqual(before);
    fixture.detectChanges();
  });

  it('silences the live probe while the animation runs', async () => {
    const { fixture, root, store } = await mount();
    const probe = root.querySelector('[data-testid="ground-probe"]');
    expect(probe?.getAttribute('aria-live')).toBe('polite');
    store.setSettings({ mode: 'instantaneous' });
    store.setPlaying(true);
    fixture.detectChanges();
    expect(probe?.getAttribute('aria-live')).toBe('off');
    store.setPlaying(false);
  });

  it('captures CPU pixels at the requested size and registers for capture', async () => {
    const { store } = await mount();
    await until(() => store.frame() !== null);
    const capture = TestBed.inject(HeatmapCapture);
    const pixels = await capture.capture({ width: 32, height: 12 });
    expect(pixels?.width).toBe(32);
    expect(pixels?.height).toBe(12);
    expect(pixels?.pixels.length).toBe(32 * 12 * 4);
    expect(pixels?.pixels.some((value) => value !== 0)).toBe(true);
  });

  it('stops offering capture after the view is destroyed', async () => {
    const { fixture } = await mount();
    fixture.destroy();
    expect(await TestBed.inject(HeatmapCapture).capture({ width: 8, height: 8 })).toBeNull();
  });
});
