import type { Excitation } from '../model/excitation';
import type { ChargeSystem } from '../field3d/charge-system';

export const FIELD_COMPONENTS = 12;
export const MICROTESLA_PER_TESLA = 1e6;
export const MICROCOULOMB_PER_COULOMB = 1e6;

export interface GridSpec {
  readonly height: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly nx: number;
  readonly nz: number;
}

export interface VolumeSpec {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly zMin: number;
  readonly zMax: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export type PointLayout =
  | { readonly kind: 'grid'; readonly spec: GridSpec }
  | { readonly kind: 'volume'; readonly spec: VolumeSpec }
  | { readonly kind: 'points'; readonly coordinates: Float64Array };

export interface FieldSource {
  readonly system: ChargeSystem;
  readonly excitation: Excitation;
}

export interface FieldBuffer {
  readonly pointCount: number;
  read(): Promise<Float32Array>;
  release(): void;
}

export interface FieldBackend {
  readonly kind: 'gpu' | 'cpu';
  load(source: FieldSource): void;
  evaluateGrid(spec: GridSpec): Promise<FieldBuffer>;
  evaluateVolume(spec: VolumeSpec): Promise<FieldBuffer>;
  evaluatePoints(coordinates: Float64Array): Promise<FieldBuffer>;
  dispose(): void;
}
