struct PackParams {
  dims: vec4u,
  selection: vec4u,
  phase: vec4f,
}

@group(0) @binding(0) var<uniform> params: PackParams;
@group(0) @binding(1) var<storage, read> fieldValues: array<f32>;
@group(0) @binding(2) var<storage, read_write> magnitudes: array<f32>;
@group(0) @binding(3) var volume: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var<storage, read_write> maxima: array<atomic<u32>, 2>;

const SQRT2: f32 = 1.41421356;

fn magnitudeAt(index: u32, offset: u32, instantaneous: bool) -> f32 {
  let base = index * 12u + offset;
  var sum = 0.0;
  for (var axis = 0u; axis < 3u; axis++) {
    let re = fieldValues[base + axis];
    let im = fieldValues[base + 3u + axis];
    var component = sqrt(re * re + im * im);
    if (instantaneous) {
      component = SQRT2 * (re * params.phase.x - im * params.phase.y);
    }
    sum += component * component;
  }
  return sqrt(sum);
}

@compute @workgroup_size(4, 4, 4)
fn packMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.dims.x || id.y >= params.dims.y || id.z >= params.dims.z) {
    return;
  }
  let index = id.x + params.dims.x * (id.y + params.dims.y * id.z);
  let value = magnitudeAt(index, params.selection.x, params.selection.y == 1u) * params.phase.z;
  magnitudes[index] = value;
  textureStore(volume, vec3i(id), vec4f(value, 0.0, 0.0, 1.0));
}

@compute @workgroup_size(64)
fn statsMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.dims.w) {
    return;
  }
  let electric = magnitudeAt(id.x, 0u, false) * 0.001;
  let magnetic = magnitudeAt(id.x, 6u, false);
  atomicMax(&maxima[0], bitcast<u32>(electric));
  atomicMax(&maxima[1], bitcast<u32>(magnetic));
}
