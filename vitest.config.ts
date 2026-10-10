import { defineConfig } from 'vitest/config';
import { excludedFromCoverage } from './scripts/device-bound-files.ts';

const nonProductionFiles = ['**/*.spec.ts', '**/*.d.ts', 'src/**/testing/**', 'src/main.ts'];

export default defineConfig({
  test: {
    testTimeout: 30000,
    coverage: {
      exclude: [...excludedFromCoverage, ...nonProductionFiles],
      thresholds: {
        'src/core/**': { lines: 90 },
        'src/app/**': { lines: 80 },
        'src/gpu/**': { lines: 80 },
        'src/workers/**': { lines: 80 },
      },
    },
  },
});
