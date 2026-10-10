# 5. Phasing optimizer: symmetry classes and a moment explanation

Status: accepted

## Context

A double circuit with the phases stacked vertically has six conductor positions: top, middle and bottom on the left, and the same on the right. Giving each circuit one of the six orderings of the three phases yields 6 × 6 = 36 arrangements. The brief asks to rank them, to show the best against the worst and to explain why the best one cancels better.

## Decision

- Relabeling the phases the same way on both circuits changes the arrangement but leaves the rms fields alone. A cyclic relabeling shifts the time origin by 120 degrees. A swap of two phases reverses the rotation sense, which conjugates every phasor. In both cases the rms magnitudes of E and B stay the same at every point. The 36 arrangements fall into 6 classes of 6 members, and each class has a representative with the left circuit in the order 1, 2, 3 from top to bottom.
- The left-right mirror image of an arrangement lies in the class of the inverse permutation. The two classes built from cyclic permutations are mirror images of each other. The remaining four classes are their own mirror image. The optimizer shows 6 rows and marks the mirror pair, which has equal peak values and mirrored profiles.
- Evaluation uses the basis fields of ADR 2: the field of each of the six conductors at unit voltage and at unit current, computed once at the profile points, then one complex linear combination per arrangement. All 36 arrangements are evaluated in the tests, which check that the members of a class agree to rounding.
- Ranking criteria: the peak resultant rms value at the chosen height (E and B separately) and the value at a chosen lateral distance, taking the larger of the two sides. The default distance is 30 m.
- Explanation: the far field of a group of conductors is dominated by the lowest multipole that does not vanish. For currents that sum to zero this is the magnetic dipole term. Its size follows from the moment Σ I_j·r_j, where r_j = (x_j, y_j) is the position of conductor j and the two components are complex phasors, taken as √(|Σ I_j·x_j|² + |Σ I_j·y_j|²). For the electric field with the ground image the dipole is vertical, with the moment |Σ q_j·y_j|. The optimizer reports both moments for the best and the worst arrangement, their ratio, and which conductors at the same height carry phases that are 120 degrees apart. The wording is generated from these numbers.

## Alternatives

- Show all 36 rows. The numbers repeat inside a class, so 30 of the rows carry no information.
- Search continuous parameters as well, such as spacing and heights. It is outside the brief and needs an objective that engineers would dispute.
- A genetic or other heuristic search. The space has 36 points.

## Consequences

- The same code ranks arrangements in the 2D and the 3D model, as long as both provide basis fields.
- A published study of tower configurations can be used as a check: ranking by peak E at a fixed height must order the configurations the way the study's limit heights do (ADR 17).
- The explanation covers what the moments show. It says nothing about tower mechanics or insulation distances.
