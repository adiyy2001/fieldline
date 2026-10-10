import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DASH_PATTERNS, type LevelEntry } from '../../core/exposure/contour-levels';
import {
  DEFAULT_CUSTOM_LABEL,
  MAXIMUM_LABEL_LENGTH,
  addCustomLevel,
  hasLevelEdits,
  hideReferenceLevel,
  removeCustomLevel,
} from '../../core/exposure/level-edits';
import { EXPOSURE_PRESETS, type FieldQuantity } from '../../core/exposure/levels';
import { selectedValue } from '../panel/form-events';
import { parseFieldNumber } from '../panel/number-field';
import { type LevelReadout, ProfileData } from '../profile/profile-data';
import { FieldStore } from '../state/field-store';

interface Section {
  readonly quantity: FieldQuantity;
  readonly heading: string;
  readonly levels: readonly LevelReadout[];
}

const QUANTITY_UNITS: Readonly<Record<FieldQuantity, string>> = {
  electric: 'kV/m',
  magnetic: 'µT',
};

@Component({
  selector: 'fl-level-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './level-editor.html',
  styleUrl: './level-editor.css',
})
export class LevelEditor {
  protected readonly store = inject(FieldStore);
  private readonly data = inject(ProfileData);

  protected readonly presets = EXPOSURE_PRESETS;
  protected readonly labelLimit = MAXIMUM_LABEL_LENGTH;
  protected readonly defaultLabel = DEFAULT_CUSTOM_LABEL;
  protected readonly quantity = signal<FieldQuantity>('electric');
  protected readonly valueText = signal('');
  protected readonly labelText = signal('');
  protected readonly message = signal('');

  protected readonly unit = computed(() => QUANTITY_UNITS[this.quantity()]);
  protected readonly edited = computed(() =>
    hasLevelEdits({
      customLevels: this.store.settings().customLevels,
      hiddenLevels: this.store.settings().hiddenLevels,
    }),
  );
  protected readonly hiddenCount = computed(() => this.store.settings().hiddenLevels.length);

  protected readonly sections = computed<readonly Section[]>(() => [
    { quantity: 'electric', heading: 'Electric field E', levels: this.data.electricLevels() },
    {
      quantity: 'magnetic',
      heading: 'Magnetic flux density B',
      levels: this.data.magneticLevels(),
    },
  ]);

  protected dash(level: LevelReadout): string {
    return (DASH_PATTERNS[level.dashIndex] ?? []).join(' ');
  }

  protected actionLabel(level: LevelReadout): string {
    return `${level.custom ? 'Remove' : 'Hide'} ${level.text}${level.custom ? '' : ', ' + level.name}`;
  }

  protected setPreset(event: Event): void {
    const preset = this.presets.find((candidate) => candidate.id === selectedValue(event));
    if (preset !== undefined) {
      this.store.setSettings({ presetId: preset.id });
    }
  }

  protected setQuantity(event: Event): void {
    const value = selectedValue(event);
    if (value === 'electric' || value === 'magnetic') {
      this.quantity.set(value);
      this.message.set('');
    }
  }

  protected setValue(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.valueText.set(event.target.value);
    }
  }

  protected setLabel(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.labelText.set(event.target.value);
    }
  }

  protected add(): void {
    const quantity = this.quantity();
    const value = parseFieldNumber(this.valueText());
    if (value === null) {
      this.message.set(`Enter a level in ${QUANTITY_UNITS[quantity]}`);
      return;
    }
    const settings = this.store.settings();
    const visible = (
      quantity === 'electric' ? this.data.electricLevels() : this.data.magneticLevels()
    ).map((level) => level.value);
    const result = addCustomLevel(
      { customLevels: settings.customLevels, hiddenLevels: settings.hiddenLevels },
      { quantity, value, label: this.labelText() },
      visible,
    );
    if (result.status === 'rejected') {
      this.message.set(result.issue);
      return;
    }
    this.store.setSettings({
      customLevels: result.edits.customLevels,
      hiddenLevels: result.edits.hiddenLevels,
    });
    this.valueText.set('');
    this.labelText.set('');
    this.message.set(`Added ${String(value)} ${QUANTITY_UNITS[quantity]}`);
  }

  protected submitOnEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.add();
    }
  }

  protected removeOrHide(level: LevelReadout & Pick<LevelEntry, 'key'>): void {
    const settings = this.store.settings();
    const edits = { customLevels: settings.customLevels, hiddenLevels: settings.hiddenLevels };
    const next = level.custom
      ? removeCustomLevel(edits, {
          quantity: level.quantity,
          value: level.value,
          label: '',
        })
      : hideReferenceLevel(edits, level.quantity, level.value);
    this.store.setSettings({ customLevels: next.customLevels, hiddenLevels: next.hiddenLevels });
    this.message.set(`${level.custom ? 'Removed' : 'Hidden'} ${level.text}`);
  }

  protected reset(): void {
    this.store.setSettings({ customLevels: [], hiddenLevels: [] });
    this.message.set('Levels restored');
  }
}
