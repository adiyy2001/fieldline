import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface FieldEdit {
  readonly value: number;
  readonly interactive: boolean;
}

let nextFieldId = 0;

export function parseFieldNumber(text: string): number | null {
  if (text.trim() === '') {
    return null;
  }
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

@Component({
  selector: 'fl-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './number-field.html',
  styleUrl: './number-field.css',
})
export class NumberField {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly step = input.required<number>();
  readonly unit = input('');
  readonly issue = input<string | null>(null);
  readonly slider = input(true);
  readonly edited = output<FieldEdit>();

  private readonly serial = nextFieldId++;
  protected readonly inputId = `fl-field-${String(this.serial)}`;
  protected readonly issueId = `fl-field-issue-${String(this.serial)}`;
  protected readonly unitId = `fl-field-unit-${String(this.serial)}`;
  protected readonly describedBy = computed(() => {
    const ids = [
      ...(this.unit() === '' ? [] : [this.unitId]),
      ...(this.issue() === null ? [] : [this.issueId]),
    ];
    return ids.length === 0 ? null : ids.join(' ');
  });
  protected readonly sliderValue = computed(() =>
    Math.min(this.max(), Math.max(this.min(), this.value())),
  );

  protected typed(event: Event): void {
    this.emit(event, true);
  }

  protected committed(event: Event): void {
    this.emit(event, false);
  }

  private emit(event: Event, interactive: boolean): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    const value = parseFieldNumber(event.target.value);
    if (value !== null) {
      this.edited.emit({ value, interactive });
    }
  }
}
