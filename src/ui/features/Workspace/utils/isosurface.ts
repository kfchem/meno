/**
 * The surface where values on a grid take a value: marching cubes, the
 * tables three.js carries for its own (Paul Bourke's), over a grid whose
 * axes may lean - each corner of each cell where the value is, each edge
 * crossed where it crosses, and each point's normal across the values'
 * slope, so that the surface is shaded smooth. Pure, for a worker
 * (./surfaceWorker) to run off the main thread.
 */
import { edgeTable, triTable } from "three/examples/jsm/objects/MarchingCubes.js";

export type Vec3 = [number, number, number];

/** A grid as the mesher takes it: its values, last axis fastest; its counts, origin and axes, in the units the mesh is wanted in. */
export type MeshGrid = { values: Float32Array; counts: Vec3; origin: Vec3; axes: [Vec3, Vec3, Vec3] };

/** A surface as drawn: three numbers a point, three points a triangle, and each point's normal - and its colour, where another grid colours it. */
export type Mesh = { positions: Float32Array; normals: Float32Array; colours?: Float32Array };

/** A cell's corners, as the tables number them: offsets along the three axes. */
const CORNER: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
/** Each edge's two corners. */
const EDGE: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** The inverse of a 3 × 3 matrix's transpose, its columns the axes: what turns a slope along the grid's indices into one in space. */
function dual(axes: [Vec3, Vec3, Vec3]): [Vec3, Vec3, Vec3] {
  const [a, b, c] = axes;
  const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const bc = cross(b, c);
  const det = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2] || 1;
  const ca = cross(c, a);
  const ab = cross(a, b);
  return [bc.map((v) => v / det) as Vec3, ca.map((v) => v / det) as Vec3, ab.map((v) => v / det) as Vec3];
}

/**
 * The surface where `sign` × the grid's values come to `iso`: for a positive
 * `sign`, round where they are above it; for a negative one, round where
 * they are below its negative - an orbital's other phase.
 */
export function isosurface(grid: MeshGrid, iso: number, sign: 1 | -1 = 1): Mesh {
  const { values, counts, origin, axes } = grid;
  const [nx, ny, nz] = counts;
  const at = (i: number, j: number, k: number) => sign * values[(i * ny + j) * nz + k];
  // the slope at a grid point, along each index (one-sided at the edges)
  const slope = (i: number, j: number, k: number): Vec3 => {
    const d = (lo: number, hi: number, f: (t: number) => number, t: number) =>
      (f(Math.min(t + 1, hi)) - f(Math.max(t - 1, lo))) / (Math.min(t + 1, hi) - Math.max(t - 1, lo) || 1);
    return [
      d(0, nx - 1, (t) => at(t, j, k), i),
      d(0, ny - 1, (t) => at(i, t, k), j),
      d(0, nz - 1, (t) => at(i, j, t), k),
    ];
  };
  const [da, db, dc] = dual(axes);
  const positions: number[] = [];
  const normals: number[] = [];
  const v = new Float64Array(8);
  const edgePoint = new Float64Array(12 * 3);
  const edgeNormal = new Float64Array(12 * 3);
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let k = 0; k < nz - 1; k++) {
        let index = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = at(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2]);
          // (a corner inside - at or above the value - as the tables count it: below)
          if (v[c] < iso) index |= 1 << c;
        }
        const edges = edgeTable[index];
        if (!edges) continue;
        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue;
          const [c0, c1] = EDGE[e];
          const t = v[c1] === v[c0] ? 0.5 : (iso - v[c0]) / (v[c1] - v[c0]);
          const p0 = CORNER[c0];
          const p1 = CORNER[c1];
          const fi = i + p0[0] + (p1[0] - p0[0]) * t;
          const fj = j + p0[1] + (p1[1] - p0[1]) * t;
          const fk = k + p0[2] + (p1[2] - p0[2]) * t;
          for (let x = 0; x < 3; x++) edgePoint[3 * e + x] = origin[x] + fi * axes[0][x] + fj * axes[1][x] + fk * axes[2][x];
          const g0 = slope(i + p0[0], j + p0[1], k + p0[2]);
          const g1 = slope(i + p1[0], j + p1[1], k + p1[2]);
          const g = [g0[0] + (g1[0] - g0[0]) * t, g0[1] + (g1[1] - g0[1]) * t, g0[2] + (g1[2] - g0[2]) * t];
          // (outwards: down the slope, away from where the values are higher)
          let nxw = -(g[0] * da[0] + g[1] * db[0] + g[2] * dc[0]);
          let nyw = -(g[0] * da[1] + g[1] * db[1] + g[2] * dc[1]);
          let nzw = -(g[0] * da[2] + g[1] * db[2] + g[2] * dc[2]);
          const len = Math.hypot(nxw, nyw, nzw) || 1;
          nxw /= len;
          nyw /= len;
          nzw /= len;
          edgeNormal[3 * e] = nxw;
          edgeNormal[3 * e + 1] = nyw;
          edgeNormal[3 * e + 2] = nzw;
        }
        const row = index * 16;
        for (let t = 0; triTable[row + t] !== -1; t++) {
          const e = triTable[row + t];
          positions.push(edgePoint[3 * e], edgePoint[3 * e + 1], edgePoint[3 * e + 2]);
          normals.push(edgeNormal[3 * e], edgeNormal[3 * e + 1], edgeNormal[3 * e + 2]);
        }
      }
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
}

/** A grid's value at a point in space, by its eight nearest points (trilinear); none outside it. */
export function sampleAt(grid: MeshGrid, x: number, y: number, z: number, inverse = dual(grid.axes)): number | null {
  const { values, counts, origin } = grid;
  const [nx, ny, nz] = counts;
  const px = x - origin[0];
  const py = y - origin[1];
  const pz = z - origin[2];
  // (how far along each axis, in its steps: the axes' reciprocal basis)
  const u = px * inverse[0][0] + py * inverse[0][1] + pz * inverse[0][2];
  const v = px * inverse[1][0] + py * inverse[1][1] + pz * inverse[1][2];
  const w = px * inverse[2][0] + py * inverse[2][1] + pz * inverse[2][2];
  if (!(u >= 0 && v >= 0 && w >= 0 && u <= nx - 1 && v <= ny - 1 && w <= nz - 1)) return null;
  const i = Math.min(Math.floor(u), nx - 2);
  const j = Math.min(Math.floor(v), ny - 2);
  const k = Math.min(Math.floor(w), nz - 2);
  const fu = u - i;
  const fv = v - j;
  const fw = w - k;
  const at = (a: number, b: number, c: number) => values[((i + a) * ny + (j + b)) * nz + (k + c)];
  const along = (b: number, c: number) => at(0, b, c) * (1 - fu) + at(1, b, c) * fu;
  const across = (c: number) => along(0, c) * (1 - fv) + along(1, c) * fv;
  return across(0) * (1 - fw) + across(1) * fw;
}

/**
 * The colour scale a surface coloured by another grid is drawn in: blue,
 * through green, to red - as the values run from `from` to `to` - each
 * colour sRGB.
 */
export const SCALE_STOPS: readonly [number, number, number][] = [
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
];

/** Where a value falls on the scale, as an sRGB colour: held at its ends beyond them; grey where there is none. */
export function scaleColour(value: number | null, from: number, to: number): [number, number, number] {
  if (value == null || !Number.isFinite(value)) return [0.6, 0.6, 0.6];
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  const s = t * (SCALE_STOPS.length - 1);
  const a = Math.min(Math.floor(s), SCALE_STOPS.length - 2);
  const f = s - a;
  const c0 = SCALE_STOPS[a];
  const c1 = SCALE_STOPS[a + 1];
  return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
}

/** Each of a mesh's points coloured by a grid's value there, on the scale from `from` to `to`: three numbers a point, linear, as a mesh is drawn. */
export function coloursOf(mesh: Mesh, by: MeshGrid, from: number, to: number): Float32Array {
  const inverse = dual(by.axes);
  const out = new Float32Array(mesh.positions.length);
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (let p = 0; p < mesh.positions.length; p += 3) {
    const [r, g, b] = scaleColour(sampleAt(by, mesh.positions[p], mesh.positions[p + 1], mesh.positions[p + 2], inverse), from, to);
    out[p] = linear(r);
    out[p + 1] = linear(g);
    out[p + 2] = linear(b);
  }
  return out;
}
