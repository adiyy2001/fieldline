# 17. Validation against a published reference

Status: accepted

## Context

The brief asks to compare against an openly published reference profile for a standard configuration if one exists, to cite it, and to say so if none exists. One exists: Bendík, Cenký and Eleschová, "Determination of Ground Clearance for EHV 400 kV Overhead Power Lines Based on Electromagnetic Field Limits", Electricity 2026, 7(2), 39, https://doi.org/10.3390/electricity7020039, licensed CC BY 4.0.

The paper models a 420 kV line carrying 2715 A per phase. Each phase is a bundle of three 30.2 mm subconductors with 0.4 m spacing, and the shield wires are 19.05 mm. A 2D mid-span model gives the field at 1.8 m above ground. For four tower types and 14 phase arrangements it reports the lowest clearance of the lowest subconductor at which E stays below 5 kV/m and B below 100 µT (its Tables 5 to 7).

## Decision

- The geometry from the paper's schematics and tables is stored as fixtures in the core, with the three subconductors of each bundle placed explicitly as in the paper. A bisection on the clearance with the project's own 2D model reproduces the limit heights for E and for B.
- The acceptance tolerance is 0.05 m on every limit height.
- A second run of each fixture replaces every bundle by its equivalent conductor and reports how far the limit heights move, which measures the error of the shortcut that the 3D model uses.
- A numpy prototype of the same equations agreed with all 26 values of the Danube, Barrel and Cat towers to within 0.03 m. The deviation is a consistent 0.01 to 0.03 m below the published numbers, so a tolerance of 0.05 m leaves little room and flags any real regression.
- The Portal tower is the exception. Its phase spacing cannot be read reliably from the schematic. With 12 m the model gives 13.54 m against 14.79 m published, and with 18 m it gives 14.77 m. The Portal values are therefore listed as fitted and are left out of the agreement statement.
- The tests also check that ranking by peak E at a fixed clearance orders the phase arrangements the way the published limit heights do, and that arrangements the paper reports as equal (BR-E and BR-F, DN-D and DN-F) come out equal.
- Only numbers are quoted from the paper, with a citation. No figures or text are reproduced, and CREDITS.md carries the attribution the licence asks for.

## Alternatives

- Inventing a reference profile. The brief forbids it.
- Comparing against a commercial or standard-tool result that is not openly published.
- Reproducing only one tower. Fourteen arrangements test geometry handling and phasing together.

## Consequences

- The README can state the agreement with a published study, with the numbers coming from a script and with the Portal caveat attached.
- The validation covers the 2D model. The 3D model is tied to the 2D one by the convergence study.
