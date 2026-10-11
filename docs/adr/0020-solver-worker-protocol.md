# 20. Solver worker protocol

Status: accepted

## Context

The charge system is assembled, factored and solved in float64 off the main thread (ADR 2). The interface needs the segment data and the basis charges back, once per geometry change, and it needs the answer to a request it can match with the request that caused it, because a slider produces requests faster than the solver finishes them. The worker file itself cannot be unit tested without a browser, so the logic has to live somewhere that can.

## Decision

- `workers/protocol.ts` defines the messages: one request (`solve`, with the line parameters, a draft flag and a flag for the potential residual) and two answers (`solved` and `failed`). Every message carries `version: 1` and the request `id`. A message with another version is refused with a `failed` answer, so an old cached worker and a new page cannot misread each other.
- `workers/solver-handler.ts` is a pure function from a message and a clock to an answer. It validates the parameters with the same schema as the interface, runs `solveLine` and serializes the result. `workers/solver.worker.ts` only connects `message` events to it and transfers the buffers. That file is listed as a worker entry point in the coverage exclusions (ADR 15), and the handler is covered by its unit tests.
- The answer holds the charge system as typed arrays: the packed segments, the group, conductor and span of each segment, and the basis charges group after group in one array. `deserializeChargeSystem` rebuilds the evaluator side without a second solve. The five buffers are transferred, not copied.
- Draft requests use at most 8 segments per span while a slider moves (the adaptive quality rule: coarse while a slider moves, full once it stops). The answer states how many segments it used.
- Failures are values. Invalid parameters give the list of issues, and an exception inside the solver gives its message, both with the request id (or -1 when the message has none).
- The potential residual (ADR 21) is computed on request only, because it costs about as much as the assembly.

## Alternatives

- A message library such as Comlink. It adds a dependency for one request type.
- A `SharedArrayBuffer` for the result. It needs cross-origin isolation headers, which GitHub Pages cannot send.
- Solving on the main thread. A 336-unknown solve takes tens of milliseconds, which is a dropped frame at every slider step.

## Consequences

- The application can drop answers whose id is older than the latest request without any extra state in the worker.
- A change to the message shape means a new version number and a handler branch, and the tests pin the refusal of other versions.
- The worker bundle is built by Angular's `webWorkerTsConfig`, which a throwaway worker verified before the application used it.
