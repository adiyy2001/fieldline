import type { ElementRef } from '@angular/core';
import { ChangeDetectionStrategy, Component, effect, inject, viewChild } from '@angular/core';
import { SHORTCUT_DESCRIPTIONS } from '../services/shortcuts';
import { UiState } from '../services/ui-state';

@Component({
  selector: 'fl-help-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './help-dialog.html',
  styleUrl: './help-dialog.css',
})
export class HelpDialog {
  protected readonly ui = inject(UiState);
  protected readonly shortcuts = SHORTCUT_DESCRIPTIONS;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.ui.helpOpen() && !element.open) {
        if (typeof element.showModal === 'function') {
          element.showModal();
        } else {
          element.setAttribute('open', '');
        }
      } else if (!this.ui.helpOpen() && element.open) {
        if (typeof element.close === 'function') {
          element.close();
        } else {
          element.removeAttribute('open');
        }
      }
    });
  }

  protected toggled(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.ui.setShortcutsEnabled(event.target.checked);
    }
  }

  protected closed(): void {
    this.ui.closeHelp();
  }
}
