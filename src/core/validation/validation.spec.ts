import fc from 'fast-check';
import { EXPOSURE_PRESETS } from '../exposure/levels';
import { PUBLISHED_CASES, PUBLISHED_TOLERANCE } from './published-reference';
import { limitHeight, peakField, publishedCrossSection } from './published-limit';
import { maximumOf, maximumRelativeError, relativeError } from './metrics';
import {
  lineCharge,
  longConductorFluxDensity,
  singleConductorField,
  singleConductorPotential,
} from './analytic';
import { type ValidationReport, analyticChecks, buildValidationReport } from './report';

describe('error metrics', () => {
  it('computes relative errors and handles a zero reference', () => {
    expect(relativeError(1.01, 1)).toBeCloseTo(0.01, 12);
    expect(relativeError(-0.5, 0)).toBe(0.5);
    expect(maximumRelativeError([1, 2.2, 3], [1, 2, 3])).toBeCloseTo(0.1, 12);
    expect(maximumOf([3, 9, -1])).toBe(9);
  });
});

describe('analytic formulas', () => {
  const conductor = { voltage: 230940, height: 12, radius: 0.015 };

  it('gives 1.7414 microcoulombs per metre for the reference conductor', () => {
    expect(lineCharge(conductor)).toBeCloseTo(1.7414e-6, 10);
  });

  it('gives a potential equal to the voltage at the surface and zero at the ground', () => {
    expect(singleConductorPotential(conductor, 0.015, 12) / conductor.voltage).toBeCloseTo(1, 6);
    expect(singleConductorPotential(conductor, 17, 0)).toBeCloseTo(0, 6);
  });

  it('points the field away from a positive charge and cancels along the ground plane', () => {
    expect(singleConductorField(conductor, 0, 20).y).toBeGreaterThan(0);
    expect(singleConductorField(conductor, 5, 0).x).toBeCloseTo(0, 6);
    expect(singleConductorField(conductor, 5, 0).y).toBeLessThan(0);
  });

  it('is odd in x', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 30, noNaN: true }),
        (x, y) => {
          expect(singleConductorField(conductor, -x, y).x).toBeCloseTo(
            -singleConductorField(conductor, x, y).x,
            9,
          );
        },
      ),
    );
  });

  it('gives 20 microtesla for 1000 A at 10 m', () => {
    expect(longConductorFluxDensity(1000, 10) * 1e6).toBeCloseTo(20, 7);
  });
});

describe('analytic checks of the model', () => {
  it('pass with errors at rounding level', () => {
    const checks = analyticChecks();
    expect(checks.length).toBeGreaterThanOrEqual(8);
    checks.forEach((entry) => {
      expect(entry.passed, entry.id).toBe(true);
    });
  });
});

describe('published fixtures', () => {
  it('lists 14 cases, 12 of them from the two double circuit towers', () => {
    expect(PUBLISHED_CASES).toHaveLength(14);
    expect(PUBLISHED_CASES.filter((c) => c.tower === 'barrel')).toHaveLength(6);
    expect(PUBLISHED_CASES.filter((c) => c.tower === 'danube')).toHaveLength(6);
    expect(PUBLISHED_CASES.filter((c) => c.fitted).map((c) => c.id)).toEqual(['Portal']);
  });

  it('puts the lowest subconductor of the lowest phase at the clearance', () => {
    const barrelA = PUBLISHED_CASES[0];
    if (barrelA === undefined) {
      throw new Error('missing fixture');
    }
    const section = publishedCrossSection(barrelA, 10, 'explicit');
    const phaseWires = section.wires.filter((wire) => wire.group >= 0);
    expect(phaseWires).toHaveLength(6 * 3);
    expect(Math.min(...phaseWires.map((wire) => wire.y))).toBeCloseTo(10, 9);
    expect(section.wires.filter((wire) => wire.group < 0)).toHaveLength(2);
    const equivalent = publishedCrossSection(barrelA, 10, 'equivalent');
    expect(equivalent.wires).toHaveLength(6 + 2);
  });

  it('rejects a search range that does not contain the limit', () => {
    const portal = PUBLISHED_CASES[13];
    if (portal === undefined) {
      throw new Error('missing fixture');
    }
    expect(peakField(portal, 3, 'electric', 'explicit')).toBeGreaterThan(5000);
    expect(peakField(portal, 40, 'electric', 'explicit')).toBeLessThan(5000);
    expect(limitHeight(portal, 'electric', 'explicit')).toBeGreaterThan(3);
  });

  it('keeps a field above the limit just below the limit height and below it above', () => {
    const cat = PUBLISHED_CASES[12];
    if (cat === undefined) {
      throw new Error('missing fixture');
    }
    const height = limitHeight(cat, 'electric', 'explicit');
    expect(peakField(cat, height - 0.01, 'electric', 'explicit')).toBeGreaterThan(5000);
    expect(peakField(cat, height + 0.01, 'electric', 'explicit')).toBeLessThan(5000);
  });
});

describe('published reference reproduction', () => {
  let report: ValidationReport;

  beforeAll(() => {
    report = buildValidationReport();
  }, 60_000);

  it('reproduces every limit height within 0.05 m', () => {
    expect(report.tolerance).toBe(PUBLISHED_TOLERANCE);
    report.published.forEach((row) => {
      expect(Math.abs(row.electric.deviation), `${row.id} E`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(row.magnetic.deviation), `${row.id} B`).toBeLessThanOrEqual(0.05);
      expect(row.withinTolerance).toBe(true);
    });
    expect(report.summary.allWithinTolerance).toBe(true);
    expect(report.summary.maximumDeviation).toBeLessThan(0.05);
  });

  it('lists the Portal tower as fitted and leaves it out of the agreement statistics', () => {
    expect(report.summary.fittedCases).toBe(1);
    expect(report.published.find((row) => row.id === 'Portal')?.fitted).toBe(true);
    expect(report.summary.publishedCases).toBe(14);
  });

  it('gives equal limit heights where the paper lists equal ones', () => {
    const byId = new Map(report.published.map((row) => [row.id, row]));
    expect(byId.get('BR-E')?.electric.reproduced).toBeCloseTo(
      byId.get('BR-F')?.electric.reproduced ?? 0,
      3,
    );
    expect(byId.get('DN-D')?.electric.reproduced).toBeCloseTo(
      byId.get('DN-F')?.electric.reproduced ?? 0,
      3,
    );
    expect(byId.get('DN-D')?.magnetic.reproduced).toBeCloseTo(
      byId.get('DN-F')?.magnetic.reproduced ?? 0,
      3,
    );
  });

  it('reproduces the best against worst reduction of the Barrel tower', () => {
    const byId = new Map(report.published.map((row) => [row.id, row]));
    const best = byId.get('BR-C')?.electric.reproduced ?? 0;
    const worst = byId.get('BR-A')?.electric.reproduced ?? 1;
    expect((1 - best / worst) * 100).toBeCloseTo(28.2, 0);
  });

  it('orders the arrangements by peak E like the published limit heights', () => {
    expect(report.ranking.map((entry) => entry.tower)).toEqual(['barrel', 'danube']);
    report.ranking.forEach((entry) => {
      expect(entry.pairsChecked).toBeGreaterThan(10);
      expect(entry.violations).toBe(0);
    });
  });

  it('reports a small shift when bundles are replaced by their equivalent conductor', () => {
    expect(report.summary.maximumEquivalentShift).toBeLessThan(0.02);
  });

  it('carries the exposure presets and the citation', () => {
    expect(report.exposure).toHaveLength(EXPOSURE_PRESETS.length);
    expect(report.exposure[0]?.electricKilovoltsPerMetre).toBe(5);
    expect(report.exposure[0]?.magneticMicrotesla).toBeCloseTo(200, 9);
    expect(report.citation).toContain('10.3390/electricity7020039');
    expect(report.summary.analyticPassed).toBe(true);
  });
});
