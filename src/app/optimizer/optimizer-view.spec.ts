import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import { OptimizerView } from './optimizer-view';

async function mount(search = '?v=1&t=dc'): Promise<{
  fixture: ComponentFixture<OptimizerView>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
}> {
  TestBed.configureTestingModule({ providers: storeProviders({ search }) });
  const fixture = TestBed.createComponent(OptimizerView);
  const store = TestBed.inject(FieldStore);
  fixture.detectChanges();
  await until(() => store.status() === 'ready');
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, store };
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid="optimizer-table"] tbody tr'));
}

function labels(root: HTMLElement): string[] {
  return rows(root).map((row) => row.querySelector('.letters')?.textContent.trim() ?? '');
}

describe('the optimizer view', () => {
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

  it('explains that a single circuit tower has nothing to compare and offers the switch', async () => {
    const { fixture, root, store } = await mount('');
    expect(root.querySelector('[data-testid="optimizer-unsupported"]')).not.toBeNull();
    expect(root.querySelector('table')).toBeNull();
    root.querySelector<HTMLButtonElement>('.notice button')?.click();
    fixture.detectChanges();
    expect(store.parameters().tower.kind).toBe('double-circuit');
  });

  it('lists the six arrangements with best, worst and current marked', async () => {
    const { root } = await mount();
    expect(rows(root)).toHaveLength(6);
    const best = rows(root)[0];
    expect(best?.classList.contains('best')).toBe(true);
    expect(best?.textContent).toContain('best');
    const current = rows(root).find((row) => row.classList.contains('current'));
    expect(current?.querySelector('.letters')?.textContent.trim()).toBe('ABC | ABC');
    expect(root.querySelector('.worst')).not.toBeNull();
  });

  it('describes each row for assistive technology', async () => {
    const { root } = await mount();
    const label = rows(root)[0]?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/^Rank 1, ABC \| [ABC]{3}, top to bottom, left circuit phase A/);
    expect(label).toContain('best');
  });

  it('sorts by a column header and reports aria-sort', async () => {
    const { fixture, root } = await mount();
    const byRank = labels(root);
    const header = Array.from(root.querySelectorAll<HTMLButtonElement>('button.sort')).find(
      (button) => button.textContent.trim() === 'Arrangement',
    );
    header?.click();
    fixture.detectChanges();
    expect(labels(root)).toEqual([...byRank].sort((a, b) => a.localeCompare(b)));
    expect(header?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    header?.click();
    fixture.detectChanges();
    expect(header?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('keeps one row in the tab order and moves with the arrow keys', async () => {
    const { fixture, root } = await mount();
    const tabbable = () => rows(root).filter((row) => row.tabIndex === 0);
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(rows(root)[0]);
    const press = (key: string, index: number) =>
      rows(root)[index]?.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    press('ArrowDown', 0);
    fixture.detectChanges();
    expect(tabbable()[0]).toBe(rows(root)[1]);
    press('End', 1);
    fixture.detectChanges();
    expect(tabbable()[0]).toBe(rows(root)[5]);
    press('ArrowUp', 5);
    press('Home', 4);
    fixture.detectChanges();
    expect(tabbable()[0]).toBe(rows(root)[0]);
  });

  it('applies an arrangement with Enter and with the button', async () => {
    const { fixture, root, store } = await mount();
    const first = rows(root)[0];
    const expected = first?.querySelector('.letters')?.textContent.trim();
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    fixture.detectChanges();
    expect(store.parameters().phasing).not.toEqual([0, 1, 2, 0, 1, 2]);
    expect(root.querySelector('[data-testid="optimizer-announcement"]')?.textContent).toContain(
      `Applied ${expected ?? ''}`,
    );
    const applyButtons = root.querySelectorAll<HTMLButtonElement>('button.apply');
    expect(Array.from(applyButtons).filter((button) => button.disabled)).toHaveLength(1);
    const target = Array.from(applyButtons).find((button) => !button.disabled);
    target?.click();
    expect([...store.parameters().phasing].sort()).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('re-ranks with another criterion', async () => {
    const { fixture, root, store } = await mount();
    const select = root.querySelector<HTMLSelectElement>('#fl-rank-criterion');
    if (select === null) {
      throw new Error('no select');
    }
    select.value = 'magnetic-at-distance';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(store.settings().rankCriterion).toBe('magnetic-at-distance');
    expect(root.querySelector('[data-testid="optimizer-summary"]')?.textContent).toContain(
      'magnetic flux density at a distance',
    );
  });

  it('draws the best against worst chart and the explanation', async () => {
    const { root } = await mount();
    expect(root.querySelectorAll('fl-line-chart')).toHaveLength(1);
    expect(
      root.querySelectorAll('[data-testid="optimizer-explanation"] li').length,
    ).toBeGreaterThanOrEqual(4);
    expect(root.querySelector('[data-testid="optimizer-explanation"]')?.textContent).toContain(
      'percent lower',
    );
  });

  it('changes the ranking distance from the field', async () => {
    const { root, store } = await mount();
    const input = Array.from(root.querySelectorAll('label'))
      .find((label) => label.textContent.trim() === 'Distance from the axis')
      ?.getAttribute('for');
    const field = root.querySelector<HTMLInputElement>(`#${input ?? 'none'}`);
    if (field === null) {
      throw new Error('no field');
    }
    field.value = '45';
    field.dispatchEvent(new Event('change'));
    expect(store.settings().rankDistance).toBe(45);
  });
});
