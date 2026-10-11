# 24. Dash phase of the GPU contours follows the dominant axis

Status: accepted

## Context

The heatmap fragment shader draws each contour level with a dash pattern, so colour is never the only way to tell the levels apart. A fragment shader does not know the arc length of a contour. The first version took the dash coordinate as the dot product of the pixel position with the tangent, and the tangent came from the screen space derivatives of the field value. Derivatives are constant over a 2 by 2 quad and noisy where the field is steep, so neighbouring quads got different phases and the dashes broke into specks on the sides of closed contours.

## Decision

- The dash coordinate is the pixel x position where the contour runs mostly along x, and the pixel y position where it runs mostly along y. The choice depends only on which derivative of the field value is larger.
- The dash period is therefore measured in pixels along an axis. A contour at 45 degrees shows dashes about 1.4 times longer than a horizontal one, and the phase jumps once where the choice flips.
- A Playwright test counts connected stroke fragments smaller than 8 pixels in a readback with contours and fails above a threshold. The old rule gave 146 such fragments on the high voltage scene and the new rule gives 100.

## Alternatives

- Compute arc length on the CPU with marching squares and upload it. The CPU fallback does this, but on the GPU path it would add a pass and a buffer for a cosmetic property.
- Smooth the derivative over a larger neighbourhood. It costs more samples per pixel and still has no exact arc length.
- Drop dashes and separate the levels by colour. That fails the rule that colour is never the only signal.

## Consequences

- Dashes on the GPU path are regular on curved contours. Their length varies by up to 1.4 between orientations, which is visible only when two contours of one level meet at different angles.
- The readback used by the visual baselines does not draw contours by default. The `contours` flag of `captureFrame` turns them on for this test.
