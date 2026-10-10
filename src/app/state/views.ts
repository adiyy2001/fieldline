import {
  type ModelKind,
  VIEW_DEFINITIONS,
  type ViewDefinition,
  type ViewId,
} from '../../core/model/settings';
import type { Scene3dView } from '../scene3d/scene3d-model';

export const VIEW_AVAILABILITY: readonly ViewDefinition[] = VIEW_DEFINITIONS;

export const THREE_D_VIEWS: readonly Scene3dView[] = ['volume', 'isosurface', 'lines'];

export const THREE_D_NOTICE =
  'The Volume, Isosurfaces and Field lines views need WebGPU and the 3D charge model.';

export function isThreeDView(view: ViewId): view is Scene3dView {
  return THREE_D_VIEWS.some((candidate) => candidate === view);
}

export function threeDAvailable(backend: 'pending' | 'gpu' | 'cpu', model: ModelKind): boolean {
  return backend === 'gpu' && model === 'charge-3d';
}
