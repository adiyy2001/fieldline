export function selectedValue(event: Event): string | null {
  return event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement
    ? event.target.value
    : null;
}
