import { Injectable, computed, inject } from '@angular/core';
import { type LevelEntry, levelEntries } from '../../core/exposure/contour-levels';
import type { FieldQuantity } from '../../core/exposure/levels';
import {
  type LevelCrossings,
  describeCrossings,
  levelCrossings,
} from '../../core/exposure/summary';
import type { LevelEdits } from '../../core/exposure/level-edits';
import type { Profile } from '../../core/profile/sampler';
import { FieldStore } from '../state/field-store';
import {
  DRAFT_PROFILE_STEP_METRES,
  PROFILE_STEP_METRES,
  crossSectionProfile,
  describeSection,
  displayedProfile,
  profileRows,
  sectionPosition,
} from './profile-model';

export interface LevelReadout {
  readonly key: string;
  readonly text: string;
  readonly name: string;
  readonly custom: boolean;
  readonly dashIndex: number;
  readonly emphasised: boolean;
  readonly value: number;
  readonly quantity: FieldQuantity;
  readonly crossings: LevelCrossings | null;
  readonly crossingText: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileData {
  private readonly store = inject(FieldStore);

  private readonly model = computed(() => this.store.settings().model);
  private readonly fraction = computed(() => this.store.settings().sectionFraction);
  private readonly height = computed(() => this.store.settings().evaluationHeight);
  private readonly overlayRequested = computed(() => this.store.settings().overlay2d);
  private readonly presetId = computed(() => this.store.settings().presetId);
  private readonly edits = computed<LevelEdits>(
    () => ({
      customLevels: this.store.settings().customLevels,
      hiddenLevels: this.store.settings().hiddenLevels,
    }),
    {
      equal: (first, second) =>
        first.customLevels === second.customLevels && first.hiddenLevels === second.hiddenLevels,
    },
  );

  readonly overlayAvailable = computed(() => this.model() === 'charge-3d');

  readonly profile = computed<Profile | null>(() => {
    const frame = this.store.frame();
    if (frame === null) {
      return null;
    }
    return displayedProfile(frame, {
      model: this.model(),
      sectionFraction: this.fraction(),
      evaluationHeight: this.height(),
    });
  });

  readonly overlay = computed<Profile | null>(() => {
    const frame = this.store.frame();
    if (frame === null || !this.overlayRequested() || !this.overlayAvailable()) {
      return null;
    }
    const step = frame.quality === 'draft' ? DRAFT_PROFILE_STEP_METRES : PROFILE_STEP_METRES;
    return crossSectionProfile(this.store.parameters(), this.height(), step);
  });

  readonly section = computed(() => {
    const frame = this.store.frame();
    return frame === null ? null : sectionPosition(frame, this.fraction());
  });

  readonly sectionText = computed(() => {
    const section = this.section();
    return section === null ? '' : describeSection(section, this.model());
  });

  readonly rows = computed(() => {
    const profile = this.profile();
    return profile === null ? [] : profileRows(profile, this.overlay());
  });

  readonly electricEntries = computed(() =>
    levelEntries('electric', this.presetId(), this.edits()),
  );
  readonly magneticEntries = computed(() =>
    levelEntries('magnetic', this.presetId(), this.edits()),
  );

  private readouts(
    quantity: FieldQuantity,
    entries: readonly LevelEntry[],
  ): readonly LevelReadout[] {
    const profile = this.profile();
    return entries.map((entry) => {
      const crossings = profile === null ? null : levelCrossings(profile, quantity, entry);
      return {
        key: entry.key,
        text: entry.text,
        name: entry.name,
        custom: entry.custom,
        dashIndex: entry.dashIndex,
        emphasised: entry.emphasised,
        value: entry.value,
        quantity,
        crossings,
        crossingText: crossings === null ? '' : describeCrossings(crossings),
      };
    });
  }

  readonly electricLevels = computed(() => this.readouts('electric', this.electricEntries()));
  readonly magneticLevels = computed(() => this.readouts('magnetic', this.magneticEntries()));
}
