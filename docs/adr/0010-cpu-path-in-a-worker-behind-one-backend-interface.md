# 10. CPU path in a worker behind one backend interface

Status: accepted

## Context

The brief wants a fallback without WebGPU: the CPU path in a Web Worker with a coarser grid, behind the same interface, and a TypeScript math module that doubles as the reference for the tests. The charge system is solved in float64 in a worker in every case (ADR 2), so both paths start from the same charges.

## Decision

- A `FieldBackend` interface describes what the views need: accept a charge system, evaluate a grid in the plane at a given height, evaluate a 3D volume, evaluate an arbitrary point list. Every result uses the 12 float layout of ADR 7 and can be read back as a Float32Array.
- The GPU implementation keeps its results in device buffers for the render passes. The CPU implementation runs the float64 functions of the core in a worker, splits the rows of a grid across up to four workers, converts to float32 and transfers the buffers.
- Without WebGPU (no API, no adapter, failed device creation or a lost device) the application starts with the CPU backend. The default grid shrinks to 256 × 128. The profile, the optimizer and the ground heatmap with marching-squares contours on a 2D canvas keep working. The volume, isosurface and field line views need WebGPU and show a short notice that says why.
- GitHub Pages cannot send the headers that cross-origin isolation needs, so workers exchange transferable buffers and no SharedArrayBuffer.
- The same core functions run inside Vitest, in Node scripts and in the worker. The worker file only wires messages to them.

## Alternatives

- A WebGL 2 fallback. It means a second shader port that still has no compute stage.
- CPU versions of the 3D views. The full volume is 252 million segment evaluations for 480 segments, more work than an interactive CPU update allows, and the ray marcher and the isosurface pass would need CPU twins as well.
- Dropping the fallback. The brief lists it as a must-have.

## Consequences

- The parity test compares two implementations of one interface, and a later backend (WebGL, a remote service) would have a place to plug in.
- The CPU backend is part of the product and gets the same coverage threshold as the rest of the core.
