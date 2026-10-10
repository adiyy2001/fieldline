struct SurfaceVertex {
  position: vec4f,
  normal: vec4f,
}

struct SurfaceParams {
  viewProjection: mat4x4f,
  cameraPosition: vec4f,
  colors: array<vec4f, 4>,
}

@group(0) @binding(0) var<uniform> params: SurfaceParams;
@group(0) @binding(1) var<storage, read> vertices: array<SurfaceVertex>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) toCamera: vec3f,
  @location(2) @interpolate(flat) level: u32,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  let vertex = vertices[index];
  return VertexOut(
    params.viewProjection * vec4f(vertex.position.xyz, 1.0),
    vertex.normal.xyz,
    params.cameraPosition.xyz - vertex.position.xyz,
    u32(vertex.position.w),
  );
}

@fragment
fn fragmentMain(input: VertexOut) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let view = normalize(input.toCamera);
  let facing = abs(dot(normal, view));
  let light = normalize(vec3f(0.35, 0.8, 0.45));
  let diffuse = 0.5 + 0.5 * dot(normal, light);
  let rim = pow(1.0 - facing, 2.0);
  let base = params.colors[min(input.level, 3u)];
  let shaded = base.rgb * (0.35 + 0.65 * diffuse) + vec3f(0.18) * rim;
  return vec4f(shaded * base.a, base.a);
}
