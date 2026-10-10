import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { levelEntries } from '../../core/exposure/contour-levels';
import { defaultParameters } from '../../core/model/parameters';
import { arrangementPhasing } from '../../core/optimizer/arrangements';
import type { ArrangementResult } from '../../core/optimizer/evaluate';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import {
  CRITERIA,
  type OptimizerRow,
  arrangementSpelling,
  arrangementSymbols,
  bestWorstOf,
  comparisonChartSpec,
  criterionNeedsDistance,
  criterionQuantity,
  currentClassKey,
  evaluateOptimizer,
  nextSort,
  optimizerRows,
  phaseSymbols,
  sortRows,
  supportsOptimizer,
} from './optimizer-model';

let cached: { results: readonly ArrangementResult[]; phasing: readonly number[] } | null = null;

async function doubleCircuit() {
  if (cached !== null) {
    return cached;
  }
  TestBed.configureTestingModule({
    providers: storeProviders({ search: '?v=1&t=dc' }),
  });
  const store = TestBed.inject(FieldStore);
  await until(() => store.status() === 'ready');
  const frame = store.frame();
  if (frame === null) {
    throw new Error('no frame');
  }
  const results = evaluateOptimizer(frame.basisSource(), {
    parameters: store.parameters(),
    height: 1,
    z: 0,
    distance: 30,
    step: 1,
  });
  cached = { results, phasing: store.parameters().phasing };
  return cached;
}

describe('optimizer model', () => {
  it('supports only six-position towers', () => {
    expect(supportsOptimizer(defaultParameters('double-circuit'))).toBe(true);
    expect(supportsOptimizer(defaultParameters('horizontal'))).toBe(false);
    expect(supportsOptimizer(defaultParameters('delta'))).toBe(false);
  });

  it('maps criteria to a field and to the need for a distance', () => {
    expect(CRITERIA.map(criterionQuantity)).toEqual([
      'electric',
      'magnetic',
      'electric',
      'magnetic',
    ]);
    expect(CRITERIA.map(criterionNeedsDistance)).toEqual([false, false, true, true]);
  });

  it('writes arrangements with letters and with symbols', () => {
    expect(phaseSymbols([0, 1, 2])).toBe('● ■ ▲');
    const arrangement = { left: [0, 1, 2], right: [2, 0, 1] } as const;
    expect(arrangementSymbols(arrangement)).toBe('● ■ ▲ | ▲ ● ■');
    expect(arrangementSpelling(arrangement)).toBe(
      'top to bottom, left circuit phase A, phase B, phase C; right circuit phase C, phase A, phase B',
    );
  });

  it('finds the symmetry class of a phasing', () => {
    expect(currentClassKey([0, 1, 2, 0, 1, 2])).toBe('012');
    expect(currentClassKey([0, 1, 2, 2, 1, 0])).toBe('210');
    expect(currentClassKey([0, 1, 2])).toBeNull();
  });

  it('ranks the six classes and marks best, worst, current and mirrors', async () => {
    const { results, phasing } = await doubleCircuit();
    const rows = optimizerRows(results, 'peak-electric', phasing);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.rank)[0]).toBe(1);
    expect(rows.filter((row) => row.best)).toHaveLength(1);
    expect(rows.filter((row) => row.worst)).toHaveLength(1);
    expect(rows.filter((row) => row.current)).toHaveLength(1);
    expect(rows.find((row) => row.current)?.label).toBe('ABC | ABC');
    const peaks = rows.map((row) => row.peakElectric);
    expect([...peaks].sort((a, b) => a - b)).toEqual(peaks);
    expect(rows.filter((row) => row.mirror === null).length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((row) => row.mirror !== null).length).toBeGreaterThanOrEqual(2);
  });

  it('sorts by any column in both directions with a stable tie break', async () => {
    const { results, phasing } = await doubleCircuit();
    const rows = optimizerRows(results, 'peak-electric', phasing);
    const byLabel = sortRows(rows, 'arrangement', 'ascending').map((row) => row.label);
    expect(byLabel).toEqual([...byLabel].sort((a, b) => a.localeCompare(b)));
    const descending = sortRows(rows, 'peakMagnetic', 'descending');
    const values = descending.map((row) => row.peakMagnetic);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    const columns = ['rank', 'electricAtDistance', 'magneticAtDistance', 'peakElectric'] as const;
    for (const column of columns) {
      const sorted: readonly OptimizerRow[] = sortRows(rows, column, 'ascending');
      expect(sorted).toHaveLength(6);
    }
  });

  it('toggles the direction on the same column and resets on a new one', () => {
    const start = { column: 'rank', direction: 'ascending' } as const;
    expect(nextSort(start, 'rank')).toEqual({ column: 'rank', direction: 'descending' });
    expect(nextSort({ column: 'rank', direction: 'descending' }, 'rank').direction).toBe(
      'ascending',
    );
    expect(nextSort(start, 'peakElectric')).toEqual({
      column: 'peakElectric',
      direction: 'ascending',
    });
  });

  it('builds a best against worst chart with a solid and a dashed line', async () => {
    const { results } = await doubleCircuit();
    const { best, worst } = bestWorstOf(results, 'peak-electric');
    const spec = comparisonChartSpec({
      best: best.result,
      worst: worst.result,
      quantity: 'electric',
      levels: levelEntries('electric', 'icnirp-2010'),
      height: 1,
    });
    expect(spec.series.map((series) => series.id)).toEqual(['best', 'worst']);
    expect(spec.series[0]?.dash).toBe('');
    expect(spec.series[1]?.dash).not.toBe('');
    expect(spec.series[0]?.points).toHaveLength(121);
    expect(spec.series[0]?.label).toContain(best.result.label);
    expect(spec.description).toContain(worst.result.label);
  });

  it('lowers the best arrangement peak below the worst', async () => {
    const { results } = await doubleCircuit();
    for (const criterion of CRITERIA) {
      const { best, worst } = bestWorstOf(results, criterion);
      expect(best.value).toBeLessThanOrEqual(worst.value);
      expect(arrangementPhasing(best.result.arrangement)).toHaveLength(6);
    }
  });
});
