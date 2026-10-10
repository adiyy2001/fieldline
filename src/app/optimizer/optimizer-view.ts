import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { RankCriterion } from '../../core/optimizer/ranking';
import { arrangementPhasing } from '../../core/optimizer/arrangements';
import { RANK_DISTANCE_RANGE } from '../../core/model/settings';
import { LineChart } from '../charts/line-chart';
import { selectedValue } from '../panel/form-events';
import { type FieldEdit, NumberField } from '../panel/number-field';
import { FieldStore } from '../state/field-store';
import { OptimizerData } from './optimizer-data';
import {
  CRITERIA,
  CRITERION_LABELS,
  type OptimizerRow,
  type SortColumn,
  type SortDirection,
  arrangementSpelling,
  nextSort,
  sortRows,
} from './optimizer-model';

interface ColumnHeader {
  readonly column: SortColumn;
  readonly label: string;
}

const COLUMNS: readonly ColumnHeader[] = [
  { column: 'rank', label: 'Rank' },
  { column: 'arrangement', label: 'Arrangement' },
  { column: 'peakElectric', label: 'Peak E (kV/m)' },
  { column: 'peakMagnetic', label: 'Peak B (µT)' },
  { column: 'electricAtDistance', label: 'E at distance (kV/m)' },
  { column: 'magneticAtDistance', label: 'B at distance (µT)' },
];

@Component({
  selector: 'fl-optimizer-view',
  imports: [LineChart, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './optimizer-view.html',
  styleUrl: './optimizer-view.css',
})
export class OptimizerView {
  protected readonly store = inject(FieldStore);
  protected readonly data = inject(OptimizerData);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly criteria = CRITERIA.map((criterion) => ({
    criterion,
    label: CRITERION_LABELS[criterion],
  }));
  protected readonly columns = COLUMNS;
  protected readonly distanceRange = RANK_DISTANCE_RANGE;
  protected readonly sort = signal<{ column: SortColumn; direction: SortDirection }>({
    column: 'rank',
    direction: 'ascending',
  });
  protected readonly activeKey = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected readonly sortedRows = computed(() => {
    const { column, direction } = this.sort();
    return sortRows(this.data.rows(), column, direction);
  });
  protected readonly focusKey = computed(() => {
    const rows = this.sortedRows();
    const key = this.activeKey();
    return rows.some((row) => row.key === key) ? key : (rows[0]?.key ?? null);
  });

  protected readonly summary = computed(() => {
    const pair = this.data.bestWorst();
    const explanation = this.data.explanation();
    if (pair === null || explanation === null) {
      return '';
    }
    return `Ranked by ${CRITERION_LABELS[this.data.criterion()].toLowerCase()}. Best ${pair.best.result.label}, worst ${pair.worst.result.label}, ${Number(explanation.reductionPercent.toPrecision(3))} percent lower.`;
  });

  protected ariaSort(column: SortColumn): string {
    const { column: active, direction } = this.sort();
    return active === column ? direction : 'none';
  }

  protected sortBy(column: SortColumn): void {
    this.sort.update((current) => nextSort(current, column));
  }

  protected rowLabel(row: OptimizerRow): string {
    const tags = [
      row.best ? 'best' : '',
      row.worst ? 'worst' : '',
      row.current ? 'current' : '',
    ].filter((tag) => tag !== '');
    return `Rank ${String(row.rank)}, ${row.label}, ${arrangementSpelling(row.arrangement)}${tags.length > 0 ? ', ' + tags.join(', ') : ''}`;
  }

  protected setCriterion(event: Event): void {
    const criterion: RankCriterion | undefined = CRITERIA.find(
      (candidate) => candidate === selectedValue(event),
    );
    if (criterion !== undefined) {
      this.store.setSettings({ rankCriterion: criterion });
    }
  }

  protected setDistance(edit: FieldEdit): void {
    this.store.setSettings({ rankDistance: edit.value });
  }

  protected apply(row: OptimizerRow): void {
    this.store.setParameters({ phasing: arrangementPhasing(row.arrangement) });
    this.activeKey.set(row.key);
    this.announcement.set(`Applied ${row.label}`);
  }

  protected useDoubleCircuit(): void {
    this.store.setTowerKind('double-circuit');
  }

  protected rowKey(event: KeyboardEvent, row: OptimizerRow): void {
    const rows = this.sortedRows();
    const index = rows.findIndex((candidate) => candidate.key === row.key);
    let target: number;
    switch (event.key) {
      case 'ArrowDown':
        target = Math.min(rows.length - 1, index + 1);
        break;
      case 'ArrowUp':
        target = Math.max(0, index - 1);
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = rows.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.apply(row);
        return;
      default:
        return;
    }
    event.preventDefault();
    const next = rows[target];
    if (next !== undefined) {
      this.activeKey.set(next.key);
      const elements = this.host.nativeElement.querySelectorAll<HTMLElement>('tbody tr');
      elements[target]?.focus();
    }
  }

  protected rowFocused(row: OptimizerRow): void {
    this.activeKey.set(row.key);
  }
}
