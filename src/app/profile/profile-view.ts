import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MODEL_LABELS, SECTION_RANGE } from '../../core/model/settings';
import { profileToCsv } from '../../core/profile/csv';
import { LineChart } from '../charts/line-chart';
import { FileDownload } from '../services/file-download';
import { FieldStore } from '../state/field-store';
import { ProfileData } from './profile-data';
import { profileChartSpec, profileSummaryText, readoutAt } from './profile-model';

export const PROFILE_FILE_NAME = 'fieldline-profile.csv';

type Presentation = 'chart' | 'table';

@Component({
  selector: 'fl-profile-view',
  imports: [LineChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.css',
})
export class ProfileView {
  protected readonly store = inject(FieldStore);
  protected readonly data = inject(ProfileData);
  private readonly download = inject(FileDownload);

  protected readonly presentation = signal<Presentation>('chart');
  protected readonly cursor = signal(0);
  protected readonly sectionRange = SECTION_RANGE;
  protected readonly height = computed(() => this.store.settings().evaluationHeight);
  protected readonly twoDimensional = computed(
    () => this.store.settings().model === 'cross-section-2d',
  );
  protected readonly overlayOn = computed(() => this.data.overlay() !== null);

  private readonly modelLabel = computed(() => MODEL_LABELS[this.store.settings().model]);

  private specFor(quantity: 'electric' | 'magnetic') {
    const profile = this.data.profile();
    if (profile === null) {
      return null;
    }
    return profileChartSpec({
      quantity,
      profile,
      overlay: this.data.overlay(),
      levels: quantity === 'electric' ? this.data.electricEntries() : this.data.magneticEntries(),
      modelLabel: this.modelLabel(),
      otherLabel: MODEL_LABELS['cross-section-2d'],
      context: this.data.sectionText(),
    });
  }

  protected readonly electricSpec = computed(() => this.specFor('electric'));
  protected readonly magneticSpec = computed(() => this.specFor('magnetic'));

  protected readonly readout = computed(() => {
    const profile = this.data.profile();
    return profile === null ? null : readoutAt(profile, this.data.overlay(), this.cursor());
  });

  protected readonly summary = computed(() => {
    const profile = this.data.profile();
    return profile === null
      ? ''
      : profileSummaryText(profile, this.store.settings(), this.data.sectionText());
  });

  protected readonly crossings = computed(() =>
    [...this.data.electricLevels(), ...this.data.magneticLevels()].map((level) => ({
      key: `${level.quantity}-${level.key}`,
      field: level.quantity === 'electric' ? 'E' : 'B',
      text: level.text,
      name: level.name,
      reached: level.crossings?.reached ?? false,
      description: level.crossingText,
    })),
  );

  protected show(presentation: Presentation): void {
    this.presentation.set(presentation);
  }

  protected setCursor(x: number): void {
    this.cursor.set(x);
  }

  protected setSection(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      const fraction = Number(event.target.value);
      if (Number.isFinite(fraction)) {
        this.store.setSettings({ sectionFraction: fraction });
      }
    }
  }

  protected setOverlay(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.store.setSettings({ overlay2d: event.target.checked });
    }
  }

  protected downloadCsv(): void {
    const profile = this.data.profile();
    if (profile !== null) {
      this.download.save(PROFILE_FILE_NAME, profileToCsv(profile), 'text/csv');
    }
  }
}
