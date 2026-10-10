export type ScaleKind = 'linear' | 'log';

export interface Tick {
  readonly value: number;
  readonly position: number;
  readonly label: string;
}

export interface Scale {
  readonly kind: ScaleKind;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  map(value: number): number;
}

export function createScale(
  kind: ScaleKind,
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const transform = kind === 'log' ? Math.log10 : (value: number): number => value;
  const [d0, d1] = [transform(domain[0]), transform(domain[1])];
  const span = d1 - d0 || 1;
  return {
    kind,
    domain,
    range,
    map: (value) => range[0] + ((transform(value) - d0) / span) * (range[1] - range[0]),
  };
}

export function niceStep(span: number, targetCount: number): number {
  const rough = span / Math.max(targetCount, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function niceDomain(
  min: number,
  max: number,
  targetCount: number,
): readonly [number, number] {
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return niceDomain(min - pad, max + pad, targetCount);
  }
  const step = niceStep(max - min, targetCount);
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

export function linearTickValues(
  domain: readonly [number, number],
  targetCount: number,
): readonly number[] {
  const step = niceStep(domain[1] - domain[0], targetCount);
  const first = Math.ceil(domain[0] / step - 1e-9);
  const last = Math.floor(domain[1] / step + 1e-9);
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step);
}

export function logTickValues(domain: readonly [number, number]): readonly number[] {
  const first = Math.ceil(Math.log10(domain[0]) - 1e-9);
  const last = Math.floor(Math.log10(domain[1]) + 1e-9);
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, index) =>
    Math.pow(10, first + index),
  );
}

export function formatTick(value: number, step: number): string {
  if (value === 0) {
    return '0';
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) {
    return value.toExponential(0).replace('e+', 'e');
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return value.toFixed(Math.min(decimals, 6));
}

export function buildTicks(scale: Scale, targetCount: number): readonly Tick[] {
  const values =
    scale.kind === 'log'
      ? logTickValues(scale.domain)
      : linearTickValues(scale.domain, targetCount);
  const step = scale.kind === 'log' ? 1 : niceStep(scale.domain[1] - scale.domain[0], targetCount);
  return values.map((value) => ({
    value,
    position: scale.map(value),
    label: formatTick(value, step),
  }));
}
