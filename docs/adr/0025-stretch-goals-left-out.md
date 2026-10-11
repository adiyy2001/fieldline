# 25. Stretch goals left out

Status: accepted

## Context

The brief lists three stretch items: Deri's complex image depth for earth return currents, terrain with a slope, and two parallel lines sharing a corridor. Its rule is to cut stretch goals when scope grows, and never tests or correctness. Every must-have works in the production build and the targets were measured, so the question is whether any stretch item protects a must-have.

## Decision

- None of the three is built.
- Earth return is covered by ADR 19. The 50 Hz argument and a tested estimate of the return current depth are in the documentation, and balanced currents leave no net return. An unbalanced line would need the complex image, and the README says so.
- A line is already a list of conductors and segments, so a second parallel line is mostly a matter of offsets and a larger charge system. It would also grow the system past the few hundred unknowns the brief asks for and change the solve time, so it needs its own measurements.
- Terrain with a slope breaks the perfect ground plane that the image method relies on. It is a different model, not an extension.

## Alternatives

- Build the corridor first, as the plan suggested. It adds features without making any existing claim more true.
- Build a rough version of each. Half-validated physics in a project built around checkable numbers does the opposite of what it is for.

## Consequences

- The limits section of the README names all three as next steps. The model, the optimizer and the benchmarks describe one line only.
