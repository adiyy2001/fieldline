@compute @workgroup_size(WORKGROUP_X, WORKGROUP_Y, WORKGROUP_Z)
fn main(
  @builtin(global_invocation_id) id: vec3u,
  @builtin(local_invocation_index) localIndex: u32,
) {
  let valid = id.x < params.dims.x && id.y < params.dims.y && id.z < params.dims.z;
  let position = params.origin + vec3f(f32(id.x), f32(id.y), f32(id.z)) * params.step;
  let accumulator = accumulateField(position, localIndex, valid);
  if (valid) {
    writeFieldValues(id.x + params.dims.x * (id.y + params.dims.y * id.z), accumulator);
  }
}
