struct SceneUniform {
  viewProjection: mat4x4f,
  viewport: vec4f,
  ground: vec4f,
  groundColor: vec4f,
}

struct LineInstance {
  start: vec4f,
  end: vec4f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniform;
@group(0) @binding(1) var<storage, read> instances: array<LineInstance>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

const MINIMUM_W: f32 = 0.05;

fn clipEnd(inside: vec4f, outside: vec4f) -> vec4f {
  let fraction = (MINIMUM_W - inside.w) / (outside.w - inside.w);
  return mix(inside, outside, fraction);
}

@vertex
fn lineMain(
  @builtin(vertex_index) vertex: u32,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  let line = instances[instance];
  var first = scene.viewProjection * vec4f(line.start.xyz, 1.0);
  var second = scene.viewProjection * vec4f(line.end.xyz, 1.0);
  if (first.w < MINIMUM_W && second.w < MINIMUM_W) {
    return VertexOut(vec4f(2.0, 2.0, 2.0, 1.0), vec4f(0.0));
  }
  if (first.w < MINIMUM_W) {
    first = clipEnd(second, first);
  }
  if (second.w < MINIMUM_W) {
    second = clipEnd(first, second);
  }
  let size = scene.viewport.xy;
  let firstScreen = first.xy / first.w * size * 0.5;
  let secondScreen = second.xy / second.w * size * 0.5;
  let along = secondScreen - firstScreen;
  let direction = select(vec2f(1.0, 0.0), normalize(along), length(along) > 1e-4);
  let normal = vec2f(-direction.y, direction.x);
  var order = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u);
  let corner = order[vertex];
  let useSecond = (corner & 2u) != 0u;
  let side = select(-1.0, 1.0, (corner & 1u) == 1u);
  let base = select(first, second, useSecond);
  let offset = normal * side * line.start.w * 0.5 / (size * 0.5);
  return VertexOut(
    vec4f(base.xy + offset * base.w, base.z, base.w),
    line.color,
  );
}

@fragment
fn lineFragment(input: VertexOut) -> @location(0) vec4f {
  return input.color;
}

@vertex
fn groundMain(@builtin(vertex_index) vertex: u32) -> VertexOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
  );
  let corner = corners[vertex];
  let world = vec3f(corner.x * scene.ground.y, scene.ground.x, corner.y * scene.ground.z + scene.ground.w);
  return VertexOut(scene.viewProjection * vec4f(world, 1.0), scene.groundColor);
}
