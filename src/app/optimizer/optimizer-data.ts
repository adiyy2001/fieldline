import { Injectable, computed, inject } from '@angular/core';
import { levelEntries } from '../../core/exposure/contour-levels';
import { explainBestAgainstWorst } from '../../core/optimizer/explanation';
import { arrangementFromPhasing } from '../../core/optimizer/arrangements';
import { ProfileData } from '../profile/profile-data';
import {
  DRAFT_PROFILE_STEP_METRES,
  PROFILE_STEP_METRES,
  sectionPosition,
} from '../profile/profile-model';
import { FieldStore } from '../state/field-store';
import {
  type OptimizerRequest,
  bestWorstOf,
  comparisonChartSpec,
  criterionQuantity,
  evaluateOptimizer,
  optimizerRows,
  supportsOptimizer,
} from './optimizer-model';

@Injectable({ providedIn: 'root' })
export class OptimizerData {
  private readonly store = inject(FieldStore);
  private readonly profileData = inject(ProfileData);

  readonly towerSupported = computed(() => supportsOptimizer(this.store.parameters()));
  readonly criterion = computed(() => this.store.settings().rankCriterion);
  readonly distance = computed(() => this.store.settings().rankDistance);
  readonly height = computed(() => this.store.settings().evaluationHeight);

  private readonly electrical = computed(
    () => {
      const parameters = this.store.parameters();
      return {
        lineToLineKilovolts: parameters.lineToLineKilovolts,
        currentAmperes: parameters.currentAmperes,
        powerFactorAngleDegrees: parameters.powerFactorAngleDegrees,
      };
    },
    {
      equal: (first, second) =>
        first.lineToLineKilovolts === second.lineToLineKilovolts &&
        first.currentAmperes === second.currentAmperes &&
        first.powerFactorAngleDegrees === second.powerFactorAngleDegrees,
    },
  );

  readonly results = computed(() => {
    const frame = this.store.frame();
    if (frame === null || !this.towerSupported()) {
      return [];
    }
    const source = frame.basisSource();
    if (source.groupCount !== 6) {
      return [];
    }
    const z =
      this.store.settings().model === 'cross-section-2d'
        ? 0
        : sectionPosition(frame, this.store.settings().sectionFraction).z;
    const request: OptimizerRequest = {
      parameters: { ...this.store.parameters(), ...this.electrical() },
      height: this.height(),
      z,
      distance: this.distance(),
      step: frame.quality === 'draft' ? DRAFT_PROFILE_STEP_METRES : PROFILE_STEP_METRES,
    };
    return evaluateOptimizer(source, request);
  });

  readonly available = computed(() => this.results().length > 0);

  readonly rows = computed(() =>
    optimizerRows(this.results(), this.criterion(), this.store.parameters().phasing),
  );

  readonly bestWorst = computed(() =>
    this.available() ? bestWorstOf(this.results(), this.criterion()) : null,
  );

  readonly explanation = computed(() => {
    const pair = this.bestWorst();
    return pair === null
      ? null
      : explainBestAgainstWorst(pair.best, pair.worst, {
          criterion: this.criterion(),
          height: this.height(),
          distance: this.distance(),
        });
  });

  readonly chartSpec = computed(() => {
    const pair = this.bestWorst();
    if (pair === null) {
      return null;
    }
    const quantity = criterionQuantity(this.criterion());
    return comparisonChartSpec({
      best: pair.best.result,
      worst: pair.worst.result,
      quantity,
      levels: levelEntries(quantity, this.store.settings().presetId, {
        customLevels: this.store.settings().customLevels,
        hiddenLevels: this.store.settings().hiddenLevels,
      }),
      height: this.height(),
    });
  });

  readonly currentLabel = computed(() => {
    const arrangement = arrangementFromPhasing(this.store.parameters().phasing);
    return arrangement === undefined
      ? null
      : (this.rows().find((row) => row.current)?.label ?? null);
  });

  readonly sectionText = this.profileData.sectionText;
}
