struct DrawParams {
  viewProjection: mat4x4f,
  viewport: vec4f,
  range: vec4f,
  counts: vec4u,
}

@group(0) @binding(0) var<uniform> params: DrawParams;
@group(0) @binding(1) var<storage, read> points: array<vec4f>;
@group(0) @binding(2) var<storage, read> magnitudes: array<f32>;
@group(0) @binding(3) var<storage, read> info: array<vec2u>;
@group(0) @binding(4) var<uniform> palette: array<vec4f, 256>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) arc: f32,
}

const MINIMUM_W: f32 = 0.05;

@vertex
fn vertexMain(
  @builtin(vertex_index) vertex: u32,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  let stepCount = params.counts.y;
  let line = instance / stepCount;
  let segment = instance % stepCount;
  if (segment + 1u >= info[line].x) {
    return VertexOut(vec4f(2.0, 2.0, 2.0, 1.0), vec3f(0.0), 0.0);
  }
  let slot = line * (stepCount + 1u) + segment;
  let startPoint = points[slot];
  let endPoint = points[slot + 1u];
  let first = params.viewProjection * vec4f(startPoint.xyz, 1.0);
  let second = params.viewProjection * vec4f(endPoint.xyz, 1.0);
  if (first.w < MINIMUM_W || second.w < MINIMUM_W) {
    return VertexOut(vec4f(2.0, 2.0, 2.0, 1.0), vec3f(0.0), 0.0);
  }
  let size = params.viewport.xy;
  let along = (second.xy / second.w - first.xy / first.w) * size * 0.5;
  let direction = select(vec2f(1.0, 0.0), normalize(along), length(along) > 1e-4);
  let normal = vec2f(-direction.y, direction.x);
  var order = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u);
  let corner = order[vertex];
  let useSecond = (corner & 2u) != 0u;
  let side = select(-1.0, 1.0, (corner & 1u) == 1u);
  let base = select(first, second, useSecond);
  let offset = normal * side * params.viewport.w * 0.5 / (size * 0.5);
  let fraction = 0.4 + 0.6 * sqrt(clamp(magnitudes[slot] / params.range.x, 0.0, 1.0));
  let color = palette[u32(fraction * 255.0)].rgb;
  return VertexOut(
    vec4f(base.xy + offset * base.w, base.z, base.w),
    color,
    select(startPoint.w, endPoint.w, useSecond),
  );
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
  let phase = fract((input.arc - params.viewport.z * params.range.z) / params.range.y);
  let brightness = select(0.45, 1.0, phase < 0.5);
  return vec4f(input.color * brightness, 1.0);
}
