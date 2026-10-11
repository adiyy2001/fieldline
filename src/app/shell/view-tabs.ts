import { ChangeDetectionStrategy, Component, ElementRef, effect, inject } from '@angular/core';
import type { ViewId } from '../../core/model/settings';
import { UiState } from '../services/ui-state';
import { FieldStore } from '../state/field-store';
import { VIEW_AVAILABILITY, isThreeDView } from '../state/views';

export function nextTabIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

@Component({
  selector: 'fl-view-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './view-tabs.html',
  styleUrl: './view-tabs.css',
})
export class ViewTabs {
  protected readonly store = inject(FieldStore);
  protected readonly ui = inject(UiState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tabs = VIEW_AVAILABILITY;

  constructor() {
    effect(() => {
      const selected = this.store.view();
      queueMicrotask(() => {
        const tab = this.host.nativeElement.querySelector<HTMLElement>(`#fl-tab-${selected}`);
        if (tab !== null && 'scrollIntoView' in tab) {
          tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        }
      });
    });
  }

  protected disabled(view: ViewId): boolean {
    return isThreeDView(view) && !this.store.threeDAvailable();
  }

  protected select(view: ViewId): void {
    this.store.setView(view);
  }

  protected navigate(event: KeyboardEvent, index: number): void {
    const target = nextTabIndex(event.key, index, this.tabs.length);
    const definition = target === null ? undefined : this.tabs[target];
    if (target === null || definition === undefined) {
      return;
    }
    event.preventDefault();
    if (!this.disabled(definition.id)) {
      this.store.setView(definition.id);
    }
    this.host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  }
}
