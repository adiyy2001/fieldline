struct Params {
  origin: vec3f,
  segmentCount: u32,
  step: vec3f,
  pointCount: u32,
  dims: vec3u,
  groundHeight: f32,
}

struct Accumulator {
  electricRe: vec3f,
  electricIm: vec3f,
  magneticRe: vec3f,
  magneticIm: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
@group(0) @binding(2) var<storage, read_write> fieldValues: array<f32>;

var<workgroup> tile: array<Segment, TILE_SIZE>;

fn addSegment(accumulator: ptr<function, Accumulator>, segment: Segment, position: vec3f) {
  let electric = electricShape(segment, position, params.groundHeight);
  let magnetic = magneticShape(segment, position);
  (*accumulator).electricRe += segment.chargeRe * electric;
  (*accumulator).electricIm += segment.chargeIm * electric;
  (*accumulator).magneticRe += segment.current.x * magnetic;
  (*accumulator).magneticIm += segment.current.y * magnetic;
}

fn accumulateField(position: vec3f, localIndex: u32, valid: bool) -> Accumulator {
  var accumulator = Accumulator(vec3f(0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0));
  let count = params.segmentCount;
  if (TILED) {
    let tileCount = (count + TILE_SIZE - 1u) / TILE_SIZE;
    for (var tileIndex = 0u; tileIndex < tileCount; tileIndex++) {
      let base = tileIndex * TILE_SIZE;
      for (var slot = localIndex; slot < TILE_SIZE; slot += WORKGROUP_SIZE) {
        if (base + slot < count) {
          tile[slot] = segments[base + slot];
        }
      }
      workgroupBarrier();
      if (valid) {
        let inTile = min(TILE_SIZE, count - base);
        for (var index = 0u; index < inTile; index++) {
          addSegment(&accumulator, tile[index], position);
        }
      }
      workgroupBarrier();
    }
  } else if (valid) {
    for (var index = 0u; index < count; index++) {
      addSegment(&accumulator, segments[index], position);
    }
  }
  return accumulator;
}

fn writeFieldValues(pointIndex: u32, accumulator: Accumulator) {
  let base = pointIndex * 12u;
  fieldValues[base] = accumulator.electricRe.x;
  fieldValues[base + 1u] = accumulator.electricRe.y;
  fieldValues[base + 2u] = accumulator.electricRe.z;
  fieldValues[base + 3u] = accumulator.electricIm.x;
  fieldValues[base + 4u] = accumulator.electricIm.y;
  fieldValues[base + 5u] = accumulator.electricIm.z;
  fieldValues[base + 6u] = accumulator.magneticRe.x;
  fieldValues[base + 7u] = accumulator.magneticRe.y;
  fieldValues[base + 8u] = accumulator.magneticRe.z;
  fieldValues[base + 9u] = accumulator.magneticIm.x;
  fieldValues[base + 10u] = accumulator.magneticIm.y;
  fieldValues[base + 11u] = accumulator.magneticIm.z;
}
