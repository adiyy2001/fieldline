import { TOWER_KINDS, type TowerKind } from '../geometry/tower';
import {
  type LineParameters,
  defaultParameters,
  structuralIssues,
  validateParameters,
} from './parameters';
import {
  type Configuration,
  type DisplayMode,
  type ViewSettings,
  defaultConfiguration,
  defaultSettings,
  isModelKind,
  isViewId,
  settingsAreValid,
} from './settings';
import { TOWER_FIELD_KEYS, towerFieldValues, towerFromFieldValues } from './tower-fields';
import type { FieldQuantity } from '../exposure/levels';
import {
  decodeCustomLevels,
  decodeHiddenLevels,
  encodeCustomLevels,
  encodeHiddenLevels,
} from '../exposure/level-edits';
import type { RankCriterion } from '../optimizer/ranking';

export const URL_STATE_VERSION = 1;

const TOWER_CODES: Readonly<Record<TowerKind, string>> = {
  horizontal: 'h',
  delta: 'd',
  'double-circuit': 'dc',
};

const PHASE_LETTERS = 'abc';

interface UrlField {
  readonly key: string;
  readonly touches: readonly string[];
  encode(configuration: Configuration): string;
  apply(configuration: Configuration, raw: string): Configuration | undefined;
}

function parseNumber(raw: string): number | undefined {
  if (raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseNumberList(raw: string): readonly number[] | undefined {
  const parts = raw.split(',').map(parseNumber);
  return parts.every((part): part is number => part !== undefined) ? parts : undefined;
}

function withParameters(configuration: Configuration, parameters: LineParameters): Configuration {
  return { ...configuration, parameters };
}

function withSettings(configuration: Configuration, settings: ViewSettings): Configuration {
  return { ...configuration, settings };
}

function numberParameter(
  key: string,
  field: string,
  read: (parameters: LineParameters) => number,
  write: (parameters: LineParameters, value: number) => LineParameters,
): UrlField {
  return {
    key,
    touches: [field],
    encode: (configuration) => String(read(configuration.parameters)),
    apply: (configuration, raw) => {
      const value = parseNumber(raw);
      return value === undefined
        ? undefined
        : withParameters(configuration, write(configuration.parameters, value));
    },
  };
}

function towerKindOf(raw: string): TowerKind | undefined {
  return TOWER_KINDS.find((kind) => TOWER_CODES[kind] === raw);
}

const towerDimensionsField: UrlField = {
  key: 'td',
  touches: ['tower', 'phaseSag'],
  encode: (configuration) => towerFieldValues(configuration.parameters.tower).map(String).join(','),
  apply: (configuration, raw) => {
    const values = parseNumberList(raw);
    const { tower } = configuration.parameters;
    return values?.length !== TOWER_FIELD_KEYS[tower.kind].length
      ? undefined
      : withParameters(configuration, {
          ...configuration.parameters,
          tower: towerFromFieldValues(tower.kind, values),
        });
  },
};

const spansField: UrlField = {
  key: 'sp',
  touches: ['spanLengths', 'phaseSag'],
  encode: (configuration) => configuration.parameters.spanLengths.map(String).join(','),
  apply: (configuration, raw) => {
    const values = parseNumberList(raw);
    return values === undefined
      ? undefined
      : withParameters(configuration, { ...configuration.parameters, spanLengths: values });
  },
};

const phasingField: UrlField = {
  key: 'ph',
  touches: ['phasing'],
  encode: (configuration) =>
    configuration.parameters.phasing.map((phase) => PHASE_LETTERS[phase] ?? 'a').join(''),
  apply: (configuration, raw) => {
    const indexes = Array.from(raw).map((letter) => PHASE_LETTERS.indexOf(letter));
    return indexes.some((index) => index < 0)
      ? undefined
      : withParameters(configuration, { ...configuration.parameters, phasing: indexes });
  },
};

function enumSetting<T extends string>(
  key: string,
  read: (settings: ViewSettings) => T,
  write: (settings: ViewSettings, value: T) => ViewSettings,
  codes: readonly (readonly [T, string])[],
): UrlField {
  return {
    key,
    touches: [],
    encode: (configuration) => {
      const current = read(configuration.settings);
      return codes.find(([value]) => value === current)?.[1] ?? '';
    },
    apply: (configuration, raw) => {
      const match = codes.find(([, code]) => code === raw);
      return match === undefined
        ? undefined
        : withSettings(configuration, write(configuration.settings, match[0]));
    },
  };
}

function numberSetting(
  key: string,
  read: (settings: ViewSettings) => number,
  write: (settings: ViewSettings, value: number) => ViewSettings,
): UrlField {
  return {
    key,
    touches: [],
    encode: (configuration) => String(read(configuration.settings)),
    apply: (configuration, raw) => {
      const value = parseNumber(raw);
      return value === undefined
        ? undefined
        : withSettings(configuration, write(configuration.settings, value));
    },
  };
}

const presetField: UrlField = {
  key: 'lv',
  touches: [],
  encode: (configuration) => configuration.settings.presetId,
  apply: (configuration, raw) =>
    withSettings(configuration, { ...configuration.settings, presetId: raw }),
};

const viewField: UrlField = {
  key: 'w',
  touches: [],
  encode: (configuration) => configuration.settings.view,
  apply: (configuration, raw) =>
    isViewId(raw)
      ? withSettings(configuration, { ...configuration.settings, view: raw })
      : undefined,
};

const modelField: UrlField = {
  key: 'm',
  touches: [],
  encode: (configuration) => configuration.settings.model,
  apply: (configuration, raw) =>
    isModelKind(raw)
      ? withSettings(configuration, { ...configuration.settings, model: raw })
      : undefined,
};

const quantityCodes: readonly (readonly [FieldQuantity, string])[] = [
  ['electric', 'e'],
  ['magnetic', 'b'],
];
const modeCodes: readonly (readonly [DisplayMode, string])[] = [
  ['rms', 'rms'],
  ['instantaneous', 'inst'],
];

const customLevelsField: UrlField = {
  key: 'cl',
  touches: [],
  encode: (configuration) => encodeCustomLevels(configuration.settings.customLevels),
  apply: (configuration, raw) => {
    const customLevels = decodeCustomLevels(raw);
    return customLevels === undefined
      ? undefined
      : withSettings(configuration, { ...configuration.settings, customLevels });
  },
};

const hiddenLevelsField: UrlField = {
  key: 'hl',
  touches: [],
  encode: (configuration) => encodeHiddenLevels(configuration.settings.hiddenLevels),
  apply: (configuration, raw) => {
    const hiddenLevels = decodeHiddenLevels(raw);
    return hiddenLevels === undefined
      ? undefined
      : withSettings(configuration, { ...configuration.settings, hiddenLevels });
  },
};

const overlayField: UrlField = {
  key: 'o2',
  touches: [],
  encode: (configuration) => (configuration.settings.overlay2d ? '1' : '0'),
  apply: (configuration, raw) =>
    raw === '0' || raw === '1'
      ? withSettings(configuration, { ...configuration.settings, overlay2d: raw === '1' })
      : undefined,
};

const criterionCodes: readonly (readonly [RankCriterion, string])[] = [
  ['peak-electric', 'pe'],
  ['peak-magnetic', 'pb'],
  ['electric-at-distance', 'de'],
  ['magnetic-at-distance', 'db'],
];

const FIELDS: readonly UrlField[] = [
  towerDimensionsField,
  numberParameter(
    'kv',
    'lineToLineKilovolts',
    (p) => p.lineToLineKilovolts,
    (p, value) => ({ ...p, lineToLineKilovolts: value }),
  ),
  numberParameter(
    'a',
    'currentAmperes',
    (p) => p.currentAmperes,
    (p, value) => ({ ...p, currentAmperes: value }),
  ),
  numberParameter(
    'pf',
    'powerFactorAngleDegrees',
    (p) => p.powerFactorAngleDegrees,
    (p, value) => ({ ...p, powerFactorAngleDegrees: value }),
  ),
  numberParameter(
    'hz',
    'frequencyHz',
    (p) => p.frequencyHz,
    (p, value) => ({ ...p, frequencyHz: value }),
  ),
  spansField,
  numberParameter(
    'sag',
    'phaseSag',
    (p) => p.phaseSag,
    (p, value) => ({ ...p, phaseSag: value }),
  ),
  numberParameter(
    'ssr',
    'shieldSagRatio',
    (p) => p.shieldSagRatio,
    (p, value) => ({ ...p, shieldSagRatio: value }),
  ),
  numberParameter(
    'seg',
    'segmentsPerSpan',
    (p) => p.segmentsPerSpan,
    (p, value) => ({ ...p, segmentsPerSpan: value }),
  ),
  numberParameter(
    'bn',
    'bundleCount',
    (p) => p.bundleCount,
    (p, value) => ({ ...p, bundleCount: value }),
  ),
  numberParameter(
    'bs',
    'bundleSpacingMetres',
    (p) => p.bundleSpacingMetres,
    (p, value) => ({ ...p, bundleSpacingMetres: value }),
  ),
  numberParameter(
    'bd',
    'subconductorDiameterMillimetres',
    (p) => p.subconductorDiameterMillimetres,
    (p, value) => ({ ...p, subconductorDiameterMillimetres: value }),
  ),
  numberParameter(
    'sd',
    'shieldDiameterMillimetres',
    (p) => p.shieldDiameterMillimetres,
    (p, value) => ({ ...p, shieldDiameterMillimetres: value }),
  ),
  phasingField,
  modelField,
  enumSetting(
    'q',
    (s) => s.quantity,
    (s, quantity) => ({ ...s, quantity }),
    quantityCodes,
  ),
  enumSetting(
    'r',
    (s) => s.mode,
    (s, mode) => ({ ...s, mode }),
    modeCodes,
  ),
  numberSetting(
    'ang',
    (s) => s.phaseDegrees,
    (s, phaseDegrees) => ({ ...s, phaseDegrees }),
  ),
  numberSetting(
    'ht',
    (s) => s.evaluationHeight,
    (s, evaluationHeight) => ({ ...s, evaluationHeight }),
  ),
  presetField,
  customLevelsField,
  hiddenLevelsField,
  numberSetting(
    'sec',
    (s) => s.sectionFraction,
    (s, sectionFraction) => ({ ...s, sectionFraction }),
  ),
  overlayField,
  enumSetting(
    'rk',
    (s) => s.rankCriterion,
    (s, rankCriterion) => ({ ...s, rankCriterion }),
    criterionCodes,
  ),
  numberSetting(
    'rd',
    (s) => s.rankDistance,
    (s, rankDistance) => ({ ...s, rankDistance }),
  ),
  viewField,
];

function baselineFor(kind: TowerKind): Configuration {
  return { parameters: defaultParameters(kind), settings: defaultSettings() };
}

export function encodeConfiguration(configuration: Configuration): string {
  const kind = configuration.parameters.tower.kind;
  const baseline = baselineFor(kind);
  const entries: [string, string][] = [['v', String(URL_STATE_VERSION)]];
  if (kind !== 'horizontal') {
    entries.push(['t', TOWER_CODES[kind]]);
  }
  for (const field of FIELDS) {
    const encoded = field.encode(configuration);
    if (encoded !== field.encode(baseline)) {
      entries.push([field.key, encoded]);
    }
  }
  return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}

function acceptable(candidate: Configuration, field: UrlField): boolean {
  if (!settingsAreValid(candidate.settings)) {
    return false;
  }
  const issues = structuralIssues(candidate.parameters);
  return !issues.some((issue) =>
    field.touches.some((name) => issue.field === name || issue.field.startsWith(`${name}.`)),
  );
}

export function urlStateKeys(): readonly string[] {
  return ['v', 't', ...FIELDS.map((field) => field.key)];
}

function decodePart(part: string): string {
  const spaced = part.replaceAll('+', ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function parseQuery(search: string): Map<string, string> {
  const query = new Map<string, string>();
  const text = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of text.split('&')) {
    const separator = pair.indexOf('=');
    const key = decodePart(separator < 0 ? pair : pair.slice(0, separator));
    if (key !== '' && !query.has(key)) {
      query.set(key, separator < 0 ? '' : decodePart(pair.slice(separator + 1)));
    }
  }
  return query;
}

export function decodeConfiguration(search: string): Configuration {
  const query = parseQuery(search);
  if (query.get('v') !== String(URL_STATE_VERSION)) {
    return defaultConfiguration();
  }
  const kind = towerKindOf(query.get('t') ?? TOWER_CODES.horizontal) ?? 'horizontal';
  let configuration = baselineFor(kind);
  for (const field of FIELDS) {
    const raw = query.get(field.key);
    const candidate = raw === undefined ? undefined : field.apply(configuration, raw);
    if (candidate !== undefined && acceptable(candidate, field)) {
      configuration = candidate;
    }
  }
  return validateParameters(configuration.parameters).length === 0
    ? configuration
    : baselineFor(kind);
}
