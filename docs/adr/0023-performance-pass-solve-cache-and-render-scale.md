# 23. Performance pass: solve cache, render scale and a lazy automation hook

Status: accepted

## Context

The target is under 200 ms from a parameter change to updated fields, and 60 fps in every view. The first latency run on the RTX 3070 Ti Laptop gave 360 to 430 ms for every kind of change, although the solve plus the field evaluation added up to 30 to 90 ms. A CDP profile of the page showed the main thread busy in the function that finds the colour scale maxima: it spread a new selection object for every grid point, and called `Math.hypot` and trigonometric functions per point. The electric field lines of the Iris Xe also sat at 42 fps because the ground peak was rescanned on every animation tick.

## Decision

- The maxima code prepares the selection once per grid. `RmsMaxima` stays the single place that finds the scale maxima, and the heatmap, the scene and the pipeline all call it.
- The charge solve depends only on the geometry, so a keyed LRU cache wraps the solver (`withSolveCache`). The key is the geometry fields plus the draft and residual flags. Voltage, current and phasing changes then skip the solve and cost only the evaluation.
- The ground peak is memoized per frame, so a field line animation tick does not rescan the grid.
- A render scale control for the 3D views offers 100, 75 and 50 percent and an automatic mode. Automatic steps down when the median frame interval stays above 20 ms over 30 frames. It never steps up on its own.
- The automation hook loads lazily and only with `?automation`, which took the initial bundle from 423 kB to 367 kB.
- The matrix assembly avoids `Math.hypot`.

## Alternatives

- Move the maxima search into the worker. It would hide a wasteful loop instead of removing it.
- Cache the solve on the full parameter set. Voltage drags would miss the cache for no reason.
- Lower the grid size by default on integrated GPUs. The measured frame times did not call for it, and the draft quality drag already lowers the grid during interaction.

## Consequences

- The measured update latency is 32 to 65 ms on the RTX 3070 Ti Laptop and 58 to 128 ms on the Iris Xe at the default size. The CPU fallback is not claimed to meet the target: it takes 220 to 390 ms for full quality changes and meets 200 ms only for the draft drag.
- The cache holds the last four solves. A sweep over more distinct geometries evicts the oldest, which is why the latency benchmark uses 40 distinct sag values.
- `bench/latency.ts` and `bench/frame-times.ts` are the guard: a regression shows up as a number, not as an opinion.
