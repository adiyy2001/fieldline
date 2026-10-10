import { kilovoltsPerMetre, microtesla } from '../exposure/levels';
import type { Profile } from './sampler';

export const PROFILE_CSV_HEADER = 'distance_m,E_kV_per_m,B_uT';

export function profileToCsv(profile: Profile): string {
  const rows = profile.samples.map(
    (sample) =>
      `${sample.x.toFixed(3)},${kilovoltsPerMetre(sample.electricRms).toFixed(4)},${microtesla(sample.magneticRms).toFixed(4)}`,
  );
  return `${[PROFILE_CSV_HEADER, ...rows].join('\n')}\n`;
}
