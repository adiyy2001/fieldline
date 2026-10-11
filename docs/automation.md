# Automation hook

Tests, benchmarks and the demo recording drive the production build through a global object. It exists only when the page URL carries the query parameter `automation`, for example `http://127.0.0.1:4330/?automation`. Without the parameter nothing is installed and the bundle does not load the code (ADR 14 and ADR 23).

The object is `window.fieldline`. Every method returns a promise unless noted.

## State and settling

| Member            | What it does                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `ready`           | Resolves after the first frame.                                                                        |
| `adapter()`       | Vendor, architecture, device, description and a `software` flag, or `null` without WebGPU.             |
| `settle()`        | Waits for pending solves, for `queue.onSubmittedWorkDone()` and for two animation frames.              |
| `appState()`      | A snapshot: status, backend, quality, grid, maxima, timings, parameters, settings, probe. Synchronous. |
| `groundFrame()`   | The last ground grid as a `Float32Array` with its grid description. Synchronous.                       |
| `readField(kind)` | The last `ground`, `volume`, `profile` or `clamp` buffer of a parity run. Synchronous.                 |
| `timings()`       | Kernel and wall times of the parity scenarios. Synchronous.                                            |

## Changing the page

| Member                 | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `setParameters(patch)` | Same fields as the URL state.                  |
| `setSettings(patch)`   | Field, mode, view, phase, evaluation height.   |
| `setView(view)`        | Switches the tab.                              |
| `setPhase(degrees)`    | Sets the phase angle and pauses the animation. |
| `setCamera(request)`   | Yaw, pitch and distance of a 3D view.          |

## Frames

`captureFrame({ width, height, contours })` renders the current view into an offscreen texture of that size and returns the RGBA bytes. The ground heatmap draws no contours unless `contours` is true. Compositor screenshots are not used for canvas pixels because they depend on presentation timing.

## Demo scenes

`scene(name)` prepares one of `lines-cycle`, `heatmap-contours`, `phasing-change` and `profile-chart` and returns the number of frames. `sceneFrame(index)` applies one frame, so a recorder produces the same images on every run. `pnpm record:demo` is the recorder.

## Measurements and checks

| Member                                             | What it does                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `measureUpdate(request)`                           | Times a parameter change through solve, evaluate and render. Used by `pnpm bench:latency`.             |
| `runParity`, `runMirror`                           | GPU against float64 on the real geometries. Used by `pnpm bench:gpu` and the parity tests.             |
| `runKernelBench`, `runCpuPool`                     | Kernel variants and the CPU worker pool.                                                               |
| `runIsosurface`, `runVolumeImage`, `runFieldLines` | The 3D kernels against their CPU references.                                                           |
| `runRendererCycles`, `loseDevice`                  | Creates and destroys the renderer repeatedly, and destroys the device on purpose to show the fallback. |

The types are in `src/app/automation/automation-types.ts`.
