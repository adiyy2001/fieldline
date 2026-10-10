# 7. GPU field kernel layout

Status: accepted

## Context

The field at a point is a sum over every segment of the charge system and its image, about 500 segments for the default model. It is evaluated at roughly half a million points for the ground grid and again for the volume. The sum has little memory traffic and a lot of arithmetic. Float32 is the practical precision on the GPU, so the layout has to keep the numbers well scaled, and the CPU reference must be able to read the same buffers.

## Decision

- One Segment struct of 48 bytes, with no implicit padding in the storage buffer: `a: vec3<f32>`, `qRe: f32`, `b: vec3<f32>`, `qIm: f32`, `cur: vec4<f32>`. The last vector holds the real and imaginary part of the current, the conductor radius and one spare slot. Charge density is in microcoulombs per metre, current in amperes, lengths in metres.
- The kernel adds the image of each segment (y mirrored, charge negated) inside the loop, so the buffer holds the real segments only. The magnetic field uses no images.
- Output is 12 f32 per point in one array of structures: E real xyz, E imaginary xyz, B real xyz, B imaginary xyz. The 1024 × 512 ground grid and the 128 × 64 × 64 volume both have 524,288 points and need 25.2 MB each. That is far below the default storage buffer binding limit of 128 MiB, so no optional limits are requested and the code runs on adapters with default limits.
- Workgroups are 8 × 8 for the grid and 4 × 4 × 4 for the volume, 64 threads each. The segments are processed in tiles of 64: every thread loads one segment into workgroup memory (3 KB), a barrier follows, and every thread accumulates the whole tile.
- Distances are taken from the segment start, and the distance to the axis is clamped to the conductor radius, which keeps the sum finite at the conductor surface.
- The phase of the instantaneous view is applied after the kernel. The visualization passes rotate the stored phasors by exp(jωt), so animating the phase needs no new field evaluation.

## Alternatives

- Structure of arrays. The kernel reads every field of a segment anyway.
- 16 × 16 workgroups. Measured equal or slower than 8 × 8 on every adapter tried.
- No tiling, each thread reading the segment buffer directly. Measured 20 percent slower on an RTX 3070 Ti Laptop GPU and equal on Intel Iris Xe and on SwiftShader. Tiling stays the default.
- Textures for the output. A storage buffer keeps the 12 components together and avoids format limits.
- Half precision storage. The shader-f16 feature is missing on the software adapter.

## Consequences

- On the probe geometry the largest float32 against float64 relative error over 120 sampled points was 1.6e-5 for E and 3.1e-5 for B across the three adapters tried. That is a factor of 30 below the 1e-3 target. The parity test repeats the measurement on the real geometries.
- A change in the number of segments changes a uniform and no shader code.
