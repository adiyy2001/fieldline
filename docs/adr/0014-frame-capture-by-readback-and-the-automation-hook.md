# 14. Frame capture by readback and the automation hook

Status: accepted

## Context

Tests, benchmarks and the demo recording need exact frames and exact timings from a WebGPU canvas. Compositor screenshots of a WebGPU canvas in headless Chromium work only with a particular flag set and can race with presentation. The contents of a WebGPU canvas are also cleared once the frame is presented, so reading the canvas afterwards is unreliable.

## Decision

- The renderer can draw the current view into an offscreen `rgba8unorm` texture of a fixed size and copy it into a mappable buffer. This readback gives exact pixels that do not depend on the compositor.
- A global `fieldline` object exists only when the page URL carries the query parameter `automation`. Without it nothing is installed and nothing changes. The object offers:
  - `ready`, a promise that resolves after the first frame
  - `adapter()` with vendor, architecture, device, description and a `software` flag
  - `settle()`, which waits for pending solves, for `queue.onSubmittedWorkDone()` and for two animation frames
  - `setParameters(partial)`, `setView(name)`, `setPhase(degrees)` and `setCamera(pose)`, using the same schema as the URL state
  - `captureFrame(width, height)` returning RGBA bytes
  - `readField(kind)` returning the Float32Array of the last grid or volume, for parity tests
  - `timings()` and `frameStats(count)` for the benchmarks
  - `scene(name)` for the four scenes of the demo recording
- `page.screenshot()` is used for the interface around the canvas. Pixels of the canvas come from `captureFrame`.
- Animation can be driven from outside: the hook sets the phase and waits for `settle()`, so the recorder produces the same frames on every run.

## Alternatives

- `page.screenshot()` of the canvas. It depends on presentation and flags.
- `canvas.toDataURL()`. It only works in the same task that rendered the frame.
- A test-only build with the hook compiled in. The tests would then run against a different bundle than the one that ships.

## Consequences

- The hook is part of the production bundle, inactive by default, documented in the docs folder and covered by an end-to-end test.
- Screenshot checks compare readback pixels with reviewed baseline images under a small tolerance. A documented command regenerates the baselines on purpose. Images for review during development go to `.artifacts`, which is not tracked.
