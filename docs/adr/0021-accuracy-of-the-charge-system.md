# 21. Accuracy of the charge system

Status: accepted

## Context

A charge simulation is exact at its collocation points by construction, so the residual there says nothing about the discretization. The plan asked for a potential residual at check points below 0.3 percent at the default size, based on a prototype with a simpler geometry. The real model has thin shield wires, kinks at the towers and conductors a few metres apart.

## Decision

- Report two numbers with different meanings. The collocation residual checks the linear algebra and is tested to 1e-9 (measured at rounding level). The potential residual at check points measures the discretization.
- A check point sits on the conductor surface at every joint between two segments of one conductor, offset by the conductor radius perpendicular to the segment and to the vertical. The residual is the largest deviation of the basis potentials from their targets, in volts per volt, so 0.01 means 1 percent of the voltage of the excited conductor.
- Report the maximum by kind of joint: inside a span, at a tower, between run-outs. Inside the spans the default size gives 0.27 to 0.42 percent for the three towers. At the towers, where the conductor kinks, it gives up to 1.8 percent, and between run-outs up to 1.0 percent. The tests pin 0.6 percent inside the spans and 2.5 percent elsewhere, which leaves a margin of about 1.4 on each.
- Judge the accuracy of the result by the field, not by the surface potential: the convergence study compares peak E and B at mid-span between segment counts and against the 2D model (docs/physics.md, section 12). Twelve segments per span differ from 48 by 0.36 percent.

## Alternatives

- Keep the 0.3 percent target and tune the discretization until it holds. The deviation near the towers is a ripple of piecewise uniform density and does not shrink quickly with more segments, so a tuned discretization would only move the number.
- Measure at the segment midpoints. That reports the rounding error of the solver and hides the ripple.
- Report only the interior value. It would be favourable and incomplete.

## Consequences

- The README states the interior residual and the field-level discretization error, with the worst joint kinds named.
- A later change of the segment layout, for example shorter segments next to the towers, is measured with the same function and the same table.
