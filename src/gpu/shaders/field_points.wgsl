@group(0) @binding(3) var<storage, read> points: array<vec4f>;

@compute @workgroup_size(WORKGROUP_X, WORKGROUP_Y, WORKGROUP_Z)
fn main(
  @builtin(global_invocation_id) id: vec3u,
  @builtin(local_invocation_index) localIndex: u32,
) {
  let valid = id.x < params.pointCount;
  var position = vec3f(0.0);
  if (valid) {
    position = points[id.x].xyz;
  }
  let accumulator = accumulateField(position, localIndex, valid);
  if (valid) {
    writeFieldValues(id.x, accumulator);
  }
}
