@group(0) @binding(0) var<storage, read_write> values: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index < arrayLength(&values)) {
    values[index] = index * index + 7u;
  }
}
