/**
 * The 3D framing matches the DOM's design frame (1920×940, see index.html).
 * Cameras keep their vertical field of view on wide screens; on narrower
 * ones they keep the horizontal field instead, so the crow stays the same
 * fraction of the width from the copy on every desktop screen.
 */
export const DESIGN_ASPECT = 1920 / 940

/** Vertical fov (degrees) for this aspect, given the fov designed at DESIGN_ASPECT. */
export function fitFov(fov: number, aspect: number, max = 80) {
  if (aspect >= DESIGN_ASPECT) return fov
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (DESIGN_ASPECT / aspect))
  return Math.min(max, (half * 360) / Math.PI)
}
