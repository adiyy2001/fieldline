struct SurfaceVertex {
  position: vec4f,
  normal: vec4f,
}

struct ExtractParams {
  origin: vec4f,
  spacing: vec4f,
  dims: vec4u,
  level: vec4f,
}

@group(0) @binding(0) var<uniform> params: ExtractParams;
@group(0) @binding(1) var<storage, read> values: array<f32>;
@group(0) @binding(2) var<storage, read> cases: array<i32>;
@group(0) @binding(3) var<storage, read_write> vertices: array<SurfaceVertex>;
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>, 8>;

fn nodeIndex(node: vec3u) -> u32 {
  return node.x + params.dims.x * (node.y + params.dims.y * node.z);
}

fn nodeValue(node: vec3i) -> f32 {
  let limit = vec3i(params.dims.xyz) - vec3i(1);
  return values[nodeIndex(vec3u(clamp(node, vec3i(0), limit)))];
}

fn gradientAtNode(node: vec3u) -> vec3f {
  let center = vec3i(node);
  let limit = vec3i(params.dims.xyz) - vec3i(1);
  let upper = min(center + vec3i(1), limit);
  let lower = max(center - vec3i(1), vec3i(0));
  let span = max(vec3f(1.0), vec3f(upper - lower));
  return vec3f(
    nodeValue(vec3i(upper.x, center.y, center.z)) - nodeValue(vec3i(lower.x, center.y, center.z)),
    nodeValue(vec3i(center.x, upper.y, center.z)) - nodeValue(vec3i(center.x, lower.y, center.z)),
    nodeValue(vec3i(center.x, center.y, upper.z)) - nodeValue(vec3i(center.x, center.y, lower.z)),
  ) / (span * params.spacing.xyz);
}

fn cornerNode(cell: vec3u, corner: u32) -> vec3u {
  return cell + vec3u(corner & 1u, (corner >> 1u) & 1u, (corner >> 2u) & 1u);
}

fn edgeVertex(cell: vec3u, edge: u32) -> SurfaceVertex {
  let fromNode = cornerNode(cell, u32(cases[edge * 2u]));
  let toNode = cornerNode(cell, u32(cases[edge * 2u + 1u]));
  let fromValue = values[nodeIndex(fromNode)];
  let toValue = values[nodeIndex(toNode)];
  let fraction = select(0.5, (params.level.x - fromValue) / (toValue - fromValue), fromValue != toValue);
  let gradient = mix(gradientAtNode(fromNode), gradientAtNode(toNode), fraction);
  let magnitude = max(length(gradient), 1e-20);
  let node = mix(vec3f(fromNode), vec3f(toNode), fraction);
  return SurfaceVertex(
    vec4f(params.origin.xyz + node * params.spacing.xyz, params.level.y),
    vec4f(-gradient / magnitude, 0.0),
  );
}

@compute @workgroup_size(4, 4, 4)
fn extractMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x + 1u >= params.dims.x || id.y + 1u >= params.dims.y || id.z + 1u >= params.dims.z) {
    return;
  }
  var mask = 0u;
  for (var corner = 0u; corner < 8u; corner++) {
    if (values[nodeIndex(cornerNode(id, corner))] > params.level.x) {
      mask |= 1u << corner;
    }
  }
  let entry = CASE_OFFSET + mask * CASE_STRIDE;
  let triangleCount = u32(cases[entry]);
  if (triangleCount == 0u) {
    return;
  }
  let first = atomicAdd(&counters[4], triangleCount * 3u);
  for (var triangle = 0u; triangle < triangleCount; triangle++) {
    let slot = first + triangle * 3u;
    if (slot + 3u > params.dims.w) {
      continue;
    }
    for (var corner = 0u; corner < 3u; corner++) {
      let edge = u32(cases[entry + 1u + triangle * 3u + corner]);
      vertices[slot + corner] = edgeVertex(id, edge);
    }
  }
}

@compute @workgroup_size(1)
fn finalizeMain() {
  let produced = atomicLoad(&counters[4]);
  let usable = min(produced, params.dims.w);
  atomicStore(&counters[0], (usable / 3u) * 3u);
  atomicStore(&counters[1], 1u);
  atomicStore(&counters[2], 0u);
  atomicStore(&counters[3], 0u);
}
