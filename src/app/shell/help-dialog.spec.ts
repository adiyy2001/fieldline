import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SHORTCUT_DESCRIPTIONS } from '../services/shortcuts';
import { UiState } from '../services/ui-state';
import { HelpDialog } from './help-dialog';

function mount() {
  const fixture = TestBed.createComponent(HelpDialog);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const dialog = root.querySelector('dialog');
  if (dialog === null) {
    throw new Error('dialog missing');
  }
  return { fixture, root, dialog, ui: TestBed.inject(UiState) };
}

describe('the help dialog', () => {
  it('lists every shortcut', () => {
    const { root } = mount();
    expect(root.querySelectorAll('dt kbd')).toHaveLength(SHORTCUT_DESCRIPTIONS.length);
    expect(root.querySelector('dialog')?.getAttribute('aria-labelledby')).toBe('fl-help-title');
    expect(root.querySelector('#fl-help-title')?.textContent).toBe('Keyboard shortcuts');
  });

  it('opens and closes with the shared state', async () => {
    const { fixture, dialog, ui } = mount();
    expect(dialog.open).toBe(false);
    ui.openHelp();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    ui.closeHelp();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
  });

  it('closes the shared state when the dialog closes itself', async () => {
    const { fixture, dialog, ui } = mount();
    ui.openHelp();
    fixture.detectChanges();
    await fixture.whenStable();
    dialog.dispatchEvent(new Event('close'));
    expect(ui.helpOpen()).toBe(false);
  });
});
