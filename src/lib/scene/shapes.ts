/**
 * The shapes a scene's atoms and bonds are made of (docs/RENDER.md): a
 * sphere of radius 1 and a cylinder of radius 1 and height 1 along +Y,
 * centred on the origin, each a mesh of triangles with its normals - one of
 * each, shared by every atom and bond, each placed, turned and scaled by its
 * node.
 */

export type Shape = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };

/** A sphere of radius 1: `around` vertices round each ring, `rings` from pole to pole, its normals its places. */
export function unitSphere(around = 64, rings = 32): Shape {
  const positions: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const theta = (Math.PI * r) / rings;
    for (let a = 0; a <= around; a++) {
      const phi = (2 * Math.PI * a) / around;
      positions.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi));
    }
  }
  const indices: number[] = [];
  const row = around + 1;
  for (let r = 0; r < rings; r++)
    for (let a = 0; a < around; a++) {
      const p = r * row + a;
      // (counter-clockwise seen from outside: front faces, 3.7.2.1)
      if (r > 0) indices.push(p, p + row, p + 1);
      if (r < rings - 1) indices.push(p + 1, p + row, p + row + 1);
    }
  const p = Float32Array.from(positions);
  return { positions: p, normals: p.slice(), indices: Uint32Array.from(indices) };
}

/** A cylinder of radius 1 and height 1 along +Y, its ends closed: `around` vertices round each, its side smooth and its ends flat. */
export function unitCylinder(around = 32): Shape {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  // (the side: a ring at each end, normals outward)
  for (let a = 0; a <= around; a++) {
    const phi = (2 * Math.PI * a) / around;
    const x = Math.cos(phi);
    const z = -Math.sin(phi);
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(x, 0, z, x, 0, z);
  }
  for (let a = 0; a < around; a++) {
    const lo = 2 * a;
    indices.push(lo, lo + 2, lo + 1, lo + 1, lo + 2, lo + 3);
  }
  // (each end: a fan about its middle, its normal along the axis)
  for (const end of [-0.5, 0.5]) {
    const middle = positions.length / 3;
    positions.push(0, end, 0);
    normals.push(0, Math.sign(end), 0);
    for (let a = 0; a <= around; a++) {
      const phi = (2 * Math.PI * a) / around;
      positions.push(Math.cos(phi), end, -Math.sin(phi));
      normals.push(0, Math.sign(end), 0);
    }
    for (let a = 0; a < around; a++) {
      const v = middle + 1 + a;
      if (end > 0) indices.push(middle, v, v + 1);
      else indices.push(middle, v + 1, v);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

/**
 * A tube of `radius` along a polyline, as one smooth mesh: its cross-section a circle of `around` vertices, turned along the
 * line by parallel transport (no twist, no rib where the line bends), its ends closed flat. The points are where the tube's
 * axis passes, in the mesh's own units. Fewer than two points, or points that coincide, give an empty shape.
 */
export function tubeAlong(points: readonly { x: number; y: number; z: number }[], radius: number, around = 24): Shape {
  const n = points.length;
  const empty: Shape = { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) };
  if (n < 2) return empty;
  type V = [number, number, number];
  const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a: V): V => {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pts: V[] = points.map((p) => [p.x, p.y, p.z]);
  // the tangent at each point: the chord of its neighbours (the line's own direction at the ends)
  const tangent = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  if (tangent.every((t) => len(t) < 1e-9)) return empty;
  // a first normal square to the first tangent, then carried along by the least turn
  const t0 = tangent[0];
  let axis: V = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let normal = norm(cross(cross(t0, axis), t0));
  const frames: { normal: V; binormal: V }[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const t = tangent[i];
      // (the previous normal, taken out of the new tangent's direction)
      const k = dot(normal, t);
      normal = norm([normal[0] - k * t[0], normal[1] - k * t[1], normal[2] - k * t[2]]);
    }
    frames.push({ normal, binormal: cross(tangent[i], normal) });
  }
  void axis;
  axis = [0, 0, 0];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const { normal: nrm, binormal: bi } = frames[i];
    for (let a = 0; a <= around; a++) {
      const phi = (2 * Math.PI * a) / around;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const dir: V = [nrm[0] * c + bi[0] * sn, nrm[1] * c + bi[1] * sn, nrm[2] * c + bi[2] * sn];
      positions.push(pts[i][0] + radius * dir[0], pts[i][1] + radius * dir[1], pts[i][2] + radius * dir[2]);
      normals.push(dir[0], dir[1], dir[2]);
    }
  }
  const row = around + 1;
  for (let i = 0; i < n - 1; i++)
    for (let a = 0; a < around; a++) {
      const p = i * row + a;
      // (front faces outward, as the sphere's: the ring turns from the normal towards the binormal)
      indices.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
    }
  // (the ends: a fan about the axis point, its normal along the tangent)
  for (const end of [0, n - 1]) {
    const sign = end === 0 ? -1 : 1;
    const t = tangent[end];
    const mid = positions.length / 3;
    positions.push(pts[end][0], pts[end][1], pts[end][2]);
    normals.push(sign * t[0], sign * t[1], sign * t[2]);
    for (let a = 0; a <= around; a++) {
      const src = (end * row + a) * 3;
      positions.push(positions[src], positions[src + 1], positions[src + 2]);
      normals.push(sign * t[0], sign * t[1], sign * t[2]);
    }
    for (let a = 0; a < around; a++) {
      const v = mid + 1 + a;
      if (sign > 0) indices.push(mid, v, v + 1);
      else indices.push(mid, v + 1, v);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}
