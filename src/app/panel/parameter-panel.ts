import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  CONDUCTOR_RANGES,
  ELECTRICAL_RANGES,
  type NumberRange,
  TOWER_RANGES,
} from '../../core/model/parameters';
import type { FieldQuantity } from '../../core/exposure/levels';
import { TOWER_KINDS, TOWER_LABELS } from '../../core/geometry/tower';
import {
  type DisplayMode,
  EVALUATION_HEIGHTS,
  FULL_CYCLE_DEGREES,
  MODEL_LABELS,
  type ModelKind,
  PHASE_STEP_DEGREES,
} from '../../core/model/settings';
import { PHASE_NAMES, phasePositionLabels } from '../../core/model/phase-labels';
import { TOWER_FIELD_KEYS, towerFieldValues } from '../../core/model/tower-fields';
import { FieldStore } from '../state/field-store';
import { LevelEditor } from '../exposure/level-editor';
import { type FieldEdit, NumberField } from './number-field';
import { selectedValue } from './form-events';

interface FieldModel {
  readonly key: string;
  readonly range: NumberRange;
  readonly value: number;
}

type NumericParameter =
  | 'lineToLineKilovolts'
  | 'currentAmperes'
  | 'powerFactorAngleDegrees'
  | 'phaseSag'
  | 'shieldSagRatio'
  | 'bundleCount'
  | 'bundleSpacingMetres'
  | 'subconductorDiameterMillimetres'
  | 'shieldDiameterMillimetres';

const SPAN_COUNTS: readonly number[] = [2, 3];
const FREQUENCIES: readonly number[] = [50, 60];

@Component({
  selector: 'fl-parameter-panel',
  imports: [LevelEditor, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './parameter-panel.html',
  styleUrl: './parameter-panel.css',
})
export class ParameterPanel {
  protected readonly store = inject(FieldStore);

  protected readonly towerKinds = TOWER_KINDS.map((kind) => ({
    kind,
    label: TOWER_LABELS[kind],
  }));
  protected readonly models = (Object.keys(MODEL_LABELS) as ModelKind[]).map((model) => ({
    model,
    label: MODEL_LABELS[model],
  }));
  protected readonly heights = EVALUATION_HEIGHTS;
  protected readonly spanCounts = SPAN_COUNTS;
  protected readonly frequencies = FREQUENCIES;
  protected readonly phaseNames = PHASE_NAMES;
  protected readonly phaseRange = {
    min: 0,
    max: FULL_CYCLE_DEGREES - PHASE_STEP_DEGREES,
    step: PHASE_STEP_DEGREES,
  };
  protected readonly phaseText = computed(() =>
    String(Math.round(this.store.settings().phaseDegrees)),
  );
  protected readonly electrical = ELECTRICAL_RANGES;
  protected readonly conductor = CONDUCTOR_RANGES;

  protected readonly towerFields = computed<readonly FieldModel[]>(() => {
    const tower = this.store.parameters().tower;
    const values = towerFieldValues(tower);
    return TOWER_FIELD_KEYS[tower.kind].flatMap((key, index) => {
      const range = TOWER_RANGES[key];
      const value = values[index];
      return range === undefined || value === undefined ? [] : [{ key, range, value }];
    });
  });
  protected readonly spans = computed(() =>
    this.store.parameters().spanLengths.map((length, index) => ({ index, length })),
  );
  protected readonly positions = computed(() => {
    const parameters = this.store.parameters();
    return phasePositionLabels(parameters.tower.kind).map((label, index) => ({
      index,
      label,
      phase: parameters.phasing[index] ?? 0,
    }));
  });
  protected readonly instantaneous = computed(() => this.store.settings().mode === 'instantaneous');

  protected issue(field: string): string | null {
    return this.store.issues().find((entry) => entry.field === field)?.message ?? null;
  }

  protected setTower(event: Event): void {
    const value = selectedValue(event);
    const kind = TOWER_KINDS.find((candidate) => candidate === value);
    if (kind !== undefined) {
      this.store.setTowerKind(kind);
    }
  }

  protected setModel(event: Event): void {
    const value = selectedValue(event);
    const model = this.models.find((entry) => entry.model === value);
    if (model !== undefined) {
      this.store.setSettings({ model: model.model });
    }
  }

  protected setQuantity(quantity: FieldQuantity): void {
    this.store.setSettings({ quantity });
  }

  protected setMode(mode: DisplayMode): void {
    this.store.setSettings({ mode });
  }

  protected setHeight(event: Event): void {
    const height = this.heights.find((candidate) => String(candidate) === selectedValue(event));
    if (height !== undefined) {
      this.store.setSettings({ evaluationHeight: height });
    }
  }

  protected setPhaseFromSlider(event: Event): void {
    const value = Number(selectedValue(event));
    if (Number.isFinite(value)) {
      this.store.setSettings({ mode: 'instantaneous' });
      this.store.setPlaying(false);
      this.store.setPhase(value);
    }
  }

  protected setSpanCount(event: Event): void {
    const count = this.spanCounts.find((candidate) => String(candidate) === selectedValue(event));
    if (count !== undefined) {
      this.store.setSpanCount(count);
    }
  }

  protected setFrequency(event: Event): void {
    const frequency = this.frequencies.find(
      (candidate) => String(candidate) === selectedValue(event),
    );
    if (frequency !== undefined) {
      this.store.setParameters({ frequencyHz: frequency });
    }
  }

  protected setPhaseAt(position: number, event: Event): void {
    const phase = Number(selectedValue(event));
    if (Number.isInteger(phase) && phase >= 0 && phase < PHASE_NAMES.length) {
      this.store.setPhaseAssignment(position, phase);
    }
  }

  protected setNumber(key: NumericParameter, edit: FieldEdit): void {
    this.store.setParameters({ [key]: edit.value }, { interactive: edit.interactive });
  }

  protected setTowerValue(key: string, edit: FieldEdit): void {
    this.store.setTowerField(key, edit.value, { interactive: edit.interactive });
  }

  protected setSpan(index: number, edit: FieldEdit): void {
    this.store.setSpanLength(index, edit.value, { interactive: edit.interactive });
  }
}
