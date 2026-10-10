import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { type FieldEdit, NumberField, parseFieldNumber } from './number-field';

function mount(issue: string | null = null): {
  fixture: ComponentFixture<NumberField>;
  root: HTMLElement;
  edits: FieldEdit[];
} {
  const fixture = TestBed.createComponent(NumberField);
  fixture.componentRef.setInput('label', 'Line voltage');
  fixture.componentRef.setInput('value', 400);
  fixture.componentRef.setInput('min', 110);
  fixture.componentRef.setInput('max', 800);
  fixture.componentRef.setInput('step', 5);
  fixture.componentRef.setInput('unit', 'kV');
  fixture.componentRef.setInput('issue', issue);
  const edits: FieldEdit[] = [];
  fixture.componentInstance.edited.subscribe((edit) => edits.push(edit));
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement, edits };
}

function type(input: HTMLInputElement, text: string, eventName: 'input' | 'change'): void {
  input.value = text;
  input.dispatchEvent(new Event(eventName));
}

describe('parseFieldNumber', () => {
  it('reads plain and comma decimals', () => {
    expect(parseFieldNumber('12.5')).toBe(12.5);
    expect(parseFieldNumber('12,5')).toBe(12.5);
  });

  it('rejects empty and non numeric text', () => {
    expect(parseFieldNumber('')).toBeNull();
    expect(parseFieldNumber('  ')).toBeNull();
    expect(parseFieldNumber('abc')).toBeNull();
    expect(parseFieldNumber('1e999')).toBeNull();
  });
});

describe('the number field', () => {
  it('labels the input and shows the unit', () => {
    const { root } = mount();
    const input = root.querySelector<HTMLInputElement>('input[type="number"]');
    const label = root.querySelector('label');
    expect(label?.textContent).toBe('Line voltage');
    expect(label?.getAttribute('for')).toBe(input?.id);
    expect(input?.value).toBe('400');
    expect(root.querySelector('.unit')?.textContent).toBe('kV');
  });

  it('emits interactive edits while typing and committed edits on change', () => {
    const { root, edits } = mount();
    const input = root.querySelector<HTMLInputElement>('input[type="number"]');
    expect(input).not.toBeNull();
    if (input === null) {
      return;
    }
    type(input, '450', 'input');
    type(input, '460', 'change');
    expect(edits).toEqual([
      { value: 450, interactive: true },
      { value: 460, interactive: false },
    ]);
  });

  it('ignores text that is not a number', () => {
    const { root, edits } = mount();
    const input = root.querySelector<HTMLInputElement>('input[type="number"]');
    if (input === null) {
      return;
    }
    type(input, '', 'input');
    expect(edits).toEqual([]);
  });

  it('takes edits from the slider, which stays out of the tab order', () => {
    const { root, edits } = mount();
    const slider = root.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider?.getAttribute('tabindex')).toBe('-1');
    expect(slider?.getAttribute('aria-hidden')).toBe('true');
    if (slider === null) {
      return;
    }
    type(slider, '500', 'input');
    expect(edits).toEqual([{ value: 500, interactive: true }]);
  });

  it('clamps the slider position into the range', () => {
    const { fixture, root } = mount();
    fixture.componentRef.setInput('value', 5000);
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe('800');
  });

  it('connects the issue message to the input', () => {
    const { root } = mount('Voltage must be between 110 and 800 kV.');
    const input = root.querySelector('input[type="number"]');
    const message = root.querySelector('.issue');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toBe(message?.id);
    expect(message?.textContent).toContain('between 110 and 800');
  });

  it('has no invalid marking without an issue', () => {
    const { root } = mount();
    expect(root.querySelector('input[type="number"]')?.hasAttribute('aria-invalid')).toBe(false);
    expect(root.querySelector('.issue')).toBeNull();
  });
});
