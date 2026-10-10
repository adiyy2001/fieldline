# 9. Toolchain versions and pins

Status: accepted

## Context

The brief asks for the latest stable version of every tool. Two of those are not usable as they are: the newest TypeScript on npm is 7.0.2, but Angular 22 declares peer support for `>=6.0 <6.1`, and the default Node 24.13 on the development machine fails the engine range of `@angular/build` 22 (`^22.22.3 || ^24.15.0 || >=26`).

## Decision

- Node 24 LTS at 24.15 or newer, developed on 24.21.0. `.nvmrc` holds `24` and `engines.node` holds `>=24.15`.
- pnpm 12.11.2 through corepack, set in `packageManager`. Dependency build scripts are approved in `pnpm-workspace.yaml` through `allowBuilds`: esbuild and @parcel/watcher run, lmdb and msgpackr-extract do not. A throwaway Angular 22.2.2 application installed, built and passed `ng test` with this setup. If pnpm 12 regresses, pnpm 11.5.3 with the same workspace file is the fallback.
- TypeScript 6.0.3, the newest version Angular 22 supports. The ESLint stack follows it: typescript-eslint 8.71.1 accepts `<6.1.0`.
- Angular 22.2.2, @ngrx/signals 22.0.1, Vitest 5.0.3, Playwright 1.64.0, fast-check 4.10.2, ESLint 10.12.0, Prettier 3.9.10, wgpu-matrix 3.4.2 and @webgpu/types 0.1.74.
- Direct dependencies are pinned to exact versions in `package.json`, so the manifest and the lockfile name the same versions.
- GitHub Actions are pinned to their current major versions.

## Alternatives

- TypeScript 7. It is the npm default, but the Angular compiler rejects it.
- Staying on pnpm 11.5.3. It works, but pnpm 12 is current and was verified here.
- Caret ranges. They make installs drift between machines.

## Consequences

- Upgrading Angular, TypeScript or Node is a deliberate change with a green full verification run.
- The CI workflow uses the same Node and pnpm versions as local development.
