# 22. Field backends and GPU evaluation

Status: accepted

## Context

Every view needs field values at grid nodes, volume nodes or a list of points, and the same numbers must come from two places: a WebGPU compute pass and a float64 reference that also serves browsers without WebGPU. The two have to be comparable point by point, and the GPU path has to stay accurate in float32 at a distance of a few conductor radii from a 900 m line.

## Decision

- One interface, `FieldBackend`, with `load`, `evaluateGrid`, `evaluateVolume`, `evaluatePoints` and `dispose`. The result is a `FieldBuffer` with the 12 floats per point of ADR 7. The CPU backend splits rows over up to four workers and merges the parts. The GPU backend keeps the output on the device and reads it back only when asked.
- The GPU kernels share one WGSL module for the segment terms. A generated header supplies the workgroup shape, the tiling switch and the physical constants, scaled to microcoulombs per metre and microtesla. The three entry points (ground grid, volume, point list) are composed from the header, the shared module and the entry file, and the tests refuse comments in the composed source.
- Segment ends and evaluation points are subtracted from the centre of the evaluated region in float64 before they are uploaded. The shader receives the ground height in that frame and mirrors the image about it.
- Tiling through workgroup memory is a build-time constant. The benchmark runs both variants at 8 × 8 and 16 × 16 and stores the timings per adapter. The default stays at the shape ADR 7 names, because it was the fastest on the RTX 3070 Ti Laptop GPU and within 10 percent elsewhere.
- Parity is the norm of the difference over the norm of the reference per point, with a floor at 1 percent of the largest reference norm, and the target is a maximum below 1e-3. The automation hook runs the comparison inside the page, so the same code serves the Playwright specs and the benchmark, on any browser the benchmark can drive.
- The benchmark has three modes. By default it serves the build, launches Chromium and writes the result files. With `--emit-plan` it writes the list of hook calls, and with `--ingest` it turns the output of a run on another machine (the Windows host with a real GPU) into the same files.

## Alternatives

- Evaluating on the GPU in world coordinates. A coordinate near 450 m has a float32 spacing of 3e-5 m, which is 0.02 percent of the clamp radius and would show up directly in the field next to a conductor.
- Float32 emulation on the CPU to predict the GPU error. It would not include driver differences, which the three-adapter run shows are small but not zero.
- A single kernel with the layout as a runtime switch. It makes every invocation carry the branches of the other two layouts and prevents separate workgroup shapes.

## Consequences

- Any new view takes a `FieldBackend`, and a fallback needs no changes in the views.
- A region far from the line centre loses accuracy near conductors in proportion to its size, so very large grids would need one origin per tile. The current regions are 120 m wide and 900 m long and meet the target (physics.md, sections 15 and 16).
- The parity run is part of the benchmark, so a change to the shaders shows up as a failing `pnpm bench:gpu`.
