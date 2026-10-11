const COMPONENTS: u32 = 12u;
const PALETTE_SIZE: u32 = 256u;
const MAXIMUM_LEVELS: u32 = 4u;
const SQRT2: f32 = 1.41421356;

struct Level {
  value: f32,
  dash: f32,
  emphasis: f32,
  padding: f32,
}

struct Params {
  grid: vec4u,
  phase: vec4f,
  frame: vec4f,
  levels: array<Level, MAXIMUM_LEVELS>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> fieldValues: array<f32>;
@group(0) @binding(2) var<uniform> palette: array<vec4f, PALETTE_SIZE>;

struct VertexOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.position = vec4f(corners[index], 0.0, 1.0);
  return output;
}

fn nodeScalar(ix: u32, iz: u32) -> f32 {
  let nx = params.grid.x;
  let base = (ix + nx * iz) * COMPONENTS + params.grid.z;
  var sum = 0.0;
  for (var axis = 0u; axis < 3u; axis = axis + 1u) {
    let re = fieldValues[base + axis];
    let im = fieldValues[base + 3u + axis];
    var component = sqrt(re * re + im * im);
    if (params.grid.w == 1u) {
      component = SQRT2 * (re * params.phase.x - im * params.phase.y);
    }
    sum = sum + component * component;
  }
  return sqrt(sum) * params.phase.z;
}

fn bilinearScalar(lateral: f32, along: f32) -> f32 {
  let nx = params.grid.x;
  let nz = params.grid.y;
  let x = clamp(lateral * f32(nx - 1u), 0.0, f32(nx - 1u));
  let z = clamp(along * f32(nz - 1u), 0.0, f32(nz - 1u));
  let x0 = min(u32(floor(x)), nx - 2u);
  let z0 = min(u32(floor(z)), nz - 2u);
  let fx = x - f32(x0);
  let fz = z - f32(z0);
  let low = mix(nodeScalar(x0, z0), nodeScalar(x0 + 1u, z0), fx);
  let high = mix(nodeScalar(x0, z0 + 1u), nodeScalar(x0 + 1u, z0 + 1u), fx);
  return mix(low, high, fz);
}

fn paletteColor(fraction: f32) -> vec3f {
  let position = clamp(fraction, 0.0, 1.0) * f32(PALETTE_SIZE - 1u);
  let lower = u32(floor(position));
  let upper = min(lower + 1u, PALETTE_SIZE - 1u);
  return mix(palette[lower].rgb, palette[upper].rgb, position - f32(lower));
}

fn dashCoverage(kind: u32, travelled: f32) -> f32 {
  var on = 1.0;
  var period = 1.0;
  if (kind == 1u) {
    on = 14.0;
    period = 20.0;
  } else if (kind == 2u) {
    on = 6.0;
    period = 11.0;
  } else if (kind == 3u) {
    on = 2.0;
    period = 6.0;
  }
  let offset = travelled - period * floor(travelled / period);
  return select(0.0, 1.0, kind == 0u || offset < on);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let along = position.x / params.frame.x;
  let lateral = 1.0 - position.y / params.frame.y;
  let scalar = bilinearScalar(lateral, along);
  let gradient = vec2f(dpdx(scalar), dpdy(scalar));
  let gradientLength = max(length(gradient), 1e-9);
  let travelled = select(position.y, position.x, abs(gradient.y) >= abs(gradient.x));
  var color = paletteColor(scalar / params.phase.w);
  let levelCount = u32(params.frame.w);
  for (var index = 0u; index < levelCount; index = index + 1u) {
    let level = params.levels[index];
    let pixelDistance = abs(scalar - level.value) / gradientLength;
    let halfWidth = params.frame.z * (0.6 + 0.5 * level.emphasis);
    let dashed = dashCoverage(u32(level.dash), travelled);
    let casing = (1.0 - smoothstep(halfWidth + 0.3, halfWidth + 1.5, pixelDistance)) * dashed;
    let stroke = (1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, pixelDistance)) * dashed;
    color = mix(color, vec3f(0.0), casing * 0.6);
    color = mix(color, vec3f(1.0), stroke);
  }
  return vec4f(color, 1.0);
}
