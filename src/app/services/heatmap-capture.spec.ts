import { describe, expect, it } from 'vitest';
import { HeatmapCapture } from './heatmap-capture';

const request = { width: 2, height: 1 };
const pixels = { width: 2, height: 1, pixels: new Uint8Array(8) };

describe('the heatmap capture registry', () => {
  it('has nothing to capture without a view', async () => {
    expect(await new HeatmapCapture().capture(request)).toBeNull();
  });

  it('calls the registered capturer', async () => {
    const registry = new HeatmapCapture();
    registry.register(() => Promise.resolve(pixels));
    expect(await registry.capture(request)).toBe(pixels);
  });

  it('forgets a capturer that was unregistered', async () => {
    const registry = new HeatmapCapture();
    const unregister = registry.register(() => Promise.resolve(pixels));
    unregister();
    expect(await registry.capture(request)).toBeNull();
  });

  it('keeps a newer capturer when an older one unregisters late', async () => {
    const registry = new HeatmapCapture();
    const first = registry.register(() => Promise.resolve(pixels));
    registry.register(() => Promise.resolve({ ...pixels, width: 9 }));
    first();
    expect((await registry.capture(request))?.width).toBe(9);
  });
});
