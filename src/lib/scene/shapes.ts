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
