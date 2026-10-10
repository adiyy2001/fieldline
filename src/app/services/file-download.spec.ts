import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDownload } from './file-download';

describe('FileDownload', () => {
  const created: Blob[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          created.push(blob);
          return 'blob:fieldline-test';
        },
        revokeObjectURL: (url: string) => {
          revoked.push(url);
        },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('clicks a temporary link with the file name and removes it', () => {
    vi.useFakeTimers();
    const clicks: { name: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ name: this.download, href: this.href });
    });
    TestBed.inject(FileDownload).save('fieldline-profile.csv', 'a,b\n1,2\n', 'text/csv');
    expect(clicks).toEqual([{ name: 'fieldline-profile.csv', href: 'blob:fieldline-test' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe('text/csv');
    vi.runAllTimers();
    expect(revoked).toEqual(['blob:fieldline-test']);
  });

  it('puts the text into the blob', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    TestBed.inject(FileDownload).save('x.csv', 'hello', 'text/csv');
    expect(await created[0]?.text()).toBe('hello');
  });
});
