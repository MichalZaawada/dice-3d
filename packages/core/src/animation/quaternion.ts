import { cross, normalize, type Vec3 } from './vector.js';

/** Unit quaternion stored as `[x, y, z, w]`. */
export type Quat = readonly [number, number, number, number];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export function fromAxisAngle(axis: Vec3, angle: number): Quat {
  const [x, y, z] = normalize(axis);
  const half = angle / 2;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

/** Hamilton product: applying the result equals applying `b` first, then `a`. */
export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatDot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return len === 0 ? IDENTITY_QUAT : [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function rotateVector(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const t = cross(u, v);
  const t2: Vec3 = [2 * t[0], 2 * t[1], 2 * t[2]];
  const c = cross(u, t2);
  return [v[0] + w * t2[0] + c[0], v[1] + w * t2[1] + c[1], v[2] + w * t2[2] + c[2]];
}

/** Spherical interpolation along the shortest arc. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cosine = quatDot(a, b);
  let target = b;
  if (cosine < 0) {
    cosine = -cosine;
    target = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cosine > 0.9995) {
    return normalizeQuat([
      a[0] + (target[0] - a[0]) * t,
      a[1] + (target[1] - a[1]) * t,
      a[2] + (target[2] - a[2]) * t,
      a[3] + (target[3] - a[3]) * t,
    ]);
  }
  const theta = Math.acos(Math.min(1, cosine));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return [
    a[0] * wa + target[0] * wb,
    a[1] * wa + target[1] * wb,
    a[2] * wa + target[2] * wb,
    a[3] * wa + target[3] * wb,
  ];
}

/** Rotation angle (radians, 0..π) between two orientations. */
export function angleBetween(a: Quat, b: Quat): number {
  return 2 * Math.acos(Math.min(1, Math.abs(quatDot(a, b))));
}

/**
 * Builds the rotation whose rows are the given orthonormal basis, i.e. the
 * rotation that maps `right` to +X, `up` to +Y and `forward` to +Z.
 */
export function fromBasisRows(right: Vec3, up: Vec3, forward: Vec3): Quat {
  const m00 = right[0], m01 = right[1], m02 = right[2];
  const m10 = up[0], m11 = up[1], m12 = up[2];
  const m20 = forward[0], m21 = forward[1], m22 = forward[2];
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return normalizeQuat(q);
}

/** Any unit vector perpendicular to `v`. */
export function perpendicular(v: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(v, helper));
}
