/**
 * A biopolymer's chains as ribbons (docs/WORKSPACE.md, *Ribbons*): a smooth
 * line along each run's backbone atoms - a protein's alpha carbons, a
 * nucleic acid's phosphorus atoms: a cubic B-spline they are the control
 * points of, so that a helix's line winds smoothly within its atoms, not
 * corner to corner through them - and round it a band: wide and flat
 * through a helix, wide through a strand, ending in an arrowhead at its
 * C-terminal end, a thin tube elsewhere; the band's face turned as each
 * peptide's plane is (its carbonyl oxygen says which way), so a helix's
 * band winds round its axis. Pure: over the places a molecule's atoms are
 * drawn at, about its centre, in the page's units.
 */
import * as THREE from "three";
import type { Biopolymer, ChainRun, Structure } from "../../../../lib/chem/biopolymer";

/** How wide and how thick the band is, in ångströms: through a helix, a strand and elsewhere; and how wide a strand's arrowhead starts. */
export const RIBBON_SIZE = {
  helix: { w: 1.6, h: 0.3 },
  strand: { w: 1.7, h: 0.35 },
  coil: { w: 0.5, h: 0.5 },
  arrow: 2.6,
};

/** A ribbon's colours: by its secondary structure, its chain, or along its sequence. */
export type RibbonColours = "structure" | "chain" | "sequence";

/** Each kind's colour: muted, as the surfaces' are (lib/chem/style3d). */
export const STRUCTURE_COLOURS: Record<Structure | "coil", string> = { helix: "#c75a6b", strand: "#e2b04a", coil: "#a8adb3" };
/** A chain's colour, chain after chain. */
export const CHAIN_COLOURS = ["#4f7cc4", "#d98a4b", "#5aa469", "#b05fae", "#c9a227", "#4fa8b8", "#c75a6b", "#8a7fd1"];

/** How many points a residue's stretch of the line is drawn with, and how many sides the band has round. */
const STEPS = 8;
const SIDES = 10;

/** One point along a ribbon: where, which way it runs, which way its width lies, how wide and how thick, its colour, and the residue it is of. */
export type RibbonPoint = { at: THREE.Vector3; along: THREE.Vector3; across: THREE.Vector3; w: number; h: number; colour: THREE.Color; residue: number };

/** Each residue's colour in a run, as `by` says. */
function coloursOf(bp: Biopolymer, run: ChainRun, by: RibbonColours, chainIndex: Map<string, number>): THREE.Color[] {
  return run.residues.map((r, i) => {
    if (by === "chain") return new THREE.Color(CHAIN_COLOURS[(chainIndex.get(bp.residues[r].chain) ?? 0) % CHAIN_COLOURS.length]);
    // (from blue at its start to red at its end)
    if (by === "sequence") return new THREE.Color().setHSL((2 / 3) * (1 - i / Math.max(1, run.residues.length - 1)), 0.45, 0.55);
    return new THREE.Color(STRUCTURE_COLOURS[bp.structure[r] ?? "coil"]);
  });
}

/** The chains' order of first coming, for colouring by chain. */
function chainsOf(bp: Biopolymer): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of bp.residues) if (!m.has(r.chain)) m.set(r.chain, m.size);
  return m;
}

/**
 * The points a run's ribbon is drawn through, `steps` to a residue, at
 * `scale` of its full size - a ribbon going, or coming, as the molecule
 * goes over to a look that draws its atoms instead - `k` page units to the
 * ångström.
 */
export function ribbonPoints(
  places: ArrayLike<number>,
  run: ChainRun,
  bp: Biopolymer,
  by: RibbonColours,
  scale: number,
  k: number,
  steps = STEPS,
  chainIndex = chainsOf(bp),
): RibbonPoint[] {
  const n = run.trace.length;
  if (n < 2) return [];
  const at = (i: number) => new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
  const p = run.trace.map(at);
  // the ends carried on in a line, for the curve's first and last stretch
  // (so that it begins on the first atom and ends on the last)
  const ctrl = (i: number) => (i < 0 ? p[0].clone().multiplyScalar(2).sub(p[1]) : i >= n ? p[n - 1].clone().multiplyScalar(2).sub(p[n - 2]) : p[i]);
  // which way each residue's band is turned: towards its carbonyl oxygen,
  // or else square to the chain's bend there - each turned as the one
  // before it, so that the band does not flip
  const guides: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const g = run.guide[i];
    let v = g != null ? at(g).sub(p[i]) : ctrl(i + 1).clone().sub(p[i]).cross(ctrl(i - 1).clone().sub(p[i]));
    if (v.lengthSq() < 1e-12) v = new THREE.Vector3(0, 0, 1);
    v.normalize();
    if (i > 0 && v.dot(guides[i - 1]) < 0) v.negate();
    guides.push(v);
  }
  const colours = coloursOf(bp, run, by, chainIndex);
  const kind = (i: number): Structure | "coil" => bp.structure[run.residues[i]] ?? "coil";
  // a strand's last residue: where its arrowhead points to
  const lastOfStrand = (i: number) => kind(i) === "strand" && (i === n - 1 || kind(i + 1) !== "strand");
  const size = (i: number) => (lastOfStrand(i) ? RIBBON_SIZE.coil : RIBBON_SIZE[kind(i)]);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out: RibbonPoint[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [a, b, c, d] = [ctrl(i - 1), ctrl(i), ctrl(i + 1), ctrl(i + 2)];
    const last = i === n - 2;
    for (let s = 0; s <= (last ? steps : steps - 1); s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      // (the uniform cubic B-spline's point and its way along, over its four control points)
      const u = 1 - t;
      const pt = a.clone().multiplyScalar(u * u * u)
        .addScaledVector(b, 3 * t3 - 6 * t2 + 4)
        .addScaledVector(c, -3 * t3 + 3 * t2 + 3 * t + 1)
        .addScaledVector(d, t3)
        .multiplyScalar(1 / 6);
      const along = a.clone().multiplyScalar(-u * u)
        .addScaledVector(b, 3 * t2 - 4 * t)
        .addScaledVector(c, -3 * t2 + 2 * t + 1)
        .addScaledVector(d, t2)
        .normalize();
      const g = guides[i].clone().lerp(guides[i + 1], t);
      let across = g.sub(along.clone().multiplyScalar(g.dot(along)));
      if (across.lengthSq() < 1e-12) across = new THREE.Vector3(0, 0, 1).cross(along);
      if (across.lengthSq() < 1e-12) across = new THREE.Vector3(0, 1, 0).cross(along);
      across.normalize();
      // how wide: a strand's arrowhead from its widest down to a tube; else
      // going over from one residue's size to the next's
      let w: number;
      let h: number;
      if (kind(i) === "strand" && lastOfStrand(i + 1)) {
        w = RIBBON_SIZE.arrow + (RIBBON_SIZE.coil.w - RIBBON_SIZE.arrow) * t;
        h = RIBBON_SIZE.strand.h + (RIBBON_SIZE.coil.h - RIBBON_SIZE.strand.h) * t;
      } else {
        const u = smooth(t);
        const from = size(i);
        const to = size(i + 1);
        w = from.w + (to.w - from.w) * u;
        h = from.h + (to.h - from.h) * u;
      }
      const near = t < 0.5 ? i : i + 1;
      out.push({ at: pt, along, across, w: w * scale * k, h: h * scale * k, colour: colours[near], residue: run.residues[near] });
    }
  }
  return out;
}

/** A ribbon as triangles: where each corner is, which way it faces, its colour, and the residue each is of. */
export type RibbonMesh = { positions: Float32Array; normals: Float32Array; colours: Float32Array; indices: Uint32Array; residues: Int32Array };

/** The ribbons of a molecule's runs, drawn round their points (`ribbonPoints`): a band of `SIDES` sides, each end closed. */
export function ribbonMesh(places: ArrayLike<number>, runs: readonly ChainRun[], bp: Biopolymer, by: RibbonColours, scale: number, k: number): RibbonMesh {
  const chainIndex = chainsOf(bp);
  const lines = runs.map((run) => ribbonPoints(places, run, bp, by, scale, k, STEPS, chainIndex)).filter((l) => l.length >= 2);
  const count = lines.reduce((s, l) => s + l.length * SIDES + 2, 0);
  const tris = lines.reduce((s, l) => s + (l.length - 1) * SIDES * 2 + 2 * SIDES, 0);
  const positions = new Float32Array(3 * count);
  const normals = new Float32Array(3 * count);
  const colours = new Float32Array(3 * count);
  const residues = new Int32Array(count);
  const indices = new Uint32Array(3 * tris);
  let v = 0;
  let f = 0;
  const put = (pos: THREE.Vector3, nor: THREE.Vector3, col: THREE.Color, residue: number) => {
    pos.toArray(positions, 3 * v);
    nor.toArray(normals, 3 * v);
    colours[3 * v] = col.r;
    colours[3 * v + 1] = col.g;
    colours[3 * v + 2] = col.b;
    residues[v] = residue;
    return v++;
  };
  const tri = (a: number, b: number, c: number) => {
    indices[3 * f] = a;
    indices[3 * f + 1] = b;
    indices[3 * f + 2] = c;
    f++;
  };
  for (const line of lines) {
    const first = v;
    for (const pt of line) {
      const up = pt.along.clone().cross(pt.across);
      const hw = Math.max(pt.w / 2, 1e-6);
      const hh = Math.max(pt.h / 2, 1e-6);
      for (let s = 0; s < SIDES; s++) {
        const th = (2 * Math.PI * s) / SIDES;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const pos = pt.at.clone().addScaledVector(pt.across, c * hw).addScaledVector(up, sn * hh);
        // (square to an ellipse's edge)
        const nor = pt.across.clone().multiplyScalar(c / hw).addScaledVector(up, sn / hh).normalize();
        put(pos, nor, pt.colour, pt.residue);
      }
    }
    for (let j = 0; j < line.length - 1; j++) {
      for (let s = 0; s < SIDES; s++) {
        const a = first + j * SIDES + s;
        const b = first + j * SIDES + ((s + 1) % SIDES);
        // (anticlockwise seen from outside, as its normals face: glTF's and three's front - 3.7.2.1)
        tri(a, b, a + SIDES);
        tri(b, b + SIDES, a + SIDES);
      }
    }
    // (each end closed)
    const ends: [number, number][] = [
      [0, -1],
      [line.length - 1, 1],
    ];
    for (const [j, sign] of ends) {
      const pt = line[j];
      const centre = put(pt.at.clone(), pt.along.clone().multiplyScalar(sign), pt.colour, pt.residue);
      for (let s = 0; s < SIDES; s++) {
        const a = first + j * SIDES + s;
        const b = first + j * SIDES + ((s + 1) % SIDES);
        if (sign < 0) tri(centre, b, a);
        else tri(centre, a, b);
      }
    }
  }
  return { positions, normals, colours, indices, residues };
}

/**
 * A ribbon's residues as spheres, each round its own corners: what the
 * pointer is found over, a residue at a time - a protein's ribbons are
 * hundreds of thousands of triangles, too many to try one by one as the
 * pointer moves, or as the view moves under it.
 */
export type RibbonSpheres = { residues: Int32Array; centres: Float32Array; radii: Float32Array };

export function ribbonSpheres(m: Pick<RibbonMesh, "positions" | "residues">): RibbonSpheres {
  const slot = new Map<number, number>();
  for (const r of m.residues) if (!slot.has(r)) slot.set(r, slot.size);
  const n = slot.size;
  const centres = new Float64Array(3 * n);
  const counts = new Uint32Array(n);
  m.residues.forEach((r, v) => {
    const k = slot.get(r)!;
    for (let a = 0; a < 3; a++) centres[3 * k + a] += m.positions[3 * v + a];
    counts[k]++;
  });
  for (let k = 0; k < n; k++) for (let a = 0; a < 3; a++) centres[3 * k + a] /= counts[k];
  const radii = new Float32Array(n);
  m.residues.forEach((r, v) => {
    const k = slot.get(r)!;
    const d = Math.hypot(m.positions[3 * v] - centres[3 * k], m.positions[3 * v + 1] - centres[3 * k + 1], m.positions[3 * v + 2] - centres[3 * k + 2]);
    if (d > radii[k]) radii[k] = d;
  });
  return { residues: Int32Array.from(slot.keys()), centres: Float32Array.from(centres), radii };
}

const near = new THREE.Vector3();
const centre = new THREE.Vector3();

/** The residue a ray meets first among a ribbon's spheres, in the ribbon's own frame, where along the ray, and the point; none, where it meets none. */
export function residueOnRay(s: RibbonSpheres, ray: THREE.Ray): { residue: number; distance: number; point: THREE.Vector3 } | null {
  let best: { residue: number; distance: number } | null = null;
  for (let k = 0; k < s.residues.length; k++) {
    centre.fromArray(s.centres, 3 * k);
    const along = centre.clone().sub(ray.origin).dot(ray.direction);
    ray.at(along, near);
    const off = near.distanceToSquared(centre);
    const r2 = s.radii[k] * s.radii[k];
    if (off > r2) continue;
    // (where the ray enters the sphere)
    const t = along - Math.sqrt(r2 - off);
    if (t < 0 && along < 0) continue;
    if (!best || t < best.distance) best = { residue: s.residues[k], distance: t };
  }
  return best ? { ...best, point: ray.at(best.distance, new THREE.Vector3()) } : null;
}
