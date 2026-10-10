import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FieldStore } from '../state/field-store';
import { storeProviders } from '../testing/store-providers';
import { ViewTabs, nextTabIndex } from './view-tabs';

function mount(): {
  fixture: ComponentFixture<ViewTabs>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
} {
  TestBed.configureTestingModule({ providers: storeProviders() });
  const fixture = TestBed.createComponent(ViewTabs);
  fixture.detectChanges();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(FieldStore),
  };
}

describe('view tabs', () => {
  it('exposes a tablist with the ground tab selected', () => {
    const { root } = mount();
    expect(root.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Views');
    const tabs = root.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-controls')).toBe('fl-view-ground');
    expect(tabs[0]?.getAttribute('tabindex')).toBe('0');
    expect(tabs[0]?.textContent).toContain('Ground');
    expect(Array.from(tabs).map((tab) => tab.getAttribute('aria-controls'))).toEqual([
      'fl-view-ground',
      'fl-view-profile',
      'fl-view-optimizer',
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
});
