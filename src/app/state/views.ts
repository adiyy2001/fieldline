import { VIEW_DEFINITIONS, type ViewDefinition } from '../../core/model/settings';

const IMPLEMENTED_VIEWS: readonly string[] = ['ground', 'profile', 'optimizer'];

export const VIEW_AVAILABILITY: readonly ViewDefinition[] = VIEW_DEFINITIONS.filter((definition) =>
  IMPLEMENTED_VIEWS.includes(definition.id),
);
