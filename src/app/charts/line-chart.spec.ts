import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSpec } from '../../core/plot/chart-model';
import { LineChart, nextCursor } from './line-chart';

const SPEC: ChartSpec = {
  title: 'Test chart',
  description: 'A rising line.',
  x: { label: 'x (m)', min: -10, max: 10 },
  y: { label: 'y' },
  series: [
    {
      id: 'main',
      label: 'Line',
      points: Array.from({ length: 21 }, (_, index) => ({ x: index - 10, y: index })),
      colorIndex: 0,
      dash: '',
    },
    {
      id: 'peak',
      label: 'Peak',
      points: [{ x: 10, y: 20 }],
      showLine: false,
      marker: 'diamond',
      colorIndex: 6,
    },
  ],
  levelLines: [{ id: 'level', label: 'Limit', value: 5, dash: '6 3' }],
};

function mount(options: { cursor?: number | null; focusable?: boolean } = {}): {
  fixture: ComponentFixture<LineChart>;
  root: HTMLElement;
  moves: number[];
} {
  const fixture = TestBed.createComponent(LineChart);
  fixture.componentRef.setInput('spec', SPEC);
  fixture.componentRef.setInput('cursor', options.cursor ?? null);
  fixture.componentRef.setInput('focusable', options.focusable ?? false);
  fixture.componentRef.setInput('cursorLabel', 'Position');
  fixture.componentRef.setInput('cursorText', 'x = 1 m');
  const moves: number[] = [];
  fixture.componentInstance.cursorChange.subscribe((value) => moves.push(value));
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, moves };
}

describe('nextCursor', () => {
  const domain: readonly [number, number] = [-10, 10];

  it('moves by one step, ten with shift or page keys, and clamps', () => {
    expect(nextCursor('ArrowRight', false, 0, domain, 0.5)).toBe(0.5);
    expect(nextCursor('ArrowLeft', false, 0, domain, 0.5)).toBe(-0.5);
    expect(nextCursor('ArrowRight', true, 0, domain, 0.5)).toBe(5);
    expect(nextCursor('PageDown', false, 0, domain, 0.5)).toBe(-5);
    expect(nextCursor('PageUp', false, 8, domain, 0.5)).toBe(10);
    expect(nextCursor('ArrowLeft', true, -9, domain, 0.5)).toBe(-10);
  });

  it('jumps to the ends and ignores other keys', () => {
    expect(nextCursor('Home', false, 3, domain, 0.5)).toBe(-10);
    expect(nextCursor('End', false, 3, domain, 0.5)).toBe(10);
    expect(nextCursor('a', false, 3, domain, 0.5)).toBeNull();
  });
});

describe('the line chart', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  it('exposes a title and a text alternative to assistive technology', () => {
    const { root } = mount();
    const svg = root.querySelector('svg[role="img"]');
    const ids = (svg?.getAttribute('aria-labelledby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    expect(root.querySelector(`#${ids[0]}`)?.textContent).toBe('Test chart');
    expect(root.querySelector(`#${ids[1]}`)?.textContent).toContain('rising line');
  });

  it('draws the series, the limit line and a legend entry for each', () => {
    const { root } = mount();
    expect(root.querySelectorAll('path.series')).toHaveLength(1);
    expect(root.querySelectorAll('polygon.mark')).toHaveLength(2);
    expect(root.querySelectorAll('line.level').length).toBeGreaterThanOrEqual(2);
    const legend = Array.from(root.querySelectorAll('.key li')).map((item) =>
      item.textContent.trim(),
    );
    expect(legend).toEqual(['Line', 'Peak', 'Limit']);
  });

  it('shows the crosshair only when a cursor is set', () => {
    expect(mount().root.querySelector('line.cursor')).toBeNull();
    const { root } = mount({ cursor: 2 });
    expect(root.querySelector('line.cursor')).not.toBeNull();
    expect(root.querySelectorAll('circle.dot').length).toBeGreaterThan(0);
  });

  it('offers a keyboard slider only when focusable', () => {
    expect(mount().root.querySelector('[role="slider"]')).toBeNull();
    const { root, moves } = mount({ cursor: 0, focusable: true });
    const slider = root.querySelector<HTMLElement>('[role="slider"]');
    expect(slider?.getAttribute('aria-label')).toBe('Position');
    expect(slider?.getAttribute('aria-valuetext')).toBe('x = 1 m');
    expect(slider?.getAttribute('aria-valuenow')).toBe('0');
    expect(slider?.getAttribute('aria-valuemin')).toBe('-10');
    expect(slider?.getAttribute('aria-valuemax')).toBe('10');
    const press = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
      slider?.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press('ArrowRight')).toBe(true);
    expect(press('End')).toBe(true);
    expect(press('Tab')).toBe(false);
    expect(moves).toEqual([0.5, 10]);
  });

  it('turns a pointer position into a snapped cursor value', () => {
    const { root, moves } = mount({ cursor: 0 });
    const svg = root.querySelector('svg[role="img"]');
    svg?.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toBe(-10);
  });
});
