# 11. Exposure levels and presets

Status: accepted

## Context

The brief asks for contours at configurable reference levels, with the ICNIRP 2010 general public levels at 50 Hz as the default after checking them in the primary source. Users can add custom levels such as national limits.

## Decision

- Default preset: ICNIRP 2010, general public, unperturbed rms values at 50 Hz. The guidelines give 5 kV/m for the electric field and 200 µT for the magnetic flux density (H = 160 A/m). Source: ICNIRP, Guidelines for limiting exposure to time-varying electric and magnetic fields (1 Hz to 100 kHz), Health Physics 99(6):818-836, 2010, Table 4.
- Further presets in the interface:

| Preset | E at 50 Hz | B at 50 Hz | Source |
| --- | --- | --- | --- |
| ICNIRP 1998 and Council Recommendation 1999/519/EC | 5 kV/m | 100 µT | ICNIRP, Health Physics 74(4):494-522, 1998, Table 7 |
| Poland, places accessible to the public | 10 kV/m | 75.4 µT (H = 60 A/m) | Regulation of the Minister of Health of 17 December 2019, Dz.U. 2019 poz. 2448, Table 2 |
| Poland, residential development areas | 1 kV/m | 75.4 µT (H = 60 A/m) | Same regulation, Table 1 |

- Where a regulation states H, the preset converts it with B = μ0·H.
- Users add custom levels with a value, a unit and a label. Every level gets a distinct dash pattern and a text label next to its contour, so colour is never the only signal.
- The levels apply to the resultant rms value at the evaluation height, calculated without a person present. The application is a visualization and a teaching tool. It makes no compliance statement.

## Alternatives

- A single hard-coded limit. The 2010 and 1998 values differ by a factor of two for B, and national limits differ more.
- Occupational limits from Directive 2013/35/EU. They concern workers and are outside the brief.

## Consequences

- Each preset names its source in the interface and in docs/physics.md.
- The Polish magnetic limit is stated as a field strength, so its flux density equivalent depends on μ0 in air, which the preset records.
- Adding a preset is a data change in the core with a test that pins the numbers.
