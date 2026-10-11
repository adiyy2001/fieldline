import { describe, expect, it } from 'vitest';
import {
  ACCESSIBILITY_THRESHOLD,
  type AuditResult,
  belowThreshold,
  describeScores,
} from './lighthouse-scores';

function result(overrides: Partial<AuditResult>, accessibility: number | null): AuditResult {
  return {
    renderer: 'webgpu',
    formFactor: 'mobile',
    scores: { accessibility, 'best-practices': 1, seo: 1, performance: 0.9 },
    failedAudits: [],
    ...overrides,
  };
}

describe('belowThreshold', () => {
  it('names nothing when every accessibility score reaches the threshold', () => {
    expect(
      belowThreshold([result({}, ACCESSIBILITY_THRESHOLD), result({ formFactor: 'desktop' }, 1)]),
    ).toEqual([]);
  });

  it('names the renderer and form factor of every result below it', () => {
    const results = [
      result({ renderer: 'webgpu' }, 1),
      result({ renderer: 'fallback', formFactor: 'mobile' }, 0.9),
      result({ renderer: 'fallback', formFactor: 'desktop' }, 0.5),
    ];
    expect(belowThreshold(results)).toEqual(['fallback mobile', 'fallback desktop']);
  });

  it('counts a missing score as failing', () => {
    expect(belowThreshold([result({ renderer: 'fallback' }, null)])).toEqual(['fallback mobile']);
  });

  it('accepts a custom threshold', () => {
    expect(belowThreshold([result({}, 0.96)], 0.99)).toEqual(['webgpu mobile']);
  });
});

describe('describeScores', () => {
  it('lists every category in one line', () => {
    expect(describeScores(result({}, 1))).toBe(
      'webgpu mobile: accessibility 1, best-practices 1, seo 1, performance 0.9',
    );
  });
});
