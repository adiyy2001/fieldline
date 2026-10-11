import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { until } from '../testing/doubles';
import { FieldStore } from '../state/field-store';
import { UiState } from '../services/ui-state';
import { storeProviders } from '../testing/store-providers';
import { ViewTabs, nextTabIndex } from './view-tabs';

function mount(gpu = false): {
  fixture: ComponentFixture<ViewTabs>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
} {
  TestBed.configureTestingModule({ providers: storeProviders({ gpu }) });
  const fixture = TestBed.createComponent(ViewTabs);
  fixture.detectChanges();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(FieldStore),
  };
}

describe('view tabs', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('hides the key hints and the aria-keyshortcuts while the shortcuts are off', () => {
    const { fixture, root } = mount();
    const tab = root.querySelector('[role="tab"]');
    expect(tab?.getAttribute('aria-keyshortcuts')).toBe('1');
    expect(tab?.querySelector('kbd')).not.toBeNull();
    TestBed.inject(UiState).setShortcutsEnabled(false);
    fixture.detectChanges();
    expect(tab?.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(tab?.querySelector('kbd')).toBeNull();
  });

  it('exposes a tablist with the ground tab selected', () => {
    const { root } = mount();
    expect(root.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Views');
    const tabs = root.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-controls')).toBe('fl-view-ground');
    expect(tabs[0]?.getAttribute('tabindex')).toBe('0');
    expect(tabs[0]?.textContent).toContain('Ground');
    expect(Array.from(tabs).map((tab) => tab.getAttribute('aria-controls'))).toEqual([
      'fl-view-ground',
      'fl-view-profile',
      'fl-view-optimizer',
      'fl-view-volume',
      'fl-view-isosurface',
      'fl-view-lines',
    ]);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false');
    expect(tabs[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('wraps the arrow keys and supports home and end', () => {
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
    expect(nextTabIndex('a', 0, 3)).toBeNull();
  });

  it('selects the clicked tab', () => {
    const { root, store, fixture } = mount();
    root.querySelector<HTMLElement>('[role="tab"]')?.click();
    fixture.detectChanges();
    expect(store.view()).toBe('ground');
  });

  it('switches to the profile and optimizer tabs and moves with the arrow keys', () => {
    const { root, store, fixture } = mount();
    const tabs = root.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs[1]?.click();
    fixture.detectChanges();
    expect(store.view()).toBe('profile');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    tabs[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    fixture.detectChanges();
    expect(store.view()).toBe('optimizer');
    tabs[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }));
    expect(store.view()).toBe('ground');
  });

  it('disables the 3D tabs and points them to the notice without WebGPU', async () => {
    const { root, store, fixture } = mount();
    await until(() => store.status() === 'ready');
    fixture.detectChanges();
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.slice(0, 3).map((tab) => tab.getAttribute('aria-disabled'))).toEqual([
      null,
      null,
      null,
    ]);
    for (const tab of tabs.slice(3)) {
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      expect(tab.getAttribute('aria-describedby')).toBe('fl-views3d-notice');
    }
    tabs[3]?.click();
    tabs[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    fixture.detectChanges();
    expect(store.view()).toBe('ground');
  });

  it('enables the 3D tabs on a WebGPU device', async () => {
    const { root, store, fixture } = mount(true);
    await until(() => store.status() === 'ready');
    fixture.detectChanges();
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.every((tab) => tab.getAttribute('aria-disabled') === null)).toBe(true);
    tabs[4]?.click();
    fixture.detectChanges();
    expect(store.view()).toBe('isosurface');
    tabs[4]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(store.view()).toBe('lines');
  });
});
