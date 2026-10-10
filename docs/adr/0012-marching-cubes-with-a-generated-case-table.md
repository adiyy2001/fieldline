# 12. Marching cubes with a generated case table

Status: accepted

## Context

The isosurface view extracts a surface of constant field magnitude from the 128 × 64 × 64 volume in a compute pass. Marching cubes needs a table with one entry per corner configuration, 256 in all. Pasting a published table gives no way to check it and leaves open where it came from. Cracks appear when two neighbouring cells triangulate their shared face differently.

## Decision

- The core generates the table in code. For every corner mask the generator finds the edges whose end points lie on different sides of the level. On each cube face it pairs the crossed edges. A face with four crossed edges is ambiguous, and the rule there is fixed: the inside corners are separated. Because the rule depends only on the four corner values of the face, both cells that share the face choose the same pairing, so the surface has no cracks.
- Pairings on the six faces link the crossed edges into closed cycles. Each cycle is turned into triangles by a fan from its first edge, wound so that the normal points towards lower values.
- The table is generated when the application starts, or in a build script, and uploaded to the GPU as a storage buffer.
- The compute pass counts triangles with an atomic counter, writes vertices to a storage buffer and fills the arguments of an indirect draw. Normals come from the gradient of the volume.
- Tests check, for all 256 cases, that every crossed edge belongs to exactly one cycle, that triangles are consistently oriented, and that neighbouring cells agree on shared faces. A sphere test compares the extracted area with 4πr².
- If these tests cannot be satisfied after one focused debugging pass, the pass switches to marching tetrahedra, which has no ambiguous cases, and the decision is recorded here.

## Alternatives

- A copied 256-entry table. It brings a provenance question and no guarantee of consistency.
- Marching tetrahedra from the start. It is simpler but emits about three times as many triangles for the same grid.
- Dual contouring or surface nets. They produce better meshes for sharp features, which a smooth field does not have.

## Consequences

- The table has a test suite of its own and can be explained in an interview from the generator code.
- A fan triangulation of a cycle with more than four edges can produce slightly skewed triangles. The view uses smooth normals from the field gradient, so this is not visible.
