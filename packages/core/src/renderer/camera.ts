import { multiplyMat4, perspective, type Mat4 } from './matrix.js';

/** Vertical field of view of the fixed camera. */
export const CAMERA_FOV_Y = (28 * Math.PI) / 180;
/**
 * Half extent (model units) of the shorter viewport side at the die's depth.
 * The die has circumradius 1, so the remaining space hosts the hop.
 */
export const FRAME_HALF_EXTENT = 1.42;

/**
 * Fixed camera on +Z looking at the origin. The shorter side of the viewport
 * always shows ±{@link FRAME_HALF_EXTENT}, so the die keeps its size when the
 * aspect ratio changes.
 */
export function viewProjection(aspect: number): Mat4 {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfY = safeAspect >= 1 ? FRAME_HALF_EXTENT : FRAME_HALF_EXTENT / safeAspect;
  const distance = halfY / Math.tan(CAMERA_FOV_Y / 2);
  const projection = perspective(CAMERA_FOV_Y, safeAspect, Math.max(0.1, distance - 3), distance + 3);
  const view = new Float32Array(16);
  view[0] = 1;
  view[5] = 1;
  view[10] = 1;
  view[14] = -distance;
  view[15] = 1;
  return multiplyMat4(projection, view);
}
