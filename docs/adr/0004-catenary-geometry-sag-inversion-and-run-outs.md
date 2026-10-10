# 4. Catenary geometry, sag inversion and run-outs

Status: accepted

## Context

Conductors hang as catenaries and the user sets the sag. The brief writes y(x) = a·cosh((x - x0)/a) + c with a = H/w. Our x axis is lateral (ADR 3), so the line direction is z. The charge system describes a finite line, and charge piles up at the ends of an isolated finite conductor. That distorts the field near the outer towers, where a real line simply continues.

## Decision

- Height along a span: y(z) = y_low + a·(cosh((z - z_mid)/a) - 1), where y_low is the attachment height minus the sag and z_mid is the middle of the span.
- The input is the sag s of a level span of length L. The parameter a follows from a·(cosh(L/(2a)) - 1) = s by Newton's method, started at the parabola value a = L² / (8s) and stopped at a relative step of 1e-12. A sag of zero gives a straight conductor. The conductor length is 2a·sinh(L/(2a)). Reference case: L = 300 m and s = 10 m give a = 1126.6627 m and a length of 300.8871 m.
- A conductor starts at its attachment point at the tower, given by a lateral offset and a height that already include any insulator string. Shield wires have their own sag, by default 0.9 of the phase sag.
- Two or three spans, each with its own length and sag. All spans are level. A terrain slope is a stretch goal.
- Each span becomes 12 straight segments by default (4 to 24 selectable). The end points lie on the catenary and the steps are uniform in z.
- Beyond the outer towers every conductor continues with three straight horizontal run-out segments at the attachment height, with lengths of 0.5, 1 and 2 times the adjacent span, on both sides. They carry charge and current, so the outer spans see a continuing line.

## Alternatives

- The parabola y = y_low + 4s·(z - z_mid)²/L². It is close at small sag ratios, but evaluating a cosh costs nothing and the brief asks for the catenary.
- Horizontal tension H and weight per length w as inputs. They match the brief's formula but ask the user for numbers that are rarely known. Sag is the usual design quantity.
- Truncating the line at the outer towers. It is cheaper and wrong near the ends, and the ground heatmap shows the error.
- Whole extra spans beyond the towers. They add many unknowns for little gain over three run-out segments.

## Consequences

- In the prototype the ratio of the 3D to the 2D field at mid-span did not change in four digits when the run-outs were varied. The tests assert a relative change below 1e-3 at the middle of a three-span line. The run-outs matter near the outer towers and in the heatmap beyond the ends.
- A segment is a chord of a convex curve. With 12 segments on a 300 m span with 10 m sag a chord lies at most 7 cm above the curve at the lowest point. The convergence script shows the effect on the field.
- Segment endpoints are shared by neighbouring segments, so the conductor is continuous and the closed forms need no special treatment at joints.
