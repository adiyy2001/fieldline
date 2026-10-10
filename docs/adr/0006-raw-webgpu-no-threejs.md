# 6. Raw WebGPU for compute and rendering, without three.js

Status: accepted

## Context

The brief asks to choose between the three.js WebGPURenderer with TSL for everything, and raw WebGPU for compute with three.js for the scene. The project is mostly compute: field kernels with tiled workgroup memory, a marching-cubes pass that writes vertices and draw arguments, and traced field lines. The scene itself has few objects: a ground quad, a volume ray marcher, a triangle list produced by compute, instanced line quads and a few conductor tubes.

To see the cost, a minimal three.js 0.186.1 WebGPURenderer scene (one mesh, a camera, a render call) was bundled with esbuild 0.28.2, minified and tree-shaken. It came to 787,818 bytes, 214,681 gzipped. Adding the TSL compute imports raised it to 895,512 bytes, 245,098 gzipped. A fresh Angular 22 application builds to 123,491 bytes of JavaScript, 41,192 gzipped.

## Decision

- Use raw WebGPU for compute and rendering, typed with @webgpu/types, on a small own helper layer: device acquisition, pipeline and buffer helpers, pass encoders and a readback helper.
- Use wgpu-matrix for matrices and vectors and an own orbit camera.
- Keep three.js out of the dependency list.

## Alternatives

- three.js WebGPURenderer with TSL for compute and rendering. TSL describes a kernel as a node graph, which hides the memory layout and the workgroup tiling that this project is about, and it makes the shader code harder to review.
- Raw compute plus three.js for the scene. Two systems then share device state, and every view still needs a custom material. The scene graph would manage a handful of objects.

## Consequences

- More first-party code: the camera controller, depth and multisample targets and the pipeline helpers. Each part is small and covered by unit tests or readback tests.
- The WGSL lives in plain text modules that a reviewer can read, and the CPU reference can mirror them function by function.
- The bundle avoids 215 kB of gzipped JavaScript, about five times the gzipped size of a fresh Angular application.
