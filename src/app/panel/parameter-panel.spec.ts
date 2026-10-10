import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FieldStore } from '../state/field-store';
import { until } from '../testing/doubles';
import { storeProviders } from '../testing/store-providers';
import { ParameterPanel } from './parameter-panel';

async function mount(search = ''): Promise<{
  fixture: ComponentFixture<ParameterPanel>;
  root: HTMLElement;
  store: InstanceType<typeof FieldStore>;
}> {
  TestBed.configureTestingModule({ providers: storeProviders({ search }) });
  const store = TestBed.inject(FieldStore);
  const fixture = TestBed.createComponent(ParameterPanel);
  fixture.detectChanges();
  await until(() => store.status() === 'ready');
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, store };
}

function inputByLabel(root: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(root.querySelectorAll('label')).find(
    (candidate) => candidate.textContent.trim() === text,
  );
  const id = label?.getAttribute('for');
  const input = id === undefined || id === null ? null : root.querySelector(`#${id}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`No input labelled ${text}`);
  }
  return input;
}

function selectById(root: HTMLElement, id: string): HTMLSelectElement {
  const select = root.querySelector(`#${id}`);
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`No select ${id}`);
  }
  return select;
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function enter(input: HTMLInputElement, text: string, eventName = 'change'): void {
  input.value = text;
  input.dispatchEvent(new Event(eventName));
}

describe('the parameter panel', () => {
  it('groups every control under a labelled form', async () => {
    const { root } = await mount();
    expect(root.querySelector('form')?.getAttribute('aria-label')).toBe(
      'Line and display parameters',
    );
    const groups = Array.from(root.querySelectorAll('fieldset.group > legend')).map(
      (legend) => legend.textContent,
    );
    expect(groups).toEqual([
      'Display',
      'Exposure limits',
      'Tower',
      'Spans and sag',
      'Electrical',
      'Conductors',
      'Phasing',
    ]);
  });

  it('gives every input and select an accessible name', async () => {
    const { root } = await mount();
    const controls = Array.from(root.querySelectorAll('input:not([aria-hidden]), select'));
    expect(controls.length).toBeGreaterThan(20);
    for (const control of controls) {
      const labelled =
        (control.id !== '' && root.querySelector(`label[for="${control.id}"]`) !== null) ||
        control.closest('label') !== null;
      expect(labelled, control.outerHTML).toBe(true);
    }
  });

  it('writes a typed voltage to the store', async () => {
    const { root, store } = await mount();
    enter(inputByLabel(root, 'Line voltage'), '500');
    expect(store.parameters().lineToLineKilovolts).toBe(500);
  });

  it('shows the validation message beside the field and keeps the previous frame', async () => {
    const { fixture, root, store } = await mount();
    enter(inputByLabel(root, 'Line voltage'), '5000');
    await until(() => store.status() === 'invalid');
    fixture.detectChanges();
    const input = inputByLabel(root, 'Line voltage');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = root.querySelector(`#${input.getAttribute('aria-describedby') ?? 'none'}`);
    expect(message?.textContent).toMatch(/1200/);
    expect(store.status()).toBe('invalid');
    expect(store.frame()).not.toBeNull();
  });

  it('switches between electric and magnetic and between rms and instantaneous', async () => {
    const { fixture, root, store } = await mount();
    const radios = root.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const named = (text: string) =>
      Array.from(radios).find((radio) => radio.closest('label')?.textContent.trim() === text);
    named('Magnetic (B)')?.dispatchEvent(new Event('change'));
    expect(store.settings().quantity).toBe('magnetic');
    named('Instantaneous')?.dispatchEvent(new Event('change'));
    expect(store.settings().mode).toBe('instantaneous');
    fixture.detectChanges();
    expect(inputByLabel(root, 'Phase angle').disabled).toBe(false);
    named('rms')?.dispatchEvent(new Event('change'));
    named('Electric (E)')?.dispatchEvent(new Event('change'));
    expect(store.settings()).toMatchObject({ quantity: 'electric', mode: 'rms' });
  });

  it('disables the phase slider and play button for rms values', async () => {
    const { root } = await mount();
    expect(inputByLabel(root, 'Phase angle').disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button.play')?.disabled).toBe(true);
  });

  it('moves the phase from the slider and stops the animation', async () => {
    const { fixture, root, store } = await mount('?v=1&r=inst');
    store.setPlaying(true);
    const slider = inputByLabel(root, 'Phase angle');
    slider.value = '120';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(store.settings().phaseDegrees).toBe(120);
    expect(store.playing()).toBe(false);
    expect(slider.getAttribute('aria-valuetext')).toBe('120 degrees');
    expect(root.querySelector('output')?.textContent).toBe('120°');
  });

  it('toggles the animation with an accessible pressed state', async () => {
    const { fixture, root, store } = await mount('?v=1&r=inst');
    store.setPlaying(false);
    fixture.detectChanges();
    const button = root.querySelector<HTMLButtonElement>('button.play');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(button?.textContent.trim()).toBe('Play');
    button?.click();
    fixture.detectChanges();
    expect(store.playing()).toBe(true);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.textContent.trim()).toBe('Pause');
    button?.click();
  });

  it('changes model, height, preset, tower, spans and frequency through selects', async () => {
    const { fixture, root, store } = await mount();
    choose(selectById(root, 'fl-model'), 'cross-section-2d');
    expect(store.settings().model).toBe('cross-section-2d');
    choose(selectById(root, 'fl-height'), '1.8');
    expect(store.settings().evaluationHeight).toBe(1.8);
    const presetSelect = selectById(root, 'fl-preset');
    const preset = presetSelect.options[1]?.value ?? '';
    choose(presetSelect, preset);
    expect(store.settings().presetId).toBe(preset);
    choose(selectById(root, 'fl-spans'), '2');
    expect(store.parameters().spanLengths).toHaveLength(2);
    choose(selectById(root, 'fl-frequency'), '60');
    expect(store.parameters().frequencyHz).toBe(60);
    choose(selectById(root, 'fl-tower'), 'delta');
    fixture.detectChanges();
    expect(store.parameters().tower.kind).toBe('delta');
    expect(
      Array.from(root.querySelectorAll('label')).some((l) => l.textContent === 'Apex rise'),
    ).toBe(true);
  });

  it('ignores select values it does not know', async () => {
    const { root, store } = await mount();
    const before = store.parameters();
    const select = selectById(root, 'fl-tower');
    select.innerHTML = '<option value="bogus">bogus</option>';
    select.value = 'bogus';
    select.dispatchEvent(new Event('change'));
    expect(store.parameters().tower.kind).toBe(before.tower.kind);
  });

  it('edits span length, sag and tower geometry', async () => {
    const { root, store } = await mount();
    enter(inputByLabel(root, 'Span 2 length'), '350');
    expect(store.parameters().spanLengths[1]).toBe(350);
    enter(inputByLabel(root, 'Sag'), '12');
    expect(store.parameters().phaseSag).toBe(12);
    enter(inputByLabel(root, 'Phase height'), '35');
    expect(store.parameters().tower).toMatchObject({ phaseHeight: 35 });
  });

  it('reassigns phases and keeps every phase used once', async () => {
    const { root, store } = await mount();
    const before = [...store.parameters().phasing];
    choose(selectById(root, 'fl-phasing-0'), '1');
    const after = store.parameters().phasing;
    expect([...after].sort()).toEqual([...before].sort());
    expect(after[0]).toBe(1);
  });

  it('offers one phasing select per conductor position', async () => {
    const { root } = await mount();
    expect(root.querySelectorAll('select[id^="fl-phasing-"]')).toHaveLength(3);
  });
});
