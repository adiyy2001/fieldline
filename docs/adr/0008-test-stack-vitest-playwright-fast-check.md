# 8. Test stack: Vitest, Playwright and fast-check

Status: accepted

## Context

The brief asks for Jest and Cypress unless the current Angular default is clearly the better fit. The project needs unit tests that run the same TypeScript the application runs, component tests, property tests, and browser tests that start Chromium with WebGPU flags, load the production build and read GPU buffers back through page scripts. Coverage thresholds must differ per directory.

Angular 22 scaffolds Vitest, and its `@angular/build:unit-test` builder runs it with the same compiler pipeline as the application build.

## Decision

- Vitest 5 for unit and component tests through the Angular builder, jsdom for component tests and @vitest/coverage-v8 for coverage.
- fast-check for property tests: symmetry, mirrored phasing, superposition and linearity, catenary invariants, URL codec round trips.
- Playwright with its bundled Chromium for end-to-end tests against the production build. This includes the GPU parity test and the screenshot checks. The launch flags are `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --use-angle=swiftshader --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE`, which expose a software adapter on machines without a GPU.
- Jest and Cypress are not used.

## Alternatives

- Jest. It would add a second transform pipeline next to the Angular builder for no benefit, and its API is close to Vitest's, so the tests read the same.
- Cypress. It can run Chrome with extra arguments, but driving page-side GPU readbacks and pinning the browser build are easier with Playwright, and the same tool records the demo frames.
- System Chrome instead of the bundled Chromium. On the development machine only Playwright's bundled headless shell exposed an adapter in headless mode, and the lockfile pins its version.

## Consequences

- Spec files use `describe`, `it` and `expect`, which read like Jest.
- Browser tests need `pnpm exec playwright install chromium` once, in CI as well.
- Tests that need a GPU adapter run on the software adapter in CI. Real-GPU results are produced by the benchmark scripts and stored under bench/results.
