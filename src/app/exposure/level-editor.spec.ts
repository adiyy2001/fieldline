import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import { LevelEditor } from './level-editor';

async function mount(search = ''): Promise<{
  fixture: ComponentFixture<LevelEditor>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
}> {
  TestBed.configureTestingModule({ providers: storeProviders({ search }) });
  const fixture = TestBed.createComponent(LevelEditor);
  const store = TestBed.inject(FieldStore);
  fixture.detectChanges();
  await until(() => store.status() === 'ready');
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, store };
}

function typeInto(root: HTMLElement, id: string, text: string): void {
  const input = root.querySelector<HTMLInputElement>(`#${id}`);
  if (input === null) {
    throw new Error(`No input ${id}`);
  }
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

function press(root: HTMLElement, text: string): void {
  const button = Array.from(root.querySelectorAll('button')).find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (button === undefined) {
    throw new Error(`No button ${text}`);
  }
  button.click();
}

function listed(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('li .value')).map((item) =>
    item.textContent.replace(/\s+/g, ' ').trim(),
  );
}

describe('the level editor', () => {
  it('lists the built-in levels of both fields with their dash sample', async () => {
    const { root } = await mount();
    expect(listed(root)).toEqual([
      '1 kV/m',
      '5 kV/m * (selected standard)',
      '10 kV/m',
      '75.4 µT',
      '100 µT',
      '200 µT * (selected standard)',
    ]);
    expect(root.querySelectorAll('li svg line')).toHaveLength(6);
    expect(root.querySelector('li .crossing')?.textContent.trim()).not.toBe('');
  });

  it('switches the emphasised standard', async () => {
    const { fixture, root, store } = await mount();
    const select = root.querySelector<HTMLSelectElement>('#fl-preset');
    const other = select?.options[1]?.value ?? '';
    if (select === null) {
      throw new Error('no select');
    }
    select.value = other;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(store.settings().presetId).toBe(other);
  });

  it('adds a custom level to the store and clears the form', async () => {
    const { fixture, root, store } = await mount();
    typeInto(root, 'fl-level-value', '3');
    typeInto(root, 'fl-level-label', 'Site limit');
    fixture.detectChanges();
    press(root, 'Add level');
    fixture.detectChanges();
    expect(store.settings().customLevels).toEqual([
      { quantity: 'electric', value: 3, label: 'Site limit' },
    ]);
    expect(listed(root)).toContain('3 kV/m');
    expect(root.querySelector<HTMLInputElement>('#fl-level-value')?.value).toBe('');
    expect(root.querySelector('[data-testid="level-message"]')?.textContent).toContain('Added 3');
  });

  it('adds with Enter and accepts a decimal comma', async () => {
    const { root, store } = await mount();
    typeInto(root, 'fl-level-value', '2,5');
    root
      .querySelector('#fl-level-value')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(store.settings().customLevels[0]?.value).toBe(2.5);
    expect(store.settings().customLevels[0]?.label).toBe('Custom');
  });

  it('rejects an unreadable, duplicate or out of range level with a message', async () => {
    const { fixture, root, store } = await mount();
    const message = () => root.querySelector('[data-testid="level-message"]')?.textContent.trim();
    press(root, 'Add level');
    fixture.detectChanges();
    expect(message()).toContain('Enter a level in kV/m');
    typeInto(root, 'fl-level-value', '5');
    press(root, 'Add level');
    fixture.detectChanges();
    expect(message()).toBe('This level is already listed');
    typeInto(root, 'fl-level-value', '5000');
    press(root, 'Add level');
    fixture.detectChanges();
    expect(message()).toMatch(/between 0.01 and 100 kV\/m/);
    expect(store.settings().customLevels).toEqual([]);
  });

  it('stops at four levels per field', async () => {
    const { fixture, root } = await mount();
    typeInto(root, 'fl-level-value', '2');
    press(root, 'Add level');
    fixture.detectChanges();
    typeInto(root, 'fl-level-value', '3');
    press(root, 'Add level');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="level-message"]')?.textContent).toMatch(
      /At most 4 levels/,
    );
  });

  it('adds a magnetic level when the field select says so', async () => {
    const { fixture, root, store } = await mount();
    const select = root.querySelector<HTMLSelectElement>('#fl-level-quantity');
    if (select === null) {
      throw new Error('no select');
    }
    select.value = 'magnetic';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelector('.unit')?.textContent).toBe('µT');
    typeInto(root, 'fl-level-value', '40');
    press(root, 'Add level');
    expect(store.settings().customLevels[0]).toMatchObject({ quantity: 'magnetic', value: 40 });
  });

  it('removes a custom level, hides a built-in one and resets both', async () => {
    const { fixture, root, store } = await mount('?v=1&cl=e:3:Mine');
    expect(listed(root)).toContain('3 kV/m');
    press(root, 'Remove');
    fixture.detectChanges();
    expect(store.settings().customLevels).toEqual([]);
    const hide = root.querySelector<HTMLButtonElement>('button[aria-label^="Hide 10 kV/m"]');
    hide?.click();
    fixture.detectChanges();
    expect(listed(root)).not.toContain('10 kV/m');
    expect(root.querySelector('.hint')?.textContent).toContain('1 built-in levels hidden');
    press(root, 'Reset levels');
    fixture.detectChanges();
    expect(listed(root)).toContain('10 kV/m');
    expect(store.settings().hiddenLevels).toEqual([]);
    expect(
      Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === 'Reset levels',
      )?.disabled,
    ).toBe(true);
  });

  it('gives every control an accessible name', async () => {
    const { root } = await mount();
    for (const control of Array.from(root.querySelectorAll('input, select'))) {
      expect(root.querySelector(`label[for="${control.id}"]`), control.outerHTML).not.toBeNull();
    }
    for (const button of Array.from(root.querySelectorAll('button.remove'))) {
      expect(button.getAttribute('aria-label')).toMatch(/^(Hide|Remove) /);
    }
  });
});
