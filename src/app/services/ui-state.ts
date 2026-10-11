import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export const SHORTCUTS_STORAGE_KEY = 'fieldline.single-key-shortcuts';

@Injectable({ providedIn: 'root' })
export class UiState {
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;
  private readonly help = signal(false);
  private readonly shortcuts = signal(this.readShortcutsEnabled());

  readonly helpOpen = this.help.asReadonly();
  readonly shortcutsEnabled = this.shortcuts.asReadonly();

  openHelp(): void {
    this.help.set(true);
  }

  closeHelp(): void {
    this.help.set(false);
  }

  toggleHelp(): void {
    this.help.update((open) => !open);
  }

  setShortcutsEnabled(enabled: boolean): void {
    this.shortcuts.set(enabled);
    this.writeShortcutsEnabled(enabled);
  }

  private readShortcutsEnabled(): boolean {
    try {
      return this.storage?.getItem(SHORTCUTS_STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  private writeShortcutsEnabled(enabled: boolean): void {
    try {
      this.storage?.setItem(SHORTCUTS_STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      return;
    }
  }
}
