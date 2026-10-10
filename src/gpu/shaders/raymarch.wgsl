struct MarchParams {
  inverseViewProjection: mat4x4f,
  cameraPosition: vec4f,
  boxMin: vec4f,
  boxMax: vec4f,
  dims: vec4f,
  viewport: vec4f,
}

@group(0) @binding(0) var<uniform> params: MarchParams;
@group(0) @binding(1) var volumeTexture: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
@group(0) @binding(3) var<uniform> transfer: array<vec4f, 256>;

struct VertexOut {
  @builtin(position) position: vec4f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return VertexOut(vec4f(corner * 2.0 - 1.0, 0.0, 1.0));
}

fn transferAt(fraction: f32) -> vec4f {
  let position = clamp(fraction, 0.0, 1.0) * 255.0;
  let lower = u32(floor(position));
  let upper = min(255u, lower + 1u);
  return mix(transfer[lower], transfer[upper], position - f32(lower));
}

fn unproject(ndc: vec3f) -> vec3f {
  let homogeneous = params.inverseViewProjection * vec4f(ndc, 1.0);
  return homogeneous.xyz / homogeneous.w;
}

@fragment
fn fragmentMain(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let width = params.viewport.x;
  let height = params.viewport.y;
  let ndc = vec2f(pixel.x / width * 2.0 - 1.0, 1.0 - pixel.y / height * 2.0);
  let near = unproject(vec3f(ndc, 0.0));
  let far = unproject(vec3f(ndc, 1.0));
  let direction = normalize(far - near);
  let origin = params.cameraPosition.xyz;
  let first = (params.boxMin.xyz - origin) / direction;
  let second = (params.boxMax.xyz - origin) / direction;
  let entry = max(max(min(first.x, second.x), min(first.y, second.y)), min(first.z, second.z));
  let exit = min(min(max(first.x, second.x), max(first.y, second.y)), max(first.z, second.z));
  let start = max(entry, 0.0);
  if (exit <= start) {
    return vec4f(0.0);
  }
  let steps = u32(params.boxMax.w);
  let stepLength = (exit - start) / f32(steps);
  let maximum = params.boxMin.w;
  let referenceLength = params.dims.w;
  let size = params.boxMax.xyz - params.boxMin.xyz;
  let dims = params.dims.xyz;
  var color = vec3f(0.0);
  var alpha = 0.0;
  var distance = start + 0.5 * stepLength;
  for (var step = 0u; step < steps; step++) {
    let position = origin + direction * distance;
    let unit = (position - params.boxMin.xyz) / size;
    let coordinate = (unit * (dims - 1.0) + 0.5) / dims;
    let value = textureSampleLevel(volumeTexture, volumeSampler, coordinate, 0.0).r;
    let fraction = sqrt(clamp(value / maximum, 0.0, 1.0));
    let entryColor = transferAt(fraction);
    let stepAlpha = 1.0 - pow(1.0 - min(entryColor.a, 0.999), stepLength / referenceLength);
    let weight = (1.0 - alpha) * stepAlpha;
    color += weight * entryColor.rgb;
    alpha += weight;
    if (alpha > 0.98) {
      break;
    }
    distance += stepLength;
  }
  return vec4f(color, alpha);
}
