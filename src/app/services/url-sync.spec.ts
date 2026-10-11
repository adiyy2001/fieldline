import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfiguration } from '../../core/model/settings';
import { encodeConfiguration } from '../../core/model/url-state';
import {
  LOCATION_ACCESS,
  URL_WRITE_INTERVAL_MILLISECONDS,
  UrlSync,
  coarseGridRequested,
  mergeQuery,
} from './url-sync';

function setup(search: string) {
  const writes: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LOCATION_ACCESS,
        useValue: { search: () => search, replaceQuery: (query: string) => writes.push(query) },
      },
    ],
  });
  return { sync: TestBed.inject(UrlSync), writes };
}

describe('URL synchronisation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the default configuration from an empty query', () => {
    expect(setup('').sync.read()).toEqual(defaultConfiguration());
  });

  it('reads the state from the query', () => {
    const { sync } = setup('?v=1&kv=500&q=b');
    const configuration = sync.read();
    expect(configuration.parameters.lineToLineKilovolts).toBe(500);
    expect(configuration.settings.quantity).toBe('magnetic');
  });

  it('writes the first change at once', () => {
    const { sync, writes } = setup('');
    sync.write('v=1&kv=500');
    expect(writes).toEqual(['v=1&kv=500']);
  });

  it('writes a burst of changes at most once per interval and keeps the last one', () => {
    const { sync, writes } = setup('');
    sync.write('v=1&kv=500');
    sync.write('v=1&kv=510');
    sync.write('v=1&kv=520');
    expect(writes).toEqual(['v=1&kv=500']);
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MILLISECONDS);
    expect(writes).toEqual(['v=1&kv=500', 'v=1&kv=520']);
  });

  it('does not write the same query twice', () => {
    const { sync, writes } = setup('');
    sync.write('v=1');
    vi.advanceTimersByTime(URL_WRITE_INTERVAL_MILLISECONDS);
    sync.write('v=1');
    expect(writes).toEqual(['v=1']);
  });

  it('writes queries the codec can read back', () => {
    const { sync, writes } = setup('');
    sync.write(encodeConfiguration(defaultConfiguration()));
    expect(writes).toEqual(['v=1']);
  });
});

describe('merging the state into the query', () => {
  it('keeps parameters the codec does not own', () => {
    expect(mergeQuery('?automation&kv=300&x=1', 'v=1&kv=500')).toBe('?automation&x=1&v=1&kv=500');
  });

  it('writes nothing for the default state', () => {
    expect(mergeQuery('?kv=300', 'v=1')).toBe('');
    expect(mergeQuery('?automation&kv=300', 'v=1')).toBe('?automation');
  });

  it('starts from an empty query', () => {
    expect(mergeQuery('', 'v=1&q=b')).toBe('?v=1&q=b');
  });
});

describe('the coarse grid request', () => {
  it('needs both the automation hook and the coarse grid parameter', () => {
    expect(coarseGridRequested('?automation&coarse-grid')).toBe(true);
    expect(coarseGridRequested('?coarse-grid')).toBe(false);
    expect(coarseGridRequested('?automation')).toBe(false);
    expect(coarseGridRequested('')).toBe(false);
  });
});
