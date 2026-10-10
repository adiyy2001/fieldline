# Physics of fieldline

This file derives every equation the field model uses and points each one at the test that checks it. Part 1 covers conventions, phasors, the 2D cross-section model, exposure levels and the phasing optimizer. Later parts add the 3D charge simulation and the GPU evaluation.

Test paths are relative to `src/core`. A test is named by the file and the wording of its `it(...)` description.

## 1. Conventions

### Coordinates and units

The x axis points sideways across the line, y points up and z runs along the line. The ground is the plane y = 0. All values in the core are SI: metres, volts, amperes, tesla, volts per metre. The interface converts to kV/m and µT for display.

Constants are the CODATA 2022 values:

$$\varepsilon_0 = 8.8541878188 \times 10^{-12}\ \text{F/m}, \qquad \mu_0 = 1.25663706127 \times 10^{-6}\ \text{N/A}^2$$

Check: `constants.spec.ts`, "uses the CODATA 2022 values", plus the derived values of the Coulomb constant (8987.55 V·m per µC) and of μ0/4π (9.99999999868e-8).

### Phasors

The model is quasi-static at one angular frequency ω = 2π·50 Hz. At 50 Hz the wavelength is 6000 km, so the electric field follows the charges at each instant and the magnetic field follows the currents at each instant (ADR 19).

A sinusoidal quantity is the real part of a rotating complex number. A phasor F holds its rms value and its phase, and the instantaneous value at the angle θ = ωt is

$$f(\theta) = \sqrt{2}\,\mathrm{Re}\left[F e^{j\theta}\right]$$

The three phase voltages are the line to line voltage divided by √3, at 0, -120 and +120 degrees:

$$V_a = \frac{V_{LL}}{\sqrt{3}}, \qquad V_b = V_a e^{-j2\pi/3}, \qquad V_c = V_a e^{+j2\pi/3}$$

The three sum to zero. A current of magnitude I at power factor angle φ (lagging) has the angle of its phase voltage minus φ:

$$I_k = I\, e^{\,j(\theta_k - \varphi)}$$

Checks: `phasor.spec.ts`, "gives phase voltages of V_LL over root three at 0, -120 and +120 degrees", "subtracts the power factor angle from the voltage angle for a lagging current", "sums the three voltages to zero".

### Resultant rms value

At a point, E and B are vectors of three complex phasors (F_x, F_y, F_z). The instantaneous vector is f_k(θ) = √2 Re[F_k e^{jθ}]. Write z = F_k e^{jθ}. Then

$$f_k^2 = \tfrac{1}{2}(z + \bar z)^2 = |F_k|^2 + \mathrm{Re}\left[F_k^2 e^{2j\theta}\right]$$

The second term averages to zero over a cycle, so the mean square of the vector magnitude is the sum of the squared phasor magnitudes. The resultant rms value is

$$F_{rms} = \sqrt{\sum_k |F_k|^2}$$

This is the value that reference levels apply to. Check: `phasor.spec.ts`, "uses the root of the summed squared magnitudes as the resultant rms" and "gives a mean square over the cycle equal to the squared rms".

Summing over the three components gives the magnitude over the cycle:

$$|f(\theta)|^2 = N + \mathrm{Re}\left[S\, e^{2j\theta}\right], \qquad N = \sum_k |F_k|^2, \quad S = \sum_k F_k^2$$

The vector traces an ellipse. Its semi-major axis is √(N + |S|) and its semi-minor axis is √(N − |S|). The ellipse is a line when the components are in phase, and a circle when S = 0. In a circle the magnitude stays constant over the cycle. Checks: `phasor.spec.ts`, "collapses to a line for a linearly polarized phasor", "is a circle for equal quadrature components", "matches the maximum of the instantaneous magnitude over the cycle", "keeps the magnitude of a circularly polarized field constant over the cycle".

The instantaneous view in the application shows f(θ) at a chosen θ. Check: "evaluates the real part at omega t of 0 and 90 degrees by hand".

## 2. The 2D cross-section model

At mid-span a conductor is far from the towers compared with its height above ground. The 2D model replaces it with an infinite straight line at the mid-span height. Each conductor becomes a point (x_i, y_i) in the cross-section with radius r_i, carrying a line charge q_i per metre and a current I_i. The ground is a perfect conductor at zero potential.

### Potential of a line charge and its image

A line charge q in free space gives a potential φ(ρ) = −q/(2πε0)·ln ρ plus a constant, where ρ is the distance from the line. This follows from Gauss's law: the field is radial with magnitude q/(2πε0 ρ), and the potential is minus its integral.

A perfect conductor at y = 0 sets φ = 0 on that plane. An image charge −q at (x_c, −y_c) does this: every point of the plane is equally far from the charge and from its image, so the two logarithms cancel. With D the distance to the charge and D' the distance to the image,

$$\varphi(x, y) = \frac{q}{2\pi\varepsilon_0}\,\ln\frac{D'}{D}$$

Check: `field2d/field.spec.ts`, "holds the conductor voltage on its surface and zero on the ground", "matches the analytic field and potential at scattered points". The scattered points test compares the model with the closed form in `validation/analytic.ts`.

### Maxwell potential coefficients

With n conductors the potential at conductor i is the sum of the contributions of all charges and their images:

$$V_i = \sum_j P_{ij}\, q_j$$

On its own surface (distance r_i from its axis) conductor i sees its image at distance 2h_i. Between two conductors the distance D_ij is measured to the other axis and D'_ij to its image:

$$P_{ii} = \frac{1}{2\pi\varepsilon_0}\ln\frac{2h_i}{r_i}, \qquad P_{ij} = \frac{1}{2\pi\varepsilon_0}\ln\frac{D'_{ij}}{D_{ij}}$$

The matrix is real and symmetric. The conductors are at their phase voltages and the shield wires at 0 V, so the charges follow from

$$Q = P^{-1} V$$

Checks: `field2d/solver.spec.ts`, "uses ln(2h/r) for the self term", "uses ln(D prime over D) for the mutual term and is symmetric", "assembles a symmetric matrix with positive entries". `field2d/field.spec.ts`, "reproduces each phase voltage at its conductor and zero at the shield wires" and "induces charge on the shield wires of the opposite sign to the nearest phase".

One factorization of P is enough for every voltage set. Because P is real, the solve runs once per phase group with a unit voltage, and the charges for any complex voltage set are the linear combination Q = Σ_g V_g Q_g (ADR 2). Checks: `field2d/solver.spec.ts`, "combines basis charges linearly into complex charges"; `field2d/field.spec.ts`, "is linear in the voltage phasors"; `linear/lu.spec.ts` for the solver itself.

Two wires closer than the larger of their radii would give a logarithm of a number below one or a singular matrix, so the distance is clamped to the larger radius. Check: `field2d/solver.spec.ts`, "clamps the distance of overlapping wires to the larger radius".

### Bundle equivalent radius

A bundle has n subconductors of radius r on a circle of radius A, with spacing a between neighbours. Elementary geometry of the regular polygon gives

$$A = \frac{a}{2\sin(\pi/n)}$$

Treat the bundle as one conductor with total charge Q, so each subconductor carries q = Q/n. The subconductors are close to each other compared with their height, so the image of every subconductor is at about the same distance 2h. At subconductor 1 the potential is

$$V = \frac{q}{2\pi\varepsilon_0}\left[\ln\frac{2h}{r} + \sum_{k=2}^{n}\ln\frac{2h}{d_{1k}}\right] = \frac{q}{2\pi\varepsilon_0}\left[n\ln(2h) - \ln\left(r\prod_{k=2}^{n} d_{1k}\right)\right]$$

where d_1k are the distances from subconductor 1 to the others. For a regular n-gon with circumradius A, the product of the distances from one vertex to the other n − 1 vertices is n·A^{n−1}. This is the modulus of the derivative of z^n − A^n at a root. Then

$$V = \frac{nq}{2\pi\varepsilon_0}\ln\frac{2h}{\left(n\, r\, A^{n-1}\right)^{1/n}} = \frac{Q}{2\pi\varepsilon_0}\ln\frac{2h}{r_{eq}}, \qquad r_{eq} = \left(n\, r\, A^{n-1}\right)^{1/n}$$

For three 30.2 mm subconductors with 0.4 m spacing, r_eq = 0.1342 m. Checks: `geometry/bundle.spec.ts`, "gives the equivalent radius of three 30.2 mm subconductors at 0.4 m", "returns the subconductor radius for a single conductor", "matches the closed form for two subconductors".

The derivation assumes equal image distances. The 2D model can also keep the subconductors as separate wires, which drops that assumption. `field2d/field.spec.ts`, "agrees between explicit subconductors and the equivalent conductor within a few percent", checks the two options against each other. On the published towers the limit heights move by at most 0.009 m (see section 5).

### Electric field of a line charge

The field is E = −∇φ. For the charge q at p = (x_c, y_c) and its image at p' = (x_c, −y_c), at the point r:

$$\mathbf{E}(\mathbf{r}) = \frac{q}{2\pi\varepsilon_0}\left[\frac{\mathbf{r}-\mathbf{p}}{|\mathbf{r}-\mathbf{p}|^2} - \frac{\mathbf{r}-\mathbf{p}'}{|\mathbf{r}-\mathbf{p}'|^2}\right]$$

At the ground (y = 0) both terms have the same x component, which cancels, and the y components add. The field there is purely vertical. Check: `field2d/field.spec.ts`, "has no tangential field at the ground plane".

One conductor of 230.94 kV (400 kV line to line) at 12 m with a 15 mm radius carries q = 1.7414 µC/m. The vertical field below it is 5.2170 kV/m at the ground and 5.2535 kV/m at 1 m. Check: "reproduces the line charge of 1.7414 microcoulombs per metre" and "gives 5.2170 kV/m at the ground and 5.2535 kV/m at 1 m below the conductor".

Inside a conductor the true field is zero, so the formula does not apply there. Evaluation points that fall inside a wire get a clamp instead: the distance squared in the denominator is replaced by max(d², r²). The field then grows linearly with d up to the surface and stays finite and continuous. Checks: `field2d/field.spec.ts`, "stays finite and continuous across the conductor radius", "keeps the potential bounded inside the radius".

### Magnetic field of a long conductor

Ampère's law for an infinite straight conductor carrying I along +z gives a field that circles the conductor with magnitude

$$B = \frac{\mu_0 I}{2\pi d}$$

In vector form, for a conductor at p, with the right hand rule:

$$\mathbf{B}(\mathbf{r}) = \frac{\mu_0 I}{2\pi\,|\mathbf{r}-\mathbf{p}|^2}\,\bigl(-(y - y_p),\; x - x_p,\; 0\bigr)$$

The soil is non-magnetic, so the ground has no image for B. 1000 A at 10 m gives 20.0 µT. Checks: `field2d/field.spec.ts`, "matches mu0 I over 2 pi r, 20 microtesla at 10 m for 1000 A", "follows the right hand rule for a current along +z", "clamps the magnetic field inside the radius as well". A bundle splits its current equally between the subconductors: `field2d/solver.spec.ts`, "splits the phase current equally between the subconductors and gives shields none".

### Why earth return is ignored

Balanced phase currents sum to zero, so no net current returns through the earth. An unbalanced remainder does. Deri, Tevan, Semlyen and Castanheira ("The complex ground return plane: a simplified model for homogeneous and multi-layer earth return", IEEE Transactions on Power Apparatus and Systems, PAS-100(8), 1981, pp. 3686 to 3693, doi 10.1109/TPAS.1981.317011) replace the ground return with a mirror plane at the complex depth

$$p = \sqrt{\frac{\rho}{j\omega\mu_0}}, \qquad |p| = \sqrt{\frac{\rho}{\omega\mu_0}}$$

For ρ = 100 Ω·m at 50 Hz, |p| is 503 m. The image of a conductor at height h lies at h + 2p below ground, so about 1 km away in magnitude. A return current of 1000 A, which is the full phase current and an upper bound, gives at the ground

$$B \approx \frac{\mu_0 \cdot 1000\ \text{A}}{2\pi \cdot 1000\ \text{m}} = 0.2\ \mu\text{T}$$

Compare that with 20 µT from one phase conductor at 10 m. A realistic unbalance is a few percent of the phase current, so the neglected field is a few hundredths of a microtesla. Check: `validation/validation.spec.ts`, "gives a complex penetration depth of about 500 m for 100 ohm metres at 50 Hz" and "puts the image of a return current about one kilometre below the line".

Currents induced in grounded shield wires oppose the flux of the phase currents, so leaving them out errs on the high side. ADR 19 lists the other omitted effects.

## 3. Exposure levels

Reference levels apply to the resultant rms value at the evaluation height, calculated without a person present. The application is a visualization and teaching tool and makes no compliance statement. The magnetic level of a regulation that states the field strength H is converted with B = μ0·H.

| Preset                                             | E at 50 Hz | B at 50 Hz           | Source                                                                                                                                               |
| -------------------------------------------------- | ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| ICNIRP 2010, general public (default)              | 5 kV/m     | 200 µT (H = 160 A/m) | ICNIRP, Guidelines for limiting exposure to time-varying electric and magnetic fields (1 Hz to 100 kHz), Health Physics 99(6):818-836, 2010, Table 4 |
| ICNIRP 1998 and Council Recommendation 1999/519/EC | 5 kV/m     | 100 µT               | ICNIRP, Health Physics 74(4):494-522, 1998, Table 7                                                                                                  |
| Poland, places accessible to the public            | 10 kV/m    | 75.4 µT (H = 60 A/m) | Regulation of the Minister of Health of 17 December 2019, Dz.U. 2019 poz. 2448, Table 2                                                              |
| Poland, residential development areas              | 1 kV/m     | 75.4 µT (H = 60 A/m) | Same regulation, Table 1                                                                                                                             |

Users can add custom levels with a value, a unit and a label. Checks: `exposure/levels.spec.ts`, "pins the ICNIRP 2010 general public levels as the default", "pins the 1998 and national presets", "converts a field strength to a flux density with mu0", "creates custom levels in SI from displayed units".

## 4. The phasing optimizer

A double circuit with the phases stacked vertically has six conductor positions. Each circuit takes one of the six orderings of the phases, which gives 36 arrangements.

### Symmetry classes

Relabeling the phases the same way on both circuits does not change the rms fields:

- A cyclic relabeling multiplies every voltage and current phasor by the same unit complex number e^{±j2π/3}. The fields are linear in the phasors, so they pick up the same factor, and the rms values are unchanged.
- Swapping two phases turns the set (V_a, V_b, V_c) into its complex conjugate, because V_c = conj(V_b). The charges follow by Q = P⁻¹V with P real, so the conjugate voltages give conjugate charges and conjugate E. The currents are conjugate up to a common phase factor that depends on φ, and a common factor does not change an rms value. B is conjugate up to that factor, and its rms value is unchanged.

So the 36 arrangements fall into 6 classes of 6 members. Each class has a representative with the left circuit in the order A, B, C from top to bottom, and the invariant of an arrangement is τ = left⁻¹∘right. The left-right mirror image of an arrangement belongs to the class of the inverse permutation. The two classes built from cyclic permutations are each other's mirror images, with equal peak values and mirrored profiles. The other four classes are their own mirror images. Checks: `optimizer/arrangements.spec.ts`, "falls into six classes of six members each", "keeps the class under a relabeling of the phases on both circuits", "maps the mirror image to the inverse permutation", "has two mirror classes built from the cyclic permutations and four self mirrored ones"; `optimizer/evaluate.spec.ts`, "gives the same metrics to all members of a class", "gives a mirrored profile for the two cyclic classes and equal peaks".

### Evaluation from basis fields

By linearity the field of any arrangement is a combination of the fields of the six conductors at unit voltage and unit current. The optimizer computes those basis fields once at the profile points and forms one complex linear combination per arrangement. Check: `field2d/basis-source.spec.ts`, "recombines into the direct evaluation for any phasing"; `optimizer/evaluate.spec.ts`, "matches a direct evaluation of the field for the peak values".

Ranking uses the peak resultant rms value at the evaluation height and the value at a chosen lateral distance, taking the larger of the two sides. Check: `optimizer/ranking.spec.ts`; `optimizer/evaluate.spec.ts`, "reports the larger side for the value at a distance".

### Why the best arrangement cancels better

For a group of conductors seen from a distance R much larger than their size, expand ln|R − r_j| around the group centre. The lowest term that does not vanish dominates.

Magnetic field. The vector potential of the currents I_j at positions r_j = (x_j, y_j) is A_z = −μ0/(2π)·Σ I_j ln|R − r_j|. Balanced currents have Σ I_j = 0, so the monopole term drops out. The next term gives

$$A_z \approx \frac{\mu_0}{2\pi}\,\frac{\mathbf{m}\cdot\mathbf{R}}{R^2}, \qquad \mathbf{m} = \sum_j I_j \mathbf{r}_j$$

The field is B = (∂A_z/∂y, −∂A_z/∂x). The gradient of (m·R)/R² is (m − 2(m·R̂)R̂)/R². This is the vector m reflected in the line perpendicular to R, so it has the same length. Applying this to the real and imaginary parts of m gives

$$B_{rms} \approx \frac{\mu_0}{2\pi R^2}\sqrt{|m_x|^2 + |m_y|^2}, \qquad m_x = \sum_j I_j x_j,\quad m_y = \sum_j I_j y_j$$

The far magnetic field of an arrangement is proportional to its moment |Σ I_j r_j|. Two conductors at the same height with phases 120 degrees apart partly cancel in this sum. Check: `optimizer/evaluate.spec.ts`, "orders the far magnetic field like the dipole moment".

Electric field. A conductor with charge q at height y_c and its image −q form a dipole whose potential at a distant point is (q/(2πε0))·(2 y_c sinθ)/R. The ground image removes the monopole term whatever the sum of the charges is, so the dominant term is the vertical moment Σ q_j y_j. The optimizer takes the charges per volt of each conductor from the basis solve and reports |Σ V_g·dipolePerVolt_g|.

The explanation text for the best and the worst arrangement is generated from these two moments, their ratio, and the number of heights at which the two circuits carry different phases. Checks: `optimizer/explanation.spec.ts`, "counts the levels where the two circuits carry different phases", "builds the sentences from the numbers", "omits the mirror sentence for a self mirrored best arrangement". The explanation covers what the moments show. It says nothing about tower mechanics or insulation distances.

## 5. Validation of the 2D model

`pnpm validate:physics` prints the report and writes `bench/results/physics-validation.json` together with the plots below.

### Analytic cases

One conductor above ground: charge, field at the ground and at 1 m, and the field and the potential at 168 scattered points agree with the closed form to rounding error (relative error below 1e-15). B of 1000 A at 10 m agrees with μ0·I/(2πr) to 1e-10.

![One conductor above ground: model against the analytic solution](img/validation-single-conductor.svg)

### Published reference

Bendík, Cenký and Eleschová, "Determination of Ground Clearance for EHV 400 kV Overhead Power Lines Based on Electromagnetic Field Limits", Electricity 2026, 7(2), 39, https://doi.org/10.3390/electricity7020039 (CC BY 4.0), tabulate the lowest ground clearance at which the field at 1.8 m height stays below the limit for 14 tower and phasing cases. The E limit is 5 kV/m and the B limit is 100 µT. The model reproduces the 13 cases with readable geometry 0.014 to 0.028 m below the published limit heights (maximum 0.028 m, mean 0.022 m, tolerance 0.05 m). The Portal tower is the exception: its phase spacing cannot be read reliably from the schematic, so its value is listed as fitted and left out of the agreement statement. ADR 17 records the reasoning.

Checks: `validation/validation.spec.ts`, "reproduces every limit height within 0.05 m", "lists the Portal tower as fitted and leaves it out of the agreement statistics", "gives equal limit heights where the paper lists equal ones", "orders the arrangements by peak E like the published limit heights", "reproduces the best against worst reduction of the Barrel tower".

![Limit heights, reproduced against published](img/validation-published-limit-heights.svg)

### Equivalent conductor against explicit subconductors

Replacing each bundle by its equivalent conductor moves the limit heights by at most 0.009 m.

![Equivalent conductor against explicit subconductors](img/validation-bundle-equivalent.svg)

The deviation of 0.01 to 0.03 m below the published values has the same sign in every case. Its cause was not isolated.
