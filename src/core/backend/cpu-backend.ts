import { evaluateRange } from './evaluate-range';
import { layoutPointCount } from './layout';
import type {
  FieldBackend,
  FieldBuffer,
  FieldSource,
  GridSpec,
  PointLayout,
  VolumeSpec,
} from './types';

export interface CpuExecutor {
  run(source: FieldSource, layout: PointLayout): Promise<Float32Array>;
  dispose(): void;
}

export function createInlineExecutor(): CpuExecutor {
  return {
    run: (source, layout) =>
      Promise.resolve(evaluateRange(source, layout, 0, layoutPointCount(layout))),
    dispose: () => undefined,
  };
}

function resolvedBuffer(values: Float32Array, pointCount: number): FieldBuffer {
  return { pointCount, read: () => Promise.resolve(values), release: () => undefined };
}

export function createCpuBackend(executor: CpuExecutor): FieldBackend {
  let source: FieldSource | null = null;

  async function evaluate(layout: PointLayout): Promise<FieldBuffer> {
    if (source === null) {
      throw new Error('The CPU backend has no charge system, call load first');
    }
    const values = await executor.run(source, layout);
    return resolvedBuffer(values, layoutPointCount(layout));
  }

  return {
    kind: 'cpu',
    load: (next) => {
      source = next;
    },
    evaluateGrid: (spec: GridSpec) => evaluate({ kind: 'grid', spec }),
    evaluateVolume: (spec: VolumeSpec) => evaluate({ kind: 'volume', spec }),
    evaluatePoints: (coordinates: Float64Array) => evaluate({ kind: 'points', coordinates }),
    dispose: () => {
      source = null;
      executor.dispose();
    },
  };
}
