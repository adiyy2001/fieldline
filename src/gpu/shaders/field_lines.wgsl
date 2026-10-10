struct TraceParams {
  boxMin: vec4f,
  boxMax: vec4f,
  phase: vec4f,
  counts: vec4u,
}

struct Seed {
  origin: vec4f,
  outward: vec4f,
}

@group(0) @binding(0) var<uniform> params: TraceParams;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
@group(0) @binding(2) var<storage, read> seeds: array<Seed>;
@group(0) @binding(3) var<storage, read_write> points: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> magnitudes: array<f32>;
@group(0) @binding(5) var<storage, read_write> info: array<vec2u>;

var<workgroup> sums: array<vec4f, LINE_WORKGROUP>;

const SQRT2: f32 = 1.41421356;
const STOP_RATIO: f32 = 1.15;
const STEP_FRACTION: f32 = 0.4;
const MINIMUM_STEP: f32 = 0.05;
const MAXIMUM_STEP: f32 = 1.5;
const VANISHING_FIELD: f32 = 1e-9;
const END_RUNNING: u32 = 0u;
const END_GROUND: u32 = 1u;
const END_CONDUCTOR: u32 = 2u;
const END_DOMAIN: u32 = 3u;
const END_STALLED: u32 = 4u;

fn reduceSum(value: vec4f, lid: u32) -> vec4f {
  sums[lid] = value;
  workgroupBarrier();
  for (var stride = LINE_WORKGROUP / 2u; stride > 0u; stride = stride >> 1u) {
    if (lid < stride) {
      sums[lid] = sums[lid] + sums[lid + stride];
    }
    workgroupBarrier();
  }
  let total = sums[0];
  workgroupBarrier();
  return total;
}

fn reduceMinimum(value: vec4f, lid: u32) -> vec4f {
  sums[lid] = value;
  workgroupBarrier();
  for (var stride = LINE_WORKGROUP / 2u; stride > 0u; stride = stride >> 1u) {
    if (lid < stride) {
      sums[lid] = min(sums[lid], sums[lid + stride]);
    }
    workgroupBarrier();
  }
  let total = sums[0];
  workgroupBarrier();
  return total;
}

fn fieldAt(position: vec3f, lid: u32) -> vec3f {
  let electric = params.counts.w == 0u;
  var partial = vec3f(0.0);
  for (var index = lid; index < params.counts.x; index += LINE_WORKGROUP) {
    let segment = segments[index];
    if (electric) {
      let weight = SQRT2 * (segment.chargeRe * params.phase.x - segment.chargeIm * params.phase.y);
      partial += weight * electricShape(segment, position, params.boxMin.w);
    } else {
      let weight = SQRT2 * (segment.current.x * params.phase.x - segment.current.y * params.phase.y);
      partial += weight * magneticShape(segment, position);
    }
  }
  return reduceSum(vec4f(partial, 0.0), lid).xyz;
}

fn clearanceAt(position: vec3f, lid: u32) -> vec2f {
  var nearest = 1e30;
  var clearance = 1e30;
  for (var index = lid; index < params.counts.x; index += LINE_WORKGROUP) {
    let segment = segments[index];
    let span = segment.end - segment.start;
    let extent = length(span);
    let direction = span / extent;
    let offset = position - segment.start;
    let along = clamp(dot(offset, direction), 0.0, extent);
    let distance = length(offset - along * direction);
    nearest = min(nearest, distance);
    clearance = min(clearance, distance - STOP_RATIO * segment.current.z);
  }
  return reduceMinimum(vec4f(nearest, clearance, 0.0, 0.0), lid).xy;
}

fn unitDirection(vector: vec3f, direction: f32) -> vec3f {
  let magnitude = length(vector);
  if (magnitude < VANISHING_FIELD) {
    return vec3f(0.0);
  }
  return direction * vector / magnitude;
}

fn insideBox(position: vec3f) -> bool {
  return all(position >= params.boxMin.xyz) && all(position <= params.boxMax.xyz);
}

@compute @workgroup_size(LINE_WORKGROUP)
fn traceMain(
  @builtin(workgroup_id) group: vec3u,
  @builtin(local_invocation_index) lid: u32,
) {
  let line = group.x;
  let stepCount = params.counts.y;
  let stride = stepCount + 1u;
  let base = line * stride;
  let seed = seeds[line];
  let electric = params.counts.w == 0u;
  let displayScale = params.phase.z;
  let groundHeight = params.boxMin.w;
  var point = seed.origin.xyz;
  let initial = fieldAt(point, lid);
  var direction = 1.0;
  if (electric) {
    direction = select(-1.0, 1.0, dot(initial, seed.outward.xyz) >= 0.0);
  }
  var arc = 0.0;
  var recorded = 1u;
  var ending = END_RUNNING;
  var lastMagnitude = length(initial) * displayScale;
  if (lid == 0u) {
    points[base] = vec4f(point, 0.0);
    magnitudes[base] = lastMagnitude;
  }
  for (var step = 0u; step < stepCount; step++) {
    let near = clearanceAt(point, lid);
    let raw = fieldAt(point, lid);
    let k1 = unitDirection(raw, direction);
    let stepLength = select(
      seed.origin.w / f32(stepCount),
      clamp(STEP_FRACTION * near.x, MINIMUM_STEP, MAXIMUM_STEP),
      electric,
    );
    let k2 = unitDirection(fieldAt(point + k1 * (0.5 * stepLength), lid), direction);
    let k3 = unitDirection(fieldAt(point + k2 * (0.5 * stepLength), lid), direction);
    let k4 = unitDirection(fieldAt(point + k3 * stepLength, lid), direction);
    if (ending == END_RUNNING) {
      if (near.y < 0.0) {
        ending = END_CONDUCTOR;
      } else {
        lastMagnitude = length(raw) * displayScale;
        if (lid == 0u) {
          magnitudes[base + recorded - 1u] = lastMagnitude;
        }
        if (length(k1) == 0.0) {
          ending = END_STALLED;
        } else {
          var next = point + (stepLength / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
          var travelled = length(next - point);
          var advance = true;
          if (electric && next.y <= groundHeight) {
            let fraction = (point.y - groundHeight) / (point.y - next.y);
            next = vec3f(
              point.x + fraction * (next.x - point.x),
              groundHeight,
              point.z + fraction * (next.z - point.z),
            );
            travelled = travelled * fraction;
            ending = END_GROUND;
          } else if (!insideBox(next)) {
            ending = END_DOMAIN;
            advance = false;
          }
          if (advance) {
            arc += travelled;
            point = next;
            if (lid == 0u) {
              points[base + recorded] = vec4f(point, arc);
              magnitudes[base + recorded] = lastMagnitude;
            }
            recorded += 1u;
          }
        }
      }
    }
  }
  for (var index = recorded + lid; index <= stepCount; index += LINE_WORKGROUP) {
    points[base + index] = vec4f(point, arc);
    magnitudes[base + index] = lastMagnitude;
  }
  if (lid == 0u) {
    info[line] = vec2u(recorded, ending);
  }
}
