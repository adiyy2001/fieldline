# 3. Coordinates, units and phasor conventions

Status: accepted

## Context

The same quantities appear in TypeScript, in WGSL, in the interface and in the derivations. Mixed axis names, units or phase conventions cause bugs that look like physics errors: a mirrored profile, or a field that is off by the square root of two.

## Decision

- Right-handed axes: x across the line, y up, z along the line. The ground is the plane y = 0. This matches the camera math and WebGPU, so shaders need no axis swaps.
- The core works in SI units: metres, volts, amperes, coulombs per metre, volts per metre, tesla. Kilovolts per metre, microtesla and degrees appear only in the interface and in exports. The GPU kernels take charge density in microcoulombs per metre, so E comes out in volts per metre with the factor 8987.55178617 and B in microtesla with the factor 0.1 per ampere.
- Phasors are rms values. The voltage phasors of phases 1, 2 and 3 are V_LL / √3 at 0, -120 and +120 degrees. The current of a phase has the angle of its voltage minus the power factor angle, so a positive angle means a lagging current.
- The instantaneous value is √2 Re[F exp(jωt)] with ω = 2πf and f = 50 Hz by default (60 Hz selectable). The instantaneous view shows the magnitude of that real vector at a chosen angle ωt between 0 and 360 degrees.
- The resultant rms value of a complex vector F is √(|Fx|² + |Fy|² + |Fz|²). Exposure levels and contours refer to it.
- Physical constants are the CODATA 2022 values published by NIST: ε0 = 8.8541878188e-12 F/m and μ0 = 1.25663706127e-6 N/A². Since the 2019 SI redefinition μ0 differs from 4π·1e-7 by a relative 1.3e-10, and the code uses the CODATA value. Then 1 / (4π ε0) = 8.98755178617e9 m/F and μ0 / (4π) = 9.99999999868e-8 T·m/A.

## Alternatives

- z up, as in most electromagnetics texts. It would need a conversion at every boundary to graphics code.
- Peak phasors. Limits and measurements are stated in rms, so rms avoids factors of √2 in the interface.

## Consequences

- Every derivation in docs/physics.md uses these axes, so each symbol maps to code one to one.
- The 2D cross-section model sees x and y only, with the currents along z.
- Tests fix the conventions with hand-computed cases, such as a conductor at x = 5 m whose magnetic field has the direction given by the right-hand rule.
