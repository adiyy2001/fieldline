# Credits

Third-party code, data and assets used by fieldline, with their licences. Every entry is permissive. Later milestones add a line here when they bring in a dependency, a dataset or an asset.

## Runtime dependencies

These ship in the production bundle.

| Package                   | Version | Licence    |
| ------------------------- | ------- | ---------- |
| @angular/common           | 22.2.2  | MIT        |
| @angular/compiler         | 22.2.2  | MIT        |
| @angular/core             | 22.2.2  | MIT        |
| @angular/platform-browser | 22.2.2  | MIT        |
| rxjs                      | 7.8.2   | Apache-2.0 |
| tslib                     | 2.8.1   | 0BSD       |

## Development tools

These build, check and test the project. They are not shipped.

| Package               | Version | Licence      |
| --------------------- | ------- | ------------ |
| @angular/build        | 22.2.2  | MIT          |
| @angular/cli          | 22.2.2  | MIT          |
| @angular/compiler-cli | 22.2.2  | MIT          |
| @eslint/js            | 10.0.1  | MIT          |
| @playwright/test      | 1.64.0  | Apache-2.0   |
| @types/node           | 24.19.2 | MIT          |
| @vitest/coverage-v8   | 5.0.3   | MIT          |
| @webgpu/types         | 0.1.74  | BSD-3-Clause |
| angular-eslint        | 22.5.0  | MIT          |
| eslint                | 10.12.0 | MIT          |
| fast-check            | 4.10.2  | MIT          |
| jsdom                 | 30.1.2  | MIT          |
| prettier              | 3.9.10  | MIT          |
| tsx                   | 4.23.15 | MIT          |
| typescript            | 6.0.3   | Apache-2.0   |
| typescript-eslint     | 8.71.1  | MIT          |
| vitest                | 5.0.3   | MIT          |

## Own work

The favicon in `public/favicon.svg` was drawn for this project and is covered by the project licence (MIT).

## Published data

The 14 limit heights in `src/core/validation/published-reference.ts` and the tower and phasing cases behind them come from Bendík, Cenký and Eleschová, "Determination of Ground Clearance for EHV 400 kV Overhead Power Lines Based on Electromagnetic Field Limits", Electricity 2026, 7(2), 39, https://doi.org/10.3390/electricity7020039, licensed CC BY 4.0. The values were transcribed and the tower geometry was encoded from the paper for the validation tests, with the Portal tower marked as fitted.

Exposure reference levels (ICNIRP 1998 and 2010, Polish Dz.U. 2019 poz. 2448) are numerical limits cited in `docs/physics.md`. No text or table of those documents is reproduced.
