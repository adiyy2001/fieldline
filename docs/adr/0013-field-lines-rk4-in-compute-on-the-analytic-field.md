# 13. Field lines: RK4 in compute on the analytic field

Status: accepted

## Context

The brief wants field lines traced with RK4 in a compute shader on the instantaneous field, animated over the cycle. The instantaneous field changes with the phase angle ωt. The electric field at a point oscillates along a fixed ellipse, so lines flip direction twice per cycle, and the sign of the charge on a conductor, which decides where lines start, changes too.

## Decision

- A line is traced by one workgroup of 64 threads. Integration runs along the unit direction of the field, so a step is an arc length, with classical RK4 and a fixed number of steps (default 192 steps for 128 lines).
- At each RK4 stage the field is evaluated analytically with the same segment sum as the field kernel (ADR 7), on the instantaneous phasors at the current phase. The 64 threads split the segments (thread i takes segments i, i + 64, and so on), and a workgroup reduction combines the partial sums. One thread per line would leave the GPU almost idle at this line count. Sampling the stored 3D volume would be cheaper per step, but it loses accuracy near the conductors, where the lines begin.
- Seeds sit on rings around the phase conductors at several positions along the middle span. For each seed the direction of integration follows the sign of E·n, with n the outward normal of the ring, so a line always leaves the conductor and stays correct while the charge changes sign over the cycle.
- A line ends when it reaches the ground, comes within a conductor radius of a conductor or leaves the domain. The loop keeps its fixed length and all barriers stay outside any branch that depends on the line state. A finished line skips only the arithmetic and keeps its last position, and the buffer records its length.
- Magnetic field lines are closed loops around the conductors. They start on rings at fixed distances from each conductor and integrate along +B for a fixed arc length.
- Lines are drawn as instanced camera-facing quads from the positions buffer, with a depth test and the field magnitude as colour. A moving dash pattern along the line shows the direction.
- The trace repeats whenever the phase changes. Line count and step count are settings, and the benchmark records the cost of a retrace.

## Alternatives

- Tracing on the CPU. It would be easier to test, but the animation needs a retrace on every frame.
- Tracing in the sampled volume with trilinear interpolation. It is faster, and it is the fallback if the analytic version misses the frame budget on integrated GPUs.
- Streamlines from the rms field. The rms field carries no direction, and the brief asks for the instantaneous field.

## Consequences

- The cost grows with lines × steps × stages × segments. For 128 lines, 192 steps, 4 stages and 480 segments that is 47 million segment evaluations per retrace. The field kernel reached about 3.4 billion evaluations per second on the integrated adapter, which puts a retrace near 15 ms there. The benchmark confirms or corrects this.
- A float64 RK4 in the core is the reference for line end points in the tests.
