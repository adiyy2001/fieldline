import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import type { ViewId } from '../../core/model/settings';
import { FieldStore } from '../state/field-store';
import { VIEW_AVAILABILITY } from '../state/views';

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tabs = VIEW_AVAILABILITY;

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
    this.store.setView(definition.id);
    this.host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  }
}
