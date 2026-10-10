import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { FieldStore } from '../state/field-store';
import { storeProviders } from '../testing/store-providers';
import { Shortcuts } from './shortcuts';
import { UiState } from './ui-state';

function setup() {
  TestBed.configureTestingModule({ providers: storeProviders() });
  return {
    store: TestBed.inject(FieldStore),
    shortcuts: TestBed.inject(Shortcuts),
    ui: TestBed.inject(UiState),
  };
}

function press(key: string, target: EventTarget | null = document.body, init = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('keyboard shortcuts', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('switches the field with e and b', () => {
    const { store, shortcuts } = setup();
    expect(shortcuts.handle(press('b'))).toBe(true);
    expect(store.settings().quantity).toBe('magnetic');
    shortcuts.handle(press('E'));
    expect(store.settings().quantity).toBe('electric');
  });

  it('toggles rms and instantaneous with r', () => {
    const { store, shortcuts } = setup();
    shortcuts.handle(press('r'));
    expect(store.settings().mode).toBe('instantaneous');
    shortcuts.handle(press('r'));
    expect(store.settings().mode).toBe('rms');
  });

  it('plays and pauses with space', () => {
    const { store, shortcuts } = setup();
    store.setPlaying(true);
    shortcuts.handle(press(' '));
    expect(store.playing()).toBe(false);
    shortcuts.handle(press(' '));
    expect(store.playing()).toBe(true);
  });

  it('leaves space to buttons, tabs and inputs', () => {
    const { store, shortcuts } = setup();
    store.setPlaying(true);
    const button = document.createElement('button');
    const tab = document.createElement('div');
    tab.setAttribute('role', 'tab');
    expect(shortcuts.handle(press(' ', button))).toBe(false);
    expect(shortcuts.handle(press(' ', tab))).toBe(false);
    expect(store.playing()).toBe(true);
  });

  it('steps the phase with the bracket keys', () => {
    const { store, shortcuts } = setup();
    shortcuts.handle(press(']'));
    shortcuts.handle(press(']'));
    shortcuts.handle(press('['));
    expect(store.settings().phaseDegrees).toBe(15);
    expect(store.settings().mode).toBe('instantaneous');
  });

  it('selects the ground view with 1 and ignores views that are not built', () => {
    const { store, shortcuts } = setup();
    expect(shortcuts.handle(press('1'))).toBe(true);
    expect(shortcuts.handle(press('4'))).toBe(false);
    expect(store.view()).toBe('ground');
  });

  it('opens and closes the help with a question mark', () => {
    const { ui, shortcuts } = setup();
    shortcuts.handle(press('?'));
    expect(ui.helpOpen()).toBe(true);
    ui.closeHelp();
    expect(ui.helpOpen()).toBe(false);
  });

  it('does nothing while a number field has focus', () => {
    const { store, shortcuts } = setup();
    const input = document.createElement('input');
    input.type = 'number';
    expect(shortcuts.handle(press('b', input))).toBe(false);
    expect(store.settings().quantity).toBe('electric');
  });

  it('does nothing with a modifier or while the help is open', () => {
    const { store, shortcuts, ui } = setup();
    expect(shortcuts.handle(press('b', document.body, { ctrlKey: true }))).toBe(false);
    ui.openHelp();
    expect(shortcuts.handle(press('b'))).toBe(false);
    expect(store.settings().quantity).toBe('electric');
  });

  it('listens on a target and stops when destroyed', () => {
    const { store, shortcuts } = setup();
    const target = new EventTarget();
    TestBed.runInInjectionContext(() => {
      shortcuts.attach(target);
    });
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(store.settings().quantity).toBe('magnetic');
    TestBed.resetTestingModule();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    expect(store.settings().quantity).toBe('magnetic');
  });
});
