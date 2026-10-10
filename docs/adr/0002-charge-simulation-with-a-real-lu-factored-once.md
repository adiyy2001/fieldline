# 2. Charge simulation with a real LU factored once

Status: accepted

## Context

The 3D electric field comes from the charge simulation method. Every conductor is cut into straight segments with a uniform line charge density. The unknown densities follow from forcing the potential at one collocation point per segment, the segment midpoint, to equal the conductor voltage. The potential of a finite segment and of its image below the ground plane has a closed form, so each matrix entry costs a few square roots and logarithms.

The brief suggests a dense complex LU factorization. The matrix of potential coefficients depends on geometry only, so it is real. Only the voltages are complex. For collocation the matrix is close to symmetric but not exactly, because the point on segment i and the charge on segment j do not swap roles once the singularity clamp is applied.

## Decision

- Assemble one real matrix in a Float64Array, with a row per collocation point and a column per segment, images included. Shield wire segments are equations with a right-hand side of 0 V.
- Factor it once with LU and partial pivoting, in place, and keep the factors until the geometry changes.
- Solve for one real right-hand side per phase conductor (1 V on that conductor, 0 V elsewhere). The result is a set of basis charge densities. Any voltage phasor set gives the charges as a complex linear combination of the basis, so a change of voltage, phase angle or phasing needs no new factorization and no complex matrix.
- The same basis serves the phasing optimizer: every arrangement is a linear combination of six stored basis fields.
- A bundle enters as one equivalent conductor with radius r_eq. That radius is also the radius used by the singularity clamp.
- The residual of the potential at check points, halfway between collocation points on the conductor surface, is reported with every solve and covered by a test.

## Alternatives

- Complex LU, as in the brief. It doubles the memory and needs about four times the arithmetic, and the real factors already serve both parts of a complex right-hand side.
- Cholesky. It needs a symmetric positive definite matrix. The 2D Maxwell matrix qualifies, the 3D collocation matrix does not exactly.
- An iterative solver such as GMRES. For a few hundred unknowns a direct solve is faster and has no convergence question.
- A Galerkin boundary element formulation. It gives a symmetric matrix and better accuracy per unknown, but it needs numerical integration over pairs of segments.

## Consequences

- Measured in Node 24.21 with float64: the factorization takes 2.2 ms at 150 unknowns, 6.3 ms at 210, 24 ms at 336, 68 ms at 480 and 226 ms at 720. Assembly with images, before any optimization, takes 19 ms at 210 and 49 ms at 336. A geometry change at the default size fits well inside the 200 ms target, and a change of voltage or phasing repeats only the cheap linear combination.
- The clamp (the distance to a segment axis never drops below the conductor radius) also covers the self term and collinear neighbours, so the assembly has no special cases.
- A discretization with 4 segments per span leaves a check point residual of 0.15 percent of the conductor voltage in the prototype. Six or more segments per span leave 0.07 to 0.09 percent.
