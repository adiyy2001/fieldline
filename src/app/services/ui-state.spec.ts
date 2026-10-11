import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORTCUTS_STORAGE_KEY, UiState } from './ui-state';

function freshState(): UiState {
  TestBed.resetTestingModule();
  return TestBed.inject(UiState);
}

describe('the interface state', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('opens, closes and toggles the help', () => {
    const ui = freshState();
    ui.openHelp();
    expect(ui.helpOpen()).toBe(true);
    ui.closeHelp();
    expect(ui.helpOpen()).toBe(false);
    ui.toggleHelp();
    expect(ui.helpOpen()).toBe(true);
  });

  it('starts with the single-key shortcuts on', () => {
    expect(freshState().shortcutsEnabled()).toBe(true);
  });

  it('remembers that the shortcuts were turned off', () => {
    freshState().setShortcutsEnabled(false);
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('off');
    expect(freshState().shortcutsEnabled()).toBe(false);
    freshState().setShortcutsEnabled(true);
    expect(freshState().shortcutsEnabled()).toBe(true);
  });

  it('keeps working when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const ui = freshState();
    expect(ui.shortcutsEnabled()).toBe(true);
    ui.setShortcutsEnabled(false);
    expect(ui.shortcutsEnabled()).toBe(false);
  });
});
