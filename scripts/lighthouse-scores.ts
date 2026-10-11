export const ACCESSIBILITY_THRESHOLD = 0.95;

export const CATEGORIES = ['accessibility', 'best-practices', 'seo', 'performance'] as const;
export type Category = (typeof CATEGORIES)[number];

export const FORM_FACTORS = ['mobile', 'desktop'] as const;
export type FormFactor = (typeof FORM_FACTORS)[number];

export const RENDERERS = ['webgpu', 'fallback'] as const;
export type Renderer = (typeof RENDERERS)[number];

export interface FailedAudit {
  readonly id: string;
  readonly title: string;
  readonly score: number;
}

export interface AuditResult {
  readonly renderer: Renderer;
  readonly formFactor: FormFactor;
  readonly scores: Readonly<Record<Category, number | null>>;
  readonly failedAccessibilityAudits: readonly FailedAudit[];
}

export function belowThreshold(
  results: readonly AuditResult[],
  threshold = ACCESSIBILITY_THRESHOLD,
): readonly string[] {
  return results
    .filter(({ scores }) => scores.accessibility === null || scores.accessibility < threshold)
    .map(({ renderer, formFactor }) => `${renderer} ${formFactor}`);
}

export function describeScores({ renderer, formFactor, scores }: AuditResult): string {
  const parts = CATEGORIES.map((category) => `${category} ${String(scores[category])}`);
  return `${renderer} ${formFactor}: ${parts.join(', ')}`;
}
