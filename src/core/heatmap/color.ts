import { VIRIDIS, type Rgb } from '../color/viridis';

export const COLOR_STEPS = VIRIDIS.length;

export function viridisAt(fraction: number): Rgb {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const position = clamped * (COLOR_STEPS - 1);
  const lower = Math.floor(position);
  const upper = Math.min(COLOR_STEPS - 1, lower + 1);
  const weight = position - lower;
  const from = VIRIDIS[lower] ?? [0, 0, 0];
  const to = VIRIDIS[upper] ?? from;
  return [
    from[0] + (to[0] - from[0]) * weight,
    from[1] + (to[1] - from[1]) * weight,
    from[2] + (to[2] - from[2]) * weight,
  ];
}

export function viridisBytes(fraction: number): readonly [number, number, number] {
  const [red, green, blue] = viridisAt(fraction);
  return [Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)];
}

export function viridisTable(): Float32Array {
  const table = new Float32Array(COLOR_STEPS * 4);
  VIRIDIS.forEach(([red, green, blue], index) => {
    table.set([red, green, blue, 1], index * 4);
  });
  return table;
}
