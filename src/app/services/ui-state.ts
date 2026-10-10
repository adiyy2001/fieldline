import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiState {
  private readonly help = signal(false);

  readonly helpOpen = this.help.asReadonly();

  openHelp(): void {
    this.help.set(true);
  }

  closeHelp(): void {
    this.help.set(false);
  }

  toggleHelp(): void {
    this.help.update((open) => !open);
  }
}
