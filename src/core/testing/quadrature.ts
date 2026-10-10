export interface QuadratureNode {
  readonly position: number;
  readonly weight: number;
}

function legendre(order: number, x: number): { value: number; derivative: number } {
  let previous = 1;
  let current = x;
  for (let degree = 2; degree <= order; degree += 1) {
    const next = ((2 * degree - 1) * x * current - (degree - 1) * previous) / degree;
    previous = current;
    current = next;
  }
  const derivative = (order * (x * current - previous)) / (x * x - 1);
  return { value: current, derivative };
}

export function gaussLegendreNodes(order: number): readonly QuadratureNode[] {
  return Array.from({ length: order }, (_, index) => {
    let x = Math.cos((Math.PI * (index + 0.75)) / (order + 0.5));
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const { value, derivative } = legendre(order, x);
      const step = value / derivative;
      x -= step;
      if (Math.abs(step) < 1e-15) {
        break;
      }
    }
    const { derivative } = legendre(order, x);
    return { position: x, weight: 2 / ((1 - x * x) * derivative * derivative) };
  });
}

export function integrate(
  integrand: (t: number) => number,
  from: number,
  to: number,
  panels = 32,
  order = 10,
): number {
  const nodes = gaussLegendreNodes(order);
  const width = (to - from) / panels;
  let total = 0;
  for (let panel = 0; panel < panels; panel += 1) {
    const centre = from + (panel + 0.5) * width;
    for (const node of nodes) {
      total += node.weight * integrand(centre + (node.position * width) / 2) * (width / 2);
    }
  }
  return total;
}
