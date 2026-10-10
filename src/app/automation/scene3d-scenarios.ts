import { layoutBounds } from '../../core/backend/layout';
import { defaultVolumeSpec } from '../../core/backend/regions';
import type { FieldSource, VolumeSpec } from '../../core/backend/types';
import type { Point3 } from '../../core/field-types';
import { createFieldEvaluator3D } from '../../core/field3d/evaluate';
import { createClearance } from '../../core/fieldlines/clearance';
import { instantaneousVectorField } from '../../core/fieldlines/field-source';
import { placeSeeds } from '../../core/fieldlines/seeds';
import { lineEndCode, traceLine } from '../../core/fieldlines/trace';
import {
  DEFAULT_LINE_COUNT,
  DEFAULT_STEP_COUNT,
  type LineSeed,
  type TraceSettings,
} from '../../core/fieldlines/types';
import { referenceSpan } from '../../core/geometry/discretize';
import { SEGMENT_STRIDE } from '../../core/field3d/segment-set';
import { extractIsosurface, type ScalarVolume } from '../../core/isosurface/extraction';
import { scalarGrid } from '../../core/heatmap/scalar';
import { groupExcitation } from '../../core/model/excitation';
import { defaultParameters, lineGeometryFromParameters } from '../../core/model/parameters';
import {
  closureDistance,
  compareLineEnd,
  compareMeshes,
  mirrorDifference,
  pixelAt,
  summarizeStridedMesh,
} from '../../core/validation/scene3d-parity';
import {
  DEFAULT_TRANSFER,
  buildTransferTable,
  compositeFrontToBack,
  normalizedValue,
} from '../../core/volume/transfer-function';
import { DEFAULT_CAMERA_POSE } from '../../gpu/camera';
import type { ReadyDevice } from '../../gpu/device';
import type { GpuFieldBackend } from '../../gpu/field-evaluator';
import { createFieldLinesLayer } from '../../gpu/field-lines';
import { createIsosurfaceLayer } from '../../gpu/isosurface-layer';
import { SCENE_COLORS } from '../../gpu/scene-geometry';
import { createSceneRenderer } from '../../gpu/scene-renderer';
import { SURFACE_VERTEX_BYTES } from '../../gpu/surface-params';
import { splitTracedLines } from '../../gpu/trace-params';
import { createVolumeField } from '../../gpu/volume-field';
import { createVolumeLayer } from '../../gpu/volume-layer';
import { DEFAULT_MARCH_STEPS, referenceLengthOf } from '../../gpu/volume-params';
import type { SolverClient } from '../services/solver-client';
import type {
  FieldLineRun,
  FieldLinesRequest,
  FieldLinesRun,
  IsosurfaceLevelRun,
  IsosurfaceRequest,
  IsosurfaceRun,
  VolumeImageRequest,
  VolumeImageRun,
} from './scene3d-types';

const SPHERE_HALF_EXTENT = 10;
const SPHERE_SIZE = 48;
const SPHERE_LEVELS = [4, 6, 8];
const GAUSSIAN_SIGMA = 4;
const GAUSSIAN_PEAK = 100;
const DEFAULT_IMAGE = { width: 96, height: 64 };
const LINE_SIZE = { nx: 32, ny: 32, nz: 64 };
const FLOAT_STRIDE = 8;

export interface ScenarioDependencies {
  readonly ready: ReadyDevice;
  readonly solver: SolverClient;
  readonly createGpuBackend: (ready: ReadyDevice) => GpuFieldBackend;
  readonly clock: () => number;
}

function sphereSpec(): VolumeSpec {
  return {
    xMin: -SPHERE_HALF_EXTENT,
    xMax: SPHERE_HALF_EXTENT,
    yMin: -SPHERE_HALF_EXTENT,
    yMax: SPHERE_HALF_EXTENT,
    zMin: -SPHERE_HALF_EXTENT,
    zMax: SPHERE_HALF_EXTENT,
    nx: SPHERE_SIZE,
    ny: SPHERE_SIZE,
    nz: SPHERE_SIZE,
  };
}

function syntheticMagneticField(
  ready: ReadyDevice,
  spec: VolumeSpec,
  valueAt: (point: Point3) => number,
): { buffer: GPUBuffer; values: Float32Array } {
  const count = spec.nx * spec.ny * spec.nz;
  const values = new Float32Array(count * 12);
  for (let index = 0; index < count; index += 1) {
    const ix = index % spec.nx;
    const iy = Math.floor(index / spec.nx) % spec.ny;
    const iz = Math.floor(index / (spec.nx * spec.ny));
    values[index * 12 + 6] = valueAt({
      x: spec.xMin + (ix * (spec.xMax - spec.xMin)) / (spec.nx - 1),
      y: spec.yMin + (iy * (spec.yMax - spec.yMin)) / (spec.ny - 1),
      z: spec.zMin + (iz * (spec.zMax - spec.zMin)) / (spec.nz - 1),
    });
  }
  const buffer = ready.device.createBuffer({
    size: values.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  ready.device.queue.writeBuffer(buffer, 0, values);
  return { buffer, values };
}

function scalarVolumeOf(spec: VolumeSpec, values: ArrayLike<number>): ScalarVolume {
  return {
    nx: spec.nx,
    ny: spec.ny,
    nz: spec.nz,
    origin: { x: spec.xMin, y: spec.yMin, z: spec.zMin },
    spacing: {
      x: (spec.xMax - spec.xMin) / (spec.nx - 1),
      y: (spec.yMax - spec.yMin) / (spec.ny - 1),
      z: (spec.zMax - spec.zMin) / (spec.nz - 1),
    },
    values,
  };
}

async function prepareSource(
  dependencies: ScenarioDependencies,
  tower: IsosurfaceRequest['tower'],
): Promise<{ source: FieldSource; parameters: ReturnType<typeof defaultParameters> }> {
  const parameters = defaultParameters(tower);
  const { system } = await dependencies.solver.solve(parameters);
  return { source: { system, excitation: groupExcitation(parameters) }, parameters };
}

export async function runIsosurface(
  dependencies: ScenarioDependencies,
  request: IsosurfaceRequest,
): Promise<IsosurfaceRun> {
  const { ready, clock } = dependencies;
  const backend = request.source === 'line' ? dependencies.createGpuBackend(ready) : null;
  let spec = sphereSpec();
  let fieldBuffer: GPUBuffer;
  let cpuValues: Float32Array;
  const releases: (() => void)[] = [];
  if (backend === null) {
    const synthetic = syntheticMagneticField(ready, spec, (point) =>
      Math.hypot(point.x, point.y, point.z),
    );
    fieldBuffer = synthetic.buffer;
    cpuValues = synthetic.values;
    releases.push(() => {
      synthetic.buffer.destroy();
    });
  } else {
    const { source, parameters } = await prepareSource(dependencies, request.tower);
    spec = defaultVolumeSpec(
      lineGeometryFromParameters(parameters),
      source.system.reference.index,
      request.size ?? LINE_SIZE,
    );
    backend.load(source);
    const buffer = await backend.evaluateVolume(spec);
    if (!('buffer' in buffer)) {
      throw new Error('The GPU backend returned a host buffer');
    }
    fieldBuffer = buffer.buffer as GPUBuffer;
    cpuValues = await buffer.read();
    releases.push(() => {
      buffer.release();
    });
  }
  const quantity = request.source === 'sphere' ? 'magnetic' : 'electric';
  const field = createVolumeField(ready, spec);
  const layer = createIsosurfaceLayer(ready, field);
  try {
    field.setField(fieldBuffer);
    field.pack({ quantity, mode: 'rms', phaseRadians: 0 });
    const peaks = await field.measure();
    const peak = quantity === 'magnetic' ? peaks.magnetic : peaks.electric;
    const levels =
      request.levels ??
      (request.source === 'sphere'
        ? SPHERE_LEVELS
        : [0.05, 0.15, 0.4].map((fraction) => fraction * peak));
    const started = clock();
    layer.extract(levels);
    const counts = await layer.counts();
    const extractMilliseconds = clock() - started;
    const scalars = scalarGrid(cpuValues, { quantity, mode: 'rms', phaseRadians: 0 });
    const volume = scalarVolumeOf(spec, scalars);
    const runs: IsosurfaceLevelRun[] = [];
    for (let index = 0; index < levels.length; index += 1) {
      const level = levels[index] ?? 0;
      const vertices = await layer.readVertices(index);
      const gpu = summarizeStridedMesh({
        data: vertices,
        stride: FLOAT_STRIDE,
        vertexCount: vertices.byteLength / SURFACE_VERTEX_BYTES,
      });
      const mesh = extractIsosurface(volume, level);
      const cpu = summarizeStridedMesh({
        data: mesh.positions,
        stride: 3,
        vertexCount: mesh.vertexCount,
      });
      const count = counts[index];
      runs.push({
        ...compareMeshes(gpu, cpu),
        level,
        gpuArea: gpu.area,
        cpuArea: cpu.area,
        analyticArea: request.source === 'sphere' ? 4 * Math.PI * level * level : null,
        produced: count?.produced ?? 0,
        capacity: count?.capacity ?? 0,
      });
    }
    return {
      source: request.source,
      dimensions: [spec.nx, spec.ny, spec.nz],
      peak,
      levels: runs,
      extractMilliseconds,
    };
  } finally {
    layer.dispose();
    field.dispose();
    releases.forEach((release) => {
      release();
    });
    backend?.dispose();
  }
}

export async function runVolumeImage(
  dependencies: ScenarioDependencies,
  request: VolumeImageRequest,
): Promise<VolumeImageRun> {
  const { ready } = dependencies;
  const width = request.width ?? DEFAULT_IMAGE.width;
  const height = request.height ?? DEFAULT_IMAGE.height;
  const spec = sphereSpec();
  const gaussian = (point: Point3) =>
    GAUSSIAN_PEAK *
    Math.exp(-(point.x ** 2 + point.y ** 2 + point.z ** 2) / (2 * GAUSSIAN_SIGMA ** 2));
  const synthetic = syntheticMagneticField(ready, spec, gaussian);
  const box = layoutBounds({ kind: 'volume', spec });
  const field = createVolumeField(ready, spec);
  const renderer = createSceneRenderer(ready, null);
  const layer = createVolumeLayer(ready, field, box);
  try {
    field.setField(synthetic.buffer);
    field.pack({ quantity: 'magnetic', mode: 'rms', phaseRadians: 0 });
    const table = buildTransferTable(DEFAULT_TRANSFER);
    layer.setTransfer(table);
    layer.setMaximum(GAUSSIAN_PEAK);
    renderer.setLayers([layer]);
    const distance = 60;
    const pose = {
      ...DEFAULT_CAMERA_POSE,
      yaw: request.yaw ?? 0,
      pitch: request.pitch ?? 0,
      distance,
      target: { x: 0, y: 0, z: 0 },
    };
    const pixels = await renderer.capture({ pose, seconds: 0 }, width, height);
    const boxDepth = box.max.z - box.min.z;
    const stepLength = boxDepth / DEFAULT_MARCH_STEPS;
    const fractions = Array.from({ length: DEFAULT_MARCH_STEPS }, (_, step) => {
      const z = box.max.z - (step + 0.5) * stepLength;
      return normalizedValue(gaussian({ x: 0, y: 0, z }), GAUSSIAN_PEAK);
    });
    const composed = compositeFrontToBack(fractions, table, stepLength / referenceLengthOf(box));
    const [red, green, blue] = SCENE_COLORS.background;
    const expected = [
      composed.red + (1 - composed.alpha) * red,
      composed.green + (1 - composed.alpha) * green,
      composed.blue + (1 - composed.alpha) * blue,
    ].map((channel) => Math.round(channel * 255));
    return {
      width,
      height,
      pixels,
      mirrorDifference: mirrorDifference(pixels, width, height),
      centre: pixelAt(pixels, width, Math.floor(width / 2), Math.floor(height / 2)),
      expectedCentre: expected,
      corner: pixelAt(pixels, width, 0, 0),
      background: [red, green, blue].map((channel) => Math.round(channel * 255)),
    };
  } finally {
    layer.dispose();
    renderer.dispose();
    field.dispose();
    synthetic.buffer.destroy();
  }
}

function nearestConductorClearance(source: FieldSource, seed: LineSeed): number {
  const { set } = source.system;
  let best = Infinity;
  for (let index = 0; index < set.count; index += 1) {
    const offset = index * SEGMENT_STRIDE;
    const sx = seed.origin.x - (set.data[offset] ?? 0);
    const sy = seed.origin.y - (set.data[offset + 1] ?? 0);
    const sz = seed.origin.z - (set.data[offset + 2] ?? 0);
    const along = Math.min(
      set.data[offset + 6] ?? 0,
      Math.max(
        0,
        sx * (set.data[offset + 3] ?? 0) +
          sy * (set.data[offset + 4] ?? 0) +
          sz * (set.data[offset + 5] ?? 0),
      ),
    );
    const distance = Math.hypot(
      sx - along * (set.data[offset + 3] ?? 0),
      sy - along * (set.data[offset + 4] ?? 0),
      sz - along * (set.data[offset + 5] ?? 0),
    );
    best = Math.min(best, distance / (set.data[offset + 7] ?? 1));
  }
  return best;
}

export async function runFieldLines(
  dependencies: ScenarioDependencies,
  request: FieldLinesRequest,
): Promise<FieldLinesRun> {
  const { ready, clock } = dependencies;
  const { source, parameters } = await prepareSource(dependencies, request.tower);
  const geometry = lineGeometryFromParameters(parameters);
  const reference = referenceSpan(geometry);
  const volume = defaultVolumeSpec(geometry, source.system.reference.index, LINE_SIZE);
  const box = layoutBounds({ kind: 'volume', spec: volume });
  const stepCount = request.stepCount ?? DEFAULT_STEP_COUNT;
  const seeds = placeSeeds(source.system.set, reference, {
    kind: request.kind,
    lineCount: request.lineCount ?? DEFAULT_LINE_COUNT,
  });
  const phaseRadians = ((request.phaseDegrees ?? 0) * Math.PI) / 180;
  const layer = createFieldLinesLayer(ready);
  try {
    layer.load({ source, seeds, box, groundHeight: 0, stepCount });
    const started = clock();
    layer.trace({ quantity: request.kind, phaseRadians });
    const traced = await layer.read();
    const traceMilliseconds = clock() - started;
    const gpuLines = splitTracedLines(traced);
    const evaluator = createFieldEvaluator3D(
      source.system,
      source.excitation.voltages,
      source.excitation.currents,
    );
    const field = instantaneousVectorField(evaluator, request.kind, phaseRadians);
    const clearance = createClearance(source.system.set);
    const settings: TraceSettings = { stepCount, box, groundHeight: 0 };
    const domainSize = Math.hypot(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z,
    );
    const lines = seeds.map((seed, index): FieldLineRun => {
      const cpu = traceLine(seed, field, clearance, settings);
      const gpu = gpuLines[index];
      if (gpu === undefined) {
        throw new Error(`Line ${String(index)} was not traced`);
      }
      const comparison = compareLineEnd(
        gpu,
        { pointCount: cpu.pointCount, end: lineEndCode(cpu.end), positions: cpu.positions },
        domainSize,
      );
      return {
        start: seed.origin,
        gpuEnd: gpu.end,
        cpuEnd: lineEndCode(cpu.end),
        endDistance: comparison.endDistance,
        endFraction: comparison.endFraction,
        gpuPointCount: gpu.pointCount,
        cpuPointCount: cpu.pointCount,
        startClearance: nearestConductorClearance(source, seed),
        startsDownward: seed.outward.y < 0,
        gpuClosure: closureDistance(gpu),
        cpuClosure: closureDistance({
          pointCount: cpu.pointCount,
          end: 0,
          positions: cpu.positions,
        }),
        arcLength: seed.arcLength,
      };
    });
    return { kind: request.kind, domainSize, lines, traceMilliseconds };
  } finally {
    layer.dispose();
  }
}
