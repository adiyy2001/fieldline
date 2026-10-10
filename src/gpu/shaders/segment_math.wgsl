struct Segment {
  start: vec3f,
  chargeRe: f32,
  end: vec3f,
  chargeIm: f32,
  current: vec4f,
}

struct Terms {
  rhoDirection: vec3f,
  radial: f32,
  axial: f32,
}

fn segmentTerms(
  start: vec3f,
  direction: vec3f,
  extent: f32,
  radius: f32,
  position: vec3f,
) -> Terms {
  let offset = position - start;
  let along = dot(offset, direction);
  let perpendicular = offset - along * direction;
  let rho = max(length(perpendicular), radius);
  let remaining = extent - along;
  let nearDistance = sqrt(along * along + rho * rho);
  let farDistance = sqrt(remaining * remaining + rho * rho);
  return Terms(
    perpendicular / rho,
    (remaining / farDistance + along / nearDistance) / rho,
    1.0 / farDistance - 1.0 / nearDistance,
  );
}

fn fieldDirection(terms: Terms, direction: vec3f) -> vec3f {
  return terms.radial * terms.rhoDirection + terms.axial * direction;
}

fn electricShape(segment: Segment, position: vec3f, groundHeight: f32) -> vec3f {
  let span = segment.end - segment.start;
  let extent = length(span);
  let direction = span / extent;
  let radius = segment.current.z;
  let primary = segmentTerms(segment.start, direction, extent, radius, position);
  let mirroredStart = vec3f(segment.start.x, 2.0 * groundHeight - segment.start.y, segment.start.z);
  let mirroredDirection = vec3f(direction.x, -direction.y, direction.z);
  let mirrored = segmentTerms(mirroredStart, mirroredDirection, extent, radius, position);
  return ELECTRIC_PER_MICROCOULOMB *
    (fieldDirection(primary, direction) - fieldDirection(mirrored, mirroredDirection));
}

fn magneticShape(segment: Segment, position: vec3f) -> vec3f {
  let span = segment.end - segment.start;
  let extent = length(span);
  let direction = span / extent;
  let primary = segmentTerms(segment.start, direction, extent, segment.current.z, position);
  return MAGNETIC_MICROTESLA_PER_AMPERE * primary.radial * cross(direction, primary.rhoDirection);
}
