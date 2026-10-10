export interface Complex {
  readonly re: number;
  readonly im: number;
}

export const ZERO: Complex = { re: 0, im: 0 };
export const ONE: Complex = { re: 1, im: 0 };

export function complex(re: number, im = 0): Complex {
  return { re, im };
}

export function fromPolar(magnitude: number, angleRadians: number): Complex {
  return { re: magnitude * Math.cos(angleRadians), im: magnitude * Math.sin(angleRadians) };
}

export function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function subtract(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function multiply(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function scale(a: Complex, factor: number): Complex {
  return { re: a.re * factor, im: a.im * factor };
}

export function conjugate(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

export function magnitudeSquared(a: Complex): number {
  return a.re * a.re + a.im * a.im;
}

export function magnitude(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

export function argument(a: Complex): number {
  return Math.atan2(a.im, a.re);
}

export function sum(values: readonly Complex[]): Complex {
  let re = 0;
  let im = 0;
  for (const value of values) {
    re += value.re;
    im += value.im;
  }
  return { re, im };
}
