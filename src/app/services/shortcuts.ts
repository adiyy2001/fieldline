import { DestroyRef, DOCUMENT, Injectable, inject } from '@angular/core';
import { PHASE_STEP_DEGREES, VIEW_DEFINITIONS } from '../../core/model/settings';
import { FieldStore } from '../state/field-store';
import { VIEW_AVAILABILITY, isThreeDView } from '../state/views';
import { UiState } from './ui-state';

export interface ShortcutDescription {
  readonly keys: string;
  readonly action: string;
}

export const SHORTCUT_DESCRIPTIONS: readonly ShortcutDescription[] = [
  ...VIEW_DEFINITIONS.filter((definition) => VIEW_AVAILABILITY.includes(definition)).map(
    (definition) => ({ keys: definition.key, action: `Show the ${definition.label} view` }),
  ),
  { keys: 'Space', action: 'Play or pause the animation' },
  { keys: '[  ]', action: `Step the phase by ${String(PHASE_STEP_DEGREES)} degrees` },
  { keys: 'Arrow keys', action: 'Move the probe while the heatmap has focus' },
  {
    keys: 'Arrow keys  + -  0',
    action: 'Orbit, zoom and reset the camera while a 3D view has focus',
  },
  { keys: 'E  B', action: 'Show the electric or the magnetic field' },
  { keys: 'R', action: 'Switch between rms and instantaneous values' },
  { keys: '?', action: 'Show or hide this help' },
];

const TEXT_ENTRY_TYPES: readonly string[] = [
  'text',
  'number',
  'search',
  'email',
  'url',
  'password',
];

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return TEXT_ENTRY_TYPES.includes(target.type);
  }
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function activatesOnSpace(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLAnchorElement ||
      target.getAttribute('role') === 'tab')
  );
}

@Injectable({ providedIn: 'root' })
export class Shortcuts {
  private readonly store = inject(FieldStore);
  private readonly ui = inject(UiState);
  private readonly destroyRef = inject(DestroyRef);

  attach(target: EventTarget = inject(DOCUMENT)): void {
    const listener = (event: Event): void => {
      if (event instanceof KeyboardEvent && this.handle(event)) {
        event.preventDefault();
      }
    };
    target.addEventListener('keydown', listener);
    this.destroyRef.onDestroy(() => {
      target.removeEventListener('keydown', listener);
    });
  }

  handle(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) {
      return false;
    }
    if (this.ui.helpOpen()) {
      return false;
    }
    return this.run(event);
  }

  private run(event: KeyboardEvent): boolean {
    const view = VIEW_AVAILABILITY.find((definition) => definition.key === event.key);
    if (view !== undefined) {
      if (isThreeDView(view.id) && !this.store.threeDAvailable()) {
        return false;
      }
      this.store.setView(view.id);
      return true;
    }
    switch (event.key) {
      case ' ':
        if (activatesOnSpace(event.target)) {
          return false;
        }
        this.store.togglePlaying();
        return true;
      case '[':
        this.store.stepPhase(-1);
        return true;
      case ']':
        this.store.stepPhase(1);
        return true;
      case 'e':
      case 'E':
        this.store.setSettings({ quantity: 'electric' });
        return true;
      case 'b':
      case 'B':
        this.store.setSettings({ quantity: 'magnetic' });
        return true;
      case 'r':
      case 'R':
        this.store.setSettings({
          mode: this.store.settings().mode === 'rms' ? 'instantaneous' : 'rms',
        });
        return true;
      case '?':
        this.ui.toggleHelp();
        return true;
      default:
        return false;
    }
  }
}
