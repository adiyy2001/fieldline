import { Injectable, InjectionToken, inject } from '@angular/core';
import { type Configuration, defaultConfiguration } from '../../core/model/settings';
import { decodeConfiguration } from '../../core/model/url-state';

export interface LocationAccess {
  search(): string;
  replaceQuery(query: string): void;
}

export const LOCATION_ACCESS = new InjectionToken<LocationAccess>('LOCATION_ACCESS', {
  providedIn: 'root',
  factory: () => ({
    search: () => window.location.search,
    replaceQuery: (query) => {
      const url = `${window.location.pathname}?${query}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', url);
    },
  }),
});

export const URL_WRITE_INTERVAL_MILLISECONDS = 400;

export function initialConfiguration(location: LocationAccess): Configuration {
  const search = location.search();
  return search === '' ? defaultConfiguration() : decodeConfiguration(search);
}

@Injectable({ providedIn: 'root' })
export class UrlSync {
  private readonly location = inject(LOCATION_ACCESS);
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastWritten = '';

  read(): Configuration {
    return initialConfiguration(this.location);
  }

  write(query: string): void {
    if (this.timer === null && query !== this.lastWritten) {
      this.flushNow(query);
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending !== null && this.pending !== this.lastWritten) {
          this.flushNow(this.pending);
        }
        this.pending = null;
      }, URL_WRITE_INTERVAL_MILLISECONDS);
      return;
    }
    this.pending = query;
  }

  private flushNow(query: string): void {
    this.lastWritten = query;
    this.location.replaceQuery(query);
  }
}
