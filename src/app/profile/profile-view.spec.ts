import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_CSV_HEADER } from '../../core/profile/csv';
import { FileDownload } from '../services/file-download';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import { PROFILE_FILE_NAME, ProfileView } from './profile-view';

interface Saved {
  readonly name: string;
  readonly text: string;
  readonly type: string;
}

async function mount(search = ''): Promise<{
  fixture: ComponentFixture<ProfileView>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
  saved: Saved[];
}> {
  const saved: Saved[] = [];
  TestBed.configureTestingModule({
    providers: [
      ...storeProviders({ search }),
      {
        provide: FileDownload,
        useValue: {
          save: (name: string, text: string, type: string) => saved.push({ name, text, type }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProfileView);
  const store = TestBed.inject(FieldStore);
  fixture.detectChanges();
  await until(() => store.status() === 'ready');
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, store, saved };
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (found === undefined) {
    throw new Error(`No button ${text}`);
  }
  return found;
}

describe('the profile view', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a placeholder until the first profile exists', () => {
    TestBed.configureTestingModule({ providers: storeProviders() });
    const fixture = TestBed.createComponent(ProfileView);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Solving the line');
  });

  it('draws an electric and a magnetic chart with the summary text', async () => {
    const { root } = await mount();
    expect(root.querySelectorAll('fl-line-chart')).toHaveLength(2);
    expect(root.querySelector('[data-testid="profile-summary"]')?.textContent).toMatch(
      /peak E .* kV\/m/,
    );
    expect(root.querySelector('[data-testid="profile-caption"]')?.textContent).toContain(
      '1 m above ground',
    );
  });

  it('switches to a data table whose rows match the profile', async () => {
    const { fixture, root, store } = await mount();
    button(root, 'Data table').click();
    fixture.detectChanges();
    const rows = root.querySelectorAll('[data-testid="profile-table"] tbody tr');
    expect(rows).toHaveLength(store.frame()?.profile.samples.length ?? -1);
    expect(root.querySelector('fl-line-chart')).toBeNull();
    expect(button(root, 'Data table').getAttribute('aria-pressed')).toBe('true');
  });

  it('lists every level with its crossing positions', async () => {
    const { root } = await mount();
    const rows = Array.from(root.querySelectorAll('[data-testid="profile-crossings"] tbody tr'));
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.some((row) => /left -?\d/.test(row.textContent))).toBe(true);
  });

  it('moves the section along the span from the slider', async () => {
    const { fixture, root, store } = await mount();
    const slider = root.querySelector<HTMLInputElement>('#fl-section');
    if (slider === null) {
      throw new Error('no slider');
    }
    slider.value = '0.25';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(store.settings().sectionFraction).toBe(0.25);
    expect(root.querySelector('[data-testid="profile-caption"]')?.textContent).toContain(
      '25 percent',
    );
  });

  it('disables the section and the overlay for the 2D model', async () => {
    const { root } = await mount('?v=1&m=cross-section-2d');
    expect(root.querySelector<HTMLInputElement>('#fl-section')?.disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('.overlay input')?.disabled).toBe(true);
  });

  it('adds the 2D overlay columns when the overlay is on', async () => {
    const { fixture, root, store } = await mount('?v=1&o2=1');
    expect(store.settings().overlay2d).toBe(true);
    button(root, 'Data table').click();
    fixture.detectChanges();
    expect(root.querySelectorAll('[data-testid="profile-table"] thead th')).toHaveLength(5);
  });

  it('updates the readout when the cursor moves', async () => {
    const { fixture, root } = await mount();
    const slider = root.querySelector<HTMLElement>('[role="slider"]');
    slider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', cancelable: true }));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="profile-readout"]')?.textContent).toContain(
      'x = 60 m',
    );
  });

  it('downloads the displayed profile as CSV', async () => {
    const { root, saved } = await mount();
    button(root, 'Download CSV').click();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe(PROFILE_FILE_NAME);
    expect(saved[0]?.type).toBe('text/csv');
    expect(saved[0]?.text.startsWith(`${PROFILE_CSV_HEADER}\n`)).toBe(true);
  });
});
