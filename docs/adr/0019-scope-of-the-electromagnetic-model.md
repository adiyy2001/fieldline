# 19. Scope of the electromagnetic model

Status: accepted

## Context

A model of fields around a transmission line can grow without limit. A reader should know which effects the model includes, which it leaves out and how large the omitted ones are.

## Decision

Included:
- Quasi-static fields at one frequency, 50 Hz by default. The wavelength at 50 Hz is 6000 km, so the electric field follows from the charges at each instant and the magnetic field from the currents at each instant, with no coupling or retardation.
- A perfectly conducting flat ground at zero potential for the electric field, handled with images. Shield wires at zero potential.
- Balanced voltages and currents by default, with a configurable power factor angle. The user can edit the phase angles and magnitudes of each conductor.
- Catenary conductors in 3D, an infinite line at mid-span height in 2D.
- Bundles as an equivalent conductor in the 3D model. The 2D model can also place the subconductors explicitly.

Left out, with the reasoning:
- Earth return currents. Balanced phase currents sum to zero, so no net current returns. An unbalanced remainder returns through the earth, spread over a depth of the order of the complex penetration depth, about 500 m for 100 Ω·m soil at 50 Hz (Deri et al., 1981). Its field at ground level is that of a current about 1 km below, which is 0.2 µT for a full 1000 A and far less for the usual unbalance. The Deri complex image is a stretch goal.
- Currents induced in grounded shield wires. They oppose the flux of the phase currents and reduce the magnetic field somewhat, so leaving them out errs on the high side. The size depends on grounding and span length and is not modelled.
- Corona, audible noise and transients, which the brief excludes.
- Terrain slope, buildings, trees and persons. Reference levels apply to the unperturbed field.
- Harmonics and unbalance beyond what the user enters by hand.

## Alternatives

- A full-wave or finite element model. It answers questions nobody asked at this frequency and costs orders of magnitude more compute.
- Modelling the shield wire currents with a line impedance model. It needs soil resistivity and grounding data that the tool does not collect.

## Consequences

- docs/physics.md repeats this list next to the derivations, and the README states the limits.
- Each omitted effect is a possible extension with a clear entry point in the model.
