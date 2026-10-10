import { type BundleSpec, equivalentRadius } from './bundle';
import { type Catenary, createCatenary, heightAt } from './catenary';
import { type ConductorRole, type TowerDimensions, towerAttachments } from './tower';

export interface SpanSpec {
  readonly length: number;
  readonly sag: number;
}

export interface ConductorGeometry {
  readonly role: ConductorRole;
  readonly index: number;
  readonly x: number;
  readonly attachmentHeight: number;
  readonly sagFactor: number;
  readonly bundle: BundleSpec;
  readonly equivalentRadius: number;
  readonly subconductorRadius: number;
}

export interface LineGeometry {
  readonly tower: TowerDimensions;
  readonly spans: readonly SpanSpec[];
  readonly conductors: readonly ConductorGeometry[];
}

export interface LineGeometryInput {
  readonly tower: TowerDimensions;
  readonly spans: readonly SpanSpec[];
  readonly phaseBundle: BundleSpec;
  readonly shieldDiameter: number;
  readonly shieldSagRatio: number;
}

export function buildLineGeometry(input: LineGeometryInput): LineGeometry {
  if (input.spans.length < 1 || input.spans.length > 3) {
    throw new RangeError('A line has one to three spans');
  }
  const shieldBundle: BundleSpec = {
    count: 1,
    spacing: 0,
    subconductorDiameter: input.shieldDiameter,
  };
  const conductors = towerAttachments(input.tower).map((attachment): ConductorGeometry => {
    const isPhase = attachment.role === 'phase';
    const bundle = isPhase ? input.phaseBundle : shieldBundle;
    return {
      role: attachment.role,
      index: attachment.index,
      x: attachment.x,
      attachmentHeight: attachment.height,
      sagFactor: isPhase ? 1 : input.shieldSagRatio,
      bundle,
      equivalentRadius: equivalentRadius(bundle),
      subconductorRadius: bundle.subconductorDiameter / 2,
    };
  });
  return { tower: input.tower, spans: input.spans, conductors };
}

export function conductorCatenary(conductor: ConductorGeometry, span: SpanSpec): Catenary {
  return createCatenary(span.length, conductor.sagFactor * span.sag);
}

export function conductorHeightAt(conductor: ConductorGeometry, span: SpanSpec, z: number): number {
  return heightAt(conductorCatenary(conductor, span), conductor.attachmentHeight, z);
}

export function midSpanHeight(conductor: ConductorGeometry, span: SpanSpec): number {
  return conductorHeightAt(conductor, span, span.length / 2);
}

export function phaseConductors(geometry: LineGeometry): readonly ConductorGeometry[] {
  return geometry.conductors.filter((conductor) => conductor.role === 'phase');
}

export function shieldConductors(geometry: LineGeometry): readonly ConductorGeometry[] {
  return geometry.conductors.filter((conductor) => conductor.role === 'shield');
}
