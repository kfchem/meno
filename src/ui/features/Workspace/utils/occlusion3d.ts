/**
 * How much of the light from all round reaches each point of a molecule in
 * 3D: its ambient occlusion, worked out once for a frame in a look - the
 * molecule is rigid, so turning it changes nothing of it - and drawn by
 * the atoms' and bonds' own shading, at no cost a frame.
 *
 * An atom's is a function on its ball: from each point of the ball a ray
 * goes straight out, and how soon another atom stops it says how open that
 * way is. Those rays, a few dozen, are summed into the nine terms of the
 * spherical harmonics up to the second band, and turned - by the cosine
 * every point of a surface weighs the sky above it with - into how open
 * the ball is at each point (Ramamoorthi and Hanrahan, 2001: band 0 by 1,
 * band 1 by 2/3, band 2 by 1/4, of the light from a sphere all round). A
 * bond's is one number at each of its ends.
 */

/** The terms an atom's occlusion is given in: x, y and z of the point on its ball weigh them (`occlusionAt`). */
export const OCCLUSION_TERMS = 9;

/** How many rays go out from each atom, and from each end of a bond. */
const ATOM_RAYS = 64;
const BOND_RAYS = 32;

// the rays' ways: spread evenly over the sphere (a Fibonacci lattice)
const wayCache = new Map<number, Float32Array>();
function waysOf(n: number): Float32Array {
  let w = wayCache.get(n);
  if (w) return w;
  w = new Float32Array(3 * n);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < n; k++) {
    const z = 1 - (2 * (k + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    const phi = golden * k;
    w[3 * k] = Math.cos(phi) * r;
    w[3 * k + 1] = Math.sin(phi) * r;
    w[3 * k + 2] = z;
  }
  wayCache.set(n, w);
  return w;
}

// The real spherical harmonics to band 2 - each its constant times a
// polynomial in x, y, z (`basis`) - and the factor the cosine takes each
// band by (A_l / pi).
const SH = [0.282095, 0.488603, 0.488603, 0.488603, 1.092548, 1.092548, 0.315392, 1.092548, 0.546274];
const BAND = [1, 2 / 3, 2 / 3, 2 / 3, 0.25, 0.25, 0.25, 0.25, 0.25];
function basis(x: number, y: number, z: number, out: Float64Array) {
  out[0] = 1;
  out[1] = y;
  out[2] = z;
  out[3] = x;
  out[4] = x * y;
  out[5] = y * z;
  out[6] = 3 * z * z - 1;
  out[7] = x * z;
  out[8] = x * x - y * y;
}

/**
 * How open an atom's ball is at the point its unit vector `n` points to
 * (in the molecule's own axes): 1 open, 0 shut in - the sum the shader
 * makes of `terms` from atom `i`.
 */
export function occlusionAt(terms: Float32Array, i: number, n: readonly [number, number, number]): number {
  const [x, y, z] = n;
  const t = (k: number) => terms[OCCLUSION_TERMS * i + k];
  const v =
    t(0) +
    t(1) * y +
    t(2) * z +
    t(3) * x +
    t(4) * x * y +
    t(5) * y * z +
    t(6) * (3 * z * z - 1) +
    t(7) * x * z +
    t(8) * (x * x - y * y);
  return Math.min(1, Math.max(0, v));
}

/** Atoms filed by where they are, to find those near a point quickly. */
type Grid = { cell: number; cells: Map<number, number[]> };
const keyOf = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
function gridOf(places: Float32Array, radii: Float32Array, cell: number): Grid {
  const cells = new Map<number, number[]>();
  for (let i = 0; i < radii.length; i++) {
    if (!(radii[i] > 0)) continue;
    const k = keyOf(Math.floor(places[3 * i] / cell), Math.floor(places[3 * i + 1] / cell), Math.floor(places[3 * i + 2] / cell));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }
  return { cell, cells };
}
/** The atoms whose balls come within `within` of the point, each by index - into `out`, which is emptied first. */
function near(grid: Grid, places: Float32Array, radii: Float32Array, x: number, y: number, z: number, within: number, out: number[]) {
  out.length = 0;
  const { cell, cells } = grid;
  const span = Math.ceil(within / cell);
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const cz = Math.floor(z / cell);
  for (let a = cx - span; a <= cx + span; a++)
    for (let b = cy - span; b <= cy + span; b++)
      for (let c = cz - span; c <= cz + span; c++) {
        const list = cells.get(keyOf(a, b, c));
        if (!list) continue;
        for (const j of list) {
          const dx = places[3 * j] - x;
          const dy = places[3 * j + 1] - y;
          const dz = places[3 * j + 2] - z;
          const r = within + radii[j];
          if (dx * dx + dy * dy + dz * dz < r * r) out.push(j);
        }
      }
}

/**
 * How open the way is from (ox, oy, oz) along (wx, wy, wz): 1 where no ball
 * among `others` stops it within `reach`, less the sooner one does, 0 where
 * it starts inside one. `skip` is the atom it starts on.
 */
function openness(
  places: Float32Array,
  radii: Float32Array,
  others: readonly number[],
  skip: number,
  ox: number,
  oy: number,
  oz: number,
  wx: number,
  wy: number,
  wz: number,
  reach: number,
): number {
  let t = reach;
  for (const j of others) {
    if (j === skip) continue;
    const r = radii[j];
    const px = ox - places[3 * j];
    const py = oy - places[3 * j + 1];
    const pz = oz - places[3 * j + 2];
    const c = px * px + py * py + pz * pz - r * r;
    if (c <= 0) return 0;
    const b = px * wx + py * wy + pz * wz;
    if (b >= 0) continue;
    const d = b * b - c;
    if (d < 0) continue;
    const hit = -b - Math.sqrt(d);
    if (hit < t) t = hit;
  }
  // (a ball stopping it near shuts it in; one stopping it near `reach` hardly at all)
  const u = 1 - t / reach;
  return 1 - u * u;
}

/**
 * Each atom's occlusion, as `OCCLUSION_TERMS` terms an atom: the atoms at
 * `places` (x, y, z in turn) with their balls' `radii` - none for an atom
 * not drawn, which neither is shaded nor shades - each way being open
 * where nothing stops it within `reach`. All in one unit.
 */
export function atomOcclusion(places: Float32Array, radii: Float32Array, reach: number, rays = ATOM_RAYS): Float32Array {
  const n = radii.length;
  const out = new Float32Array(OCCLUSION_TERMS * n);
  let most = 0;
  for (let i = 0; i < n; i++) if (radii[i] > most) most = radii[i];
  const grid = gridOf(places, radii, reach + 2 * most);
  const ways = waysOf(rays);
  const y = new Float64Array(OCCLUSION_TERMS);
  const sum = new Float64Array(OCCLUSION_TERMS);
  const others: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = radii[i];
    const at = OCCLUSION_TERMS * i;
    if (!(r > 0)) {
      // (not drawn: open all round, should it come to be drawn)
      out[at] = 1;
      continue;
    }
    const x0 = places[3 * i];
    const y0 = places[3 * i + 1];
    const z0 = places[3 * i + 2];
    near(grid, places, radii, x0, y0, z0, r + reach, others);
    sum.fill(0);
    for (let k = 0; k < rays; k++) {
      const wx = ways[3 * k];
      const wy = ways[3 * k + 1];
      const wz = ways[3 * k + 2];
      const v = others.length > 1 ? openness(places, radii, others, i, x0 + wx * r, y0 + wy * r, z0 + wz * r, wx, wy, wz, reach) : 1;
      basis(wx, wy, wz, y);
      for (let t = 0; t < OCCLUSION_TERMS; t++) sum[t] += v * y[t];
    }
    // (each ray stands for 4 pi / rays of the sphere; the constants - the
    // projection's and the sum's - and the band's factor folded in, so that
    // the shader multiplies by the polynomials alone)
    const w = (4 * Math.PI) / rays;
    for (let t = 0; t < OCCLUSION_TERMS; t++) out[at + t] = sum[t] * w * SH[t] * SH[t] * BAND[t];
  }
  return out;
}

/** A bond line as `bondOcclusion` takes it: from (ax, ay, az) to (bx, by, bz), and its radius - seven numbers a line. */
export const LINE_TERMS = 7;

/**
 * Each bond line's occlusion: how open it is near each of its two ends, on
 * average round it - two numbers a line. `lines` are `LINE_TERMS` numbers
 * each, among the atoms at `places` with `radii`, in their unit.
 */
export function bondOcclusion(places: Float32Array, radii: Float32Array, lines: Float32Array, reach: number, rays = BOND_RAYS): Float32Array {
  const count = Math.floor(lines.length / LINE_TERMS);
  const out = new Float32Array(2 * count);
  let most = 0;
  for (let i = 0; i < radii.length; i++) if (radii[i] > most) most = radii[i];
  const grid = gridOf(places, radii, reach + 2 * most);
  const ways = waysOf(rays);
  const others: number[] = [];
  for (let k = 0; k < count; k++) {
    const l = LINE_TERMS * k;
    const [x0, y0, z0, x1, y1, z1, r] = [lines[l], lines[l + 1], lines[l + 2], lines[l + 3], lines[l + 4], lines[l + 5], lines[l + 6]];
    const length = Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 1;
    const ax = (x1 - x0) / length;
    const ay = (y1 - y0) / length;
    const az = (z1 - z0) / length;
    for (let e = 0; e < 2; e++) {
      const f = e === 0 ? 0.25 : 0.75;
      const qx = x0 + (x1 - x0) * f;
      const qy = y0 + (y1 - y0) * f;
      const qz = z0 + (z1 - z0) * f;
      near(grid, places, radii, qx, qy, qz, r + reach, others);
      let sum = 0;
      let weight = 0;
      for (let s = 0; s < rays; s++) {
        const wx = ways[3 * s];
        const wy = ways[3 * s + 1];
        const wz = ways[3 * s + 2];
        // (the ways out of its side count, those along it hardly)
        const along = wx * ax + wy * ay + wz * az;
        const w = Math.sqrt(Math.max(0, 1 - along * along));
        if (w < 1e-3) continue;
        const v = others.length ? openness(places, radii, others, -1, qx + wx * r, qy + wy * r, qz + wz * r, wx, wy, wz, reach) : 1;
        sum += w * v;
        weight += w;
      }
      out[2 * k + e] = weight > 0 ? sum / weight : 1;
    }
  }
  return out;
}

/** A molecule's occlusion in one look: its atoms' terms, and its bond lines' ends. */
export type Occlusion = { atoms: Float32Array; bonds: Float32Array };

/** How far a hollow is looked across for what shades it: three ångströms, in the unit given. */
export const OCCLUSION_REACH_ANGSTROM = 3;

/** Both at once, as the worker and a picture work them out. */
export function occlusionOf(places: Float32Array, radii: Float32Array, lines: Float32Array, reach: number): Occlusion {
  return { atoms: atomOcclusion(places, radii, reach), bonds: bondOcclusion(places, radii, lines, reach) };
}
