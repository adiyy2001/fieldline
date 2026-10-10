# 1. Angular shell with a framework-free core

Status: accepted

## Context

fieldline mixes three kinds of code: numerical physics (field solvers, the phasing optimizer, exposure levels), GPU code (WGSL kernels and the buffers around them) and an Angular interface. The physics has to run in Node scripts, in unit tests, in a Web Worker and as the float64 reference for the GPU. It should also be readable by someone who has never opened an Angular project.

The engineering rules ask for standalone components, signals, `ChangeDetectionStrategy.OnPush`, built-in control flow and zoneless change detection where the framework supports it.

## Decision

- `src/` has four layers. `core` is plain TypeScript in float64 with no DOM and no Angular, compiled against `lib: ES2023` only. `gpu` holds WebGPU resources, packing code and WGSL modules and may import types and pure functions from `core`. `workers` holds worker entry points and imports `core`. `app` is the Angular shell and may import all three.
- Dependencies point one way: `app` to `gpu` to `core`, and `workers` to `core`. A separate `tsconfig` for `core` without DOM types and ESLint `no-restricted-imports` rules per directory enforce this.
- Angular 22 is zoneless and OnPush by default. Every component still sets `changeDetection: ChangeDetectionStrategy.OnPush` explicitly, is standalone, reads signals and uses `@if` and `@for`.
- Application state lives in one NgRx SignalStore (`@ngrx/signals`). Recomputation after a parameter change goes through `rxMethod` with a debounce and a generation id, so a stale result never overwrites a newer one.
- The repository is a single package. There is one application and no library that would be versioned separately.

## Alternatives

- An Nx workspace with libraries for core and gpu. The boundaries would be checked by Nx tags, which the lint rules already do for this size of project, and the build graph would add tooling with nothing to cache.
- Putting the solver inside Angular services. It would tie the numerical code to dependency injection and make the worker and Node uses awkward.
- Publishing `core` as its own npm package. Nothing in the project needs it, and publishing is a separate decision.

## Consequences

- The same physics code runs unchanged in the browser, in a worker, in Vitest and in the validation scripts.
- The restricted-import rules need an update whenever a top-level folder is added.
- The GPU packing code can be tested without a GPU because it only produces typed arrays.
