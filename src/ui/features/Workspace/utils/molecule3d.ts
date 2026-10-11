import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { atomColour, atomRadius, bondRadiusOf, hiddenAtoms, hidesCarbonHydrogens, HIDDEN_MARK, HIDDEN_MARK_COLOUR, ribbonsOf, type Role3D, type Style3D } from "../../../../lib/chem/style3d";
import { chainRuns } from "../../../../lib/chem/biopolymer";
import { ribbonPoints } from "./ribbon";
import type { MeasureMark, SolidMark } from "../../../../lib/chem/layout2d";
import { seenAt, type Eye } from "./page";
import type { Carried3D, Molecule3D, Turn3D } from "../store/types";
import type { ParsedBond } from "../../../../lib/chem/molecule";
import { bondsByDistance } from "../../../../utils/structureParsers";

/** How far a ribbon reaches about its chain's backbone, at the most - a strand's arrowhead's half width - in ångströms. */
export const RIBBON_REACH = 1.3;

/** World units to the ångström: a bond of 1.5 Å as long as a drawn bond. */
export const WORLD_PER_ANGSTROM = NOMINAL_BOND_LENGTH / 1.5;

/** RT at 298.15 K, in hartrees: the energy a conformer's population falls by e for. */
const RT_HARTREE = (8.314462618 * 298.15) / 2625499.6;

/**
 * The widest way out from a point between the ways to its neighbours, given
 * as angles: halfway across the widest gap between them, as a unit vector.
 * Straight away from a lone neighbour; up and to the right with none (on a
 * screen, y down).
 */
export function widestWay(angles: readonly number[]): { x: number; y: number } {
  if (!angles.length) return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
  const sorted = [...angles].sort((p, q) => p - q);
  let size = -1;
  let mid = 0;
  sorted.forEach((from, i) => {
    const to = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    // (an even split goes up, as a label would sooner sit)
    if (to - from > size + 1e-9 || (Math.abs(to - from - size) <= 1e-9 && Math.sin((from + to) / 2) < Math.sin(mid))) {
      size = to - from;
      mid = (from + to) / 2;
    }
  });
  return { x: Math.cos(mid), y: Math.sin(mid) };
}

/** A label's box on the screen: its middle, and half its width and height. */
export type LabelBox = { x: number; y: number; hx: number; hy: number };

/** How far apart the ways round a point are that a label is tried in. */
const LABEL_STEP = Math.PI / 12;

/** How far from `o` a box of half size `half` stands, its middle the way `u` (a unit vector), for its nearest point to be `reach` from `o`. */
function standOff(u: { x: number; y: number }, half: { x: number; y: number }, reach: number): number {
  const gap = (t: number) => Math.hypot(Math.max(t * Math.abs(u.x) - half.x, 0), Math.max(t * Math.abs(u.y) - half.y, 0));
  let lo = 0;
  let hi = 2 * (reach + half.x + half.y);
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) < reach) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** A bond as a label keeps clear of it on the screen: its ends, and how far either side of its line it is drawn. */
export type Stick = { a: { x: number; y: number }; b: { x: number; y: number }; r: number };

/**
 * How much a label lying over a bond counts against its place, for each
 * pixel of the bond it covers: an atom hidden counts for far more, but a
 * label over a stick is still in the way of reading the molecule.
 */
const STICK_WEIGHT = 0.25;

/** How much of a stick's line lies within a box, the box grown by the stick's half width. */
export function coveredLength(box: LabelBox, s: Stick): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  let t0 = 0;
  let t1 = 1;
  // (the line clipped to the box, one side at a time)
  const sides: [number, number][] = [
    [-dx, s.a.x - (box.x - box.hx - s.r)],
    [dx, box.x + box.hx + s.r - s.a.x],
    [-dy, s.a.y - (box.y - box.hy - s.r)],
    [dy, box.y + box.hy + s.r - s.a.y],
  ];
  for (const [p, q] of sides) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}

/**
 * Where a label of half size `half` stands off a point `o` on the screen - an
 * atom, or a bond's middle - its nearest edge `reach` from it, and clear of
 * the balls (atoms, as circles), the labels already placed about it and the
 * sticks (bonds) where it can be: the way `preferred` - the widest gap
 * between its bonds - when that is clear, or else the clear way nearest it;
 * or a little further out, the same way round; or else where it hides
 * least. A ball hidden outright counts for more than two touched at their
 * edges, and either for more than a bond covered.
 */
export function labelSpot(
  o: { x: number; y: number },
  reach: number,
  half: { x: number; y: number },
  preferred: { x: number; y: number },
  balls: readonly { x: number; y: number; r: number }[],
  placed: readonly LabelBox[],
  sticks: readonly Stick[] = [],
): LabelBox {
  const start = Math.atan2(preferred.y, preferred.x);
  let best: { box: LabelBox; hides: number } | null = null;
  for (const out of [reach, reach + half.y]) {
    for (let k = 0; k < 24; k++) {
      // (the preferred way, then a step either side of it, and so on round)
      const a = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * LABEL_STEP;
      const u = { x: Math.cos(a), y: Math.sin(a) };
      const t = standOff(u, half, out);
      const box = { x: o.x + u.x * t, y: o.y + u.y * t, hx: half.x, hy: half.y };
      let hides = 0;
      for (const b of balls) {
        const dx = Math.max(Math.abs(b.x - box.x) - box.hx, 0);
        const dy = Math.max(Math.abs(b.y - box.y) - box.hy, 0);
        // (how far into it, against how large it is: as good as all of a
        // small one hidden counts as much as all of a large one)
        const depth = Math.min(Math.max(0, b.r - Math.hypot(dx, dy)), 2 * b.r);
        hides += b.r > 0 ? (depth * depth) / b.r : 0;
      }
      for (const p of placed) {
        const ox = box.hx + p.hx - Math.abs(box.x - p.x);
        const oy = box.hy + p.hy - Math.abs(box.y - p.y);
        if (ox > 0 && oy > 0) hides += 2 * Math.min(ox, oy);
      }
      for (const st of sticks) hides += STICK_WEIGHT * coveredLength(box, st);
      if (hides < 0.05) return box;
      if (!best || hides < best.hides) best = { box, hides };
    }
  }
  return best!.box;
}

/**
 * How much of a conformer set each conformer is at room temperature (298 K),
 * by Boltzmann: from its energy in hartrees, the shares adding up to one.
 */
export function populations(energies: readonly number[]): number[] {
  if (!energies.length) return [];
  const lowest = Math.min(...energies);
  const w = energies.map((e) => Math.exp(-(e - lowest) / RT_HARTREE));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/** How a molecule in 3D is drawn: in the 3D style's primary look, or its secondary. */
export type Look = Role3D;

/** The look a molecule is drawn in: its secondary, where it has been switched to it; else the primary. */
export function lookOf(m: Pick<Molecule3D, "look">): Look {
  return m.look ?? "primary";
}

/** A molecule in 3D as it is drawn, frame by frame: about its centre, in world units. */
export type Solid = {
  /** Each frame's atoms about that frame's own centre: x, y and z in turn. */
  frames: Float32Array[];
  /** Each atom's radius as each look draws it: none, where the look leaves it out (`hidden`). */
  radii: Record<Look, Float32Array>;
  /** The atoms each look leaves out - those its ribbons stand for, the hydrogens on carbon where it hides them: 1, left out. */
  hidden: Record<Look, Uint8Array>;
  /** Whether each look leaves out hydrogens on carbon it would draw: the molecule says so (`HIDDEN_MARK`). */
  hidesH: Record<Look, boolean>;
  /** Whether each look draws its chains as ribbons (Ribbon3D). */
  ribbons: Record<Look, boolean>;
  /**
   * How far each atom reaches as each look draws it - its ball; or, a
   * chain's backbone atom where the chain is a ribbon, the ribbon's half
   * width about it: what the molecule is found by under the pointer, and
   * what room it takes.
   */
  extent: Record<Look, Float32Array>;
  /** How far it reaches from its centre in any frame, all each look draws. */
  reach: Record<Look, number>;
};

// (by its atoms, which a move, a new look or a measurement leave as they were)
const solids = new WeakMap<object, WeakMap<Style3D, { frames: unknown; solid: Solid }>>();

/** Each atom's place in a frame, about the frame's centre, in world units. */
function placesOf(xyz: ArrayLike<number>, n: number): Float32Array {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += xyz[3 * i];
    cy += xyz[3 * i + 1];
    cz += xyz[3 * i + 2];
  }
  if (n) {
    cx /= n;
    cy /= n;
    cz /= n;
  }
  const k = WORLD_PER_ANGSTROM;
  const local = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    local[3 * i] = (xyz[3 * i] - cx) * k;
    local[3 * i + 1] = (xyz[3 * i + 1] - cy) * k;
    local[3 * i + 2] = (xyz[3 * i + 2] - cz) * k;
  }
  return local;
}

export function solidOf(m: Molecule3D, style: Style3D): Solid {
  let byStyle = solids.get(m.atoms);
  if (!byStyle) solids.set(m.atoms, (byStyle = new WeakMap()));
  const known = byStyle.get(style);
  if (known && known.frames === m.frames) return known.solid;
  const n = m.atoms.length;
  const first = m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  // (a frame that does not hold every atom is left out)
  const frames = [first, ...(m.frames ?? []).filter((f) => f.length === 3 * n)].map((f) => placesOf(f, n));
  const k = WORLD_PER_ANGSTROM;
  const hidden = { primary: hiddenAtoms(m, style.primary), secondary: hiddenAtoms(m, style.secondary) };
  const radiiOf = (look: Look) => Float32Array.from(m.atoms, (a, i) => (hidden[look][i] ? 0 : atomRadius(a.el, style[look]) * k));
  const radii = { primary: radiiOf("primary"), secondary: radiiOf("secondary") };
  const ribbons = { primary: ribbonsOf(m, style.primary), secondary: ribbonsOf(m, style.secondary) };
  // (a ribbon's backbone atoms reach as far as the ribbon does about them)
  const traces = m.biopolymer && (ribbons.primary || ribbons.secondary) ? chainRuns(m.biopolymer, m.atoms).flatMap((r) => r.trace) : [];
  const extentOf = (look: Look) => {
    const e = Float32Array.from(radii[look]);
    if (ribbons[look]) for (const i of traces) e[i] = Math.max(e[i], RIBBON_REACH * k);
    return e;
  };
  const extent = { primary: extentOf("primary"), secondary: extentOf("secondary") };
  const reachOf = (r: Float32Array) => {
    let reach = 0;
    for (const f of frames) {
      for (let i = 0; i < n; i++) if (r[i] > 0) reach = Math.max(reach, Math.hypot(f[3 * i], f[3 * i + 1], f[3 * i + 2]) + r[i]);
    }
    return reach;
  };
  const hidesH = { primary: hidesCarbonHydrogens(m, style.primary), secondary: hidesCarbonHydrogens(m, style.secondary) };
  const solid = { frames, radii, hidden, hidesH, ribbons, extent, reach: { primary: reachOf(extent.primary), secondary: reachOf(extent.secondary) } };
  byStyle.set(style, { frames: m.frames, solid });
  return solid;
}

/**
 * A molecule's bonds frame by frame, where they are where its atoms stand
 * close enough (`bondsFrom`): every bond any of its frames has, and which
 * of them each frame has - a bond forming and breaking along a reaction's
 * path or an optimisation. Null for a molecule whose bonds its file gave,
 * or which has one frame: its bonds are its bonds.
 */
export type FrameBonds = { bonds: ParsedBond[]; present: Uint8Array[] };
const frameBonds = new WeakMap<Molecule3D["atoms"], { frames: Molecule3D["frames"]; v: FrameBonds | null }>();

export function frameBondsOf(m: Pick<Molecule3D, "atoms" | "bonds" | "frames" | "bondsFrom">): FrameBonds | null {
  if (m.bondsFrom !== "distance" || !m.frames?.length) return null;
  const known = frameBonds.get(m.atoms);
  if (known && known.frames === m.frames) return known.v;
  const n = m.atoms.length;
  const xyzs = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...m.frames.filter((f) => f.length === 3 * n)];
  const index = new Map<string, number>();
  const bonds: ParsedBond[] = [];
  const each = xyzs.map((xyz) =>
    bondsByDistance(m.atoms.map((a, i) => ({ el: a.el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }))).map((b) => {
      const key = `${b.a1} ${b.a2}`;
      let k = index.get(key);
      if (k === undefined) {
        k = bonds.length;
        index.set(key, k);
        bonds.push(b);
      }
      return k;
    }),
  );
  const present = each.map((ks) => {
    const there = new Uint8Array(bonds.length);
    for (const k of ks) there[k] = 1;
    return there;
  });
  const v = { bonds, present };
  frameBonds.set(m.atoms, { frames: m.frames, v });
  return v;
}

/** A molecule's bonds in one of its frames: those that frame has, where they go frame by frame; else its bonds. */
export function bondsAt(m: Pick<Molecule3D, "atoms" | "bonds" | "frames" | "bondsFrom">, frame = 0): ParsedBond[] {
  const fb = frameBondsOf(m);
  if (!fb) return m.bonds;
  const there = fb.present[Math.min(Math.max(0, Math.round(frame)), fb.present.length - 1)];
  return fb.bonds.filter((_, i) => there[i]);
}

/** The frame a molecule shows, kept to the frames it has. */
export function frameOf(s: Solid, frame: number | undefined): number {
  return Math.min(Math.max(0, Math.round(frame ?? 0)), s.frames.length - 1);
}

/**
 * How high above the page a molecule's centre stands: as far as it reaches,
 * so that however it is turned none of it passes behind the page.
 */
export function standingHeight(s: Solid, look: Look = "primary"): number {
  return s.reach[look];
}

/**
 * How high above the page a molecule's centre is: where a turn of several as
 * one body put it, or else as high as it reaches.
 */
export function heightOf(m: Pick<Molecule3D, "at">, s: Solid, look: Look = "primary"): number {
  return m.at.z ?? standingHeight(s, look);
}

/**
 * A molecule in 3D as it stands: where on the page, how high, how turned,
 * and where its atoms are and how large, about its centre.
 */
export type Pose = {
  at: { x: number; y: number };
  height: number;
  turn?: Turn3D;
  places: Float32Array;
  radii: Float32Array;
};

/** A molecule as it stands in a frame, in a look, turned as it is. */
export function poseOf(m: Molecule3D, s: Solid, look: Look, turn?: Turn3D, frame?: number): Pose {
  return { at: m.at, height: heightOf(m, s, look), turn, places: s.frames[frameOf(s, frame)], radii: s.extent[look] };
}

/** An atom or a bond's end as the camera sees it, taken back to the page: where, how large, how high, and how much larger than it is (`seenAt`). */
type Seen = { x: number; y: number; r: number; z: number; k: number };

/**
 * Each atom as the camera sees it, taken back to the page (`seenAt`):
 * straight below it, as large as it is, by an orthographic camera - the
 * canvas's - or, from an `eye` in perspective, out from under it and larger
 * the nearer it stands.
 */
export function seenOnPage(pose: Pose, eye?: Eye): Seen[] {
  const q = pose.turn ? new THREE.Quaternion(...pose.turn) : new THREE.Quaternion();
  const p = new THREE.Vector3();
  const seen: Seen[] = [];
  for (let i = 0; i < pose.radii.length; i++) {
    p.set(pose.places[3 * i], pose.places[3 * i + 1], pose.places[3 * i + 2]).applyQuaternion(q);
    const z = pose.height + p.z;
    const at = seenAt(pose.at.x + p.x, pose.at.y + p.y, z, eye);
    seen.push({ x: at.x, y: at.y, r: pose.radii[i] * at.k, z, k: at.k });
  }
  return seen;
}

/**
 * How far a molecule reaches on the page, as it is turned and shown now, as
 * a camera sees it (`seenOnPage`): what a fit makes room for.
 */
export function seenBounds(pose: Pose, eye?: Eye): { minX: number; maxX: number; minY: number; maxY: number } {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const { x, y, r } of seenOnPage(pose, eye)) {
    // (an atom its look leaves out takes no room)
    if (r <= 0) continue;
    b.minX = Math.min(b.minX, x - r);
    b.maxX = Math.max(b.maxX, x + r);
    b.minY = Math.min(b.minY, y - r);
    b.maxY = Math.max(b.maxY, y + r);
  }
  return b;
}

/**
 * How far a molecule reaches on the page about its middle, in any of its
 * frames, as it stands turned by `turn` (unset, unturned): left, right,
 * down and up - what a set holding it makes room for.
 */
export function reachOverFrames(m: Molecule3D, style: Style3D, turn?: Turn3D): { x0: number; x1: number; y0: number; y1: number } {
  const solid = solidOf(m, style);
  const look = lookOf(m);
  const r = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let f = 0; f < solid.frames.length; f++) {
    const b = seenBounds(poseOf({ ...m, at: { x: 0, y: 0 } }, solid, look, turn, f));
    r.x0 = Math.min(r.x0, b.minX);
    r.x1 = Math.max(r.x1, b.maxX);
    r.y0 = Math.min(r.y0, b.minY);
    r.y1 = Math.max(r.y1, b.maxY);
  }
  return r;
}

/** The atom seen at a point of the page, the nearest of those there; null where there is none. */
export function atomAt(pose: Pose, eye: Eye | undefined, x: number, y: number): number | null {
  let best: number | null = null;
  let z = -Infinity;
  seenOnPage(pose, eye).forEach((a, i) => {
    if (Math.hypot(x - a.x, y - a.y) <= a.r && a.z > z) {
      best = i;
      z = a.z;
    }
  });
  return best;
}

/** How many lines a bond is drawn with in 3D: a double bond two, a triple three, any other one. */
export function linesOf(order: number): number {
  return order === 2 ? 2 : order === 3 ? 3 : 1;
}

/** One line of a bond: from where to where, how thick. */
export type BondLine = { a: THREE.Vector3; b: THREE.Vector3; r: number };

/**
 * Each bond's lines, from atom to atom about the molecule's centre: a single
 * bond one, of radius `r`; a double bond two, and a triple three, thinner,
 * side by side - in the plane of a neighbouring atom, so that a double bond
 * lies in the plane its atoms make.
 */
export function bondLines(m: Molecule3D, places: Float32Array, r: number): BondLine[] {
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
  }
  const at = (i: number) => new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
  const lines: BondLine[] = [];
  for (const bond of m.bonds) {
    const a = at(bond.a1);
    const b = at(bond.a2);
    const n = linesOf(bond.order);
    if (n === 1) {
      lines.push({ a, b, r });
      continue;
    }
    const along = b.clone().sub(a).normalize();
    // across: towards a neighbour of either end, square to the bond
    let across: THREE.Vector3 | null = null;
    for (const [from, other] of [
      [bond.a1, bond.a2],
      [bond.a2, bond.a1],
    ]) {
      for (const c of near[from]) {
        if (c === other) continue;
        const v = at(c).sub(at(from));
        v.addScaledVector(along, -v.dot(along));
        if (v.lengthSq() > 1e-6) {
          across = v.normalize();
          break;
        }
      }
      if (across) break;
    }
    // (none: any way square to it)
    if (!across) {
      across = new THREE.Vector3(0, 0, 1).cross(along);
      if (across.lengthSq() < 1e-6) across = new THREE.Vector3(0, 1, 0).cross(along);
      across.normalize();
    }
    const thin = r * BOND_LINE;
    const gap = r * BOND_GAP;
    const offsets = n === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    for (const o of offsets) lines.push({ a: a.clone().addScaledVector(across, o), b: b.clone().addScaledVector(across, o), r: thin });
  }
  return lines;
}

/** A double or triple bond's lines: how thick, and how far apart, as a part of a single bond's radius. */
const BOND_LINE = 0.62;
const BOND_GAP = 2.4;

/** How far a bond's lines reach from its axis, a single bond's radius being `r`. */
export function bondReach(order: number, r: number): number {
  const n = linesOf(order);
  return n === 1 ? r : r * ((n === 2 ? BOND_GAP / 2 : BOND_GAP) + BOND_LINE);
}

const rings = new WeakMap<object, number[][]>();

/**
 * A molecule's small rings, of up to eight atoms: for each bond, the
 * shortest way round from one end to the other without it.
 */
export function ringsOf(m: Molecule3D): number[][] {
  const known = rings.get(m.bonds);
  if (known) return known;
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
  }
  const found = new Map<string, number[]>();
  for (const b of m.bonds) {
    const from = new Map<number, number>([[b.a1, -1]]);
    let edge = [b.a1];
    for (let depth = 0; depth < 7 && !from.has(b.a2); depth++) {
      const next: number[] = [];
      for (const a of edge) {
        for (const c of near[a]) {
          if (from.has(c) || (a === b.a1 && c === b.a2)) continue;
          from.set(c, a);
          next.push(c);
        }
      }
      edge = next;
    }
    if (!from.has(b.a2)) continue;
    const ring: number[] = [];
    for (let a = b.a2; a !== -1; a = from.get(a)!) ring.push(a);
    const key = [...ring].sort((x, y) => x - y).join(",");
    if (!found.has(key)) found.set(key, ring);
  }
  const all = [...found.values()];
  rings.set(m.bonds, all);
  return all;
}

/**
 * How far outside its outline a press is still on a molecule, in pixels:
 * a press there turns it, as one on it does - room enough round a small
 * molecule to take hold of it without aiming (the maintainer, 2026-10-07:
 * two sizes larger than the 4 px it was).
 */
export const BODY_PX = 16;

function toSegment(px: number, py: number, a: Seen, b: Seen): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / Math.max(dx * dx + dy * dy, 1e-12)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function inPolygon(px: number, py: number, pts: Seen[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Whether a point of the page is on a molecule in 3D, as it is seen: on its
 * atoms, its bonds, within its rings, or just outside its outline.
 */
export function onMolecule(
  m: Molecule3D,
  pose: Pose,
  eye: Eye | undefined,
  x: number,
  y: number,
  zoom: number,
  bondRadius: number,
): boolean {
  const seen = seenOnPage(pose, eye);
  // (quickly: nothing near enough to the molecule at all)
  const reach = BODY_PX / zoom;
  let d = Infinity;
  for (const a of seen) if (a.r > 0) d = Math.min(d, Math.hypot(x - a.x, y - a.y) - a.r);
  if (d > reach + 2 * NOMINAL_BOND_LENGTH) return false;
  for (const b of m.bonds) {
    const a1 = seen[b.a1], a2 = seen[b.a2];
    // (a bond to an atom its look leaves out is left out with it)
    if (!(pose.radii[b.a1] > 0 && pose.radii[b.a2] > 0)) continue;
    const r = bondRadius * WORLD_PER_ANGSTROM * ((a1.k + a2.k) / 2);
    d = Math.min(d, toSegment(x, y, a1, a2) - r);
  }
  if (d > 0 && ringsOf(m).some((ring) => inPolygon(x, y, ring.map((i) => seen[i])))) d = 0;
  return d <= reach;
}

/**
 * The bond seen at a point of the page - within its stick, the nearest of
 * those there - or null; in balls and sticks, where a molecule has sticks.
 */
export function bondAt(m: Molecule3D, pose: Pose, eye: Eye | undefined, x: number, y: number, bondRadius: number): number | null {
  const seen = seenOnPage(pose, eye);
  let best: number | null = null;
  let z = -Infinity;
  m.bonds.forEach((b, i) => {
    const a1 = seen[b.a1], a2 = seen[b.a2];
    if (!(pose.radii[b.a1] > 0 && pose.radii[b.a2] > 0)) return;
    const r = bondRadius * WORLD_PER_ANGSTROM * ((a1.k + a2.k) / 2);
    const mid = (a1.z + a2.z) / 2;
    if (toSegment(x, y, a1, a2) <= r && mid > z) {
      best = i;
      z = mid;
    }
  });
  return best;
}

/** The atom whose centre is seen nearest a point of the page. */
export function nearestAtom(pose: Pose, eye: Eye | undefined, x: number, y: number): number {
  let best = 0;
  let far = Infinity;
  seenOnPage(pose, eye).forEach((a, i) => {
    const d = Math.hypot(x - a.x, y - a.y);
    if (d < far && a.r > 0) {
      far = d;
      best = i;
    }
  });
  return best;
}

/**
 * The atoms a measurement of what is chosen in a molecule is of, in order:
 * atoms alone, as they were chosen; bonds, the way along them - one bond its
 * two atoms, two meeting at an atom the angle there, three in a row the
 * torsion angle along them - with an atom chosen besides going on from
 * either end it is bonded to. Null where they make no measurement.
 */
export function chosenPath(m: Pick<Molecule3D, "bonds">, chosen: { atoms: number[]; bonds: number[] }): number[] | null {
  const { atoms, bonds } = chosen;
  if (!bonds.length) return atoms.length >= 2 && atoms.length <= 4 ? [...atoms] : null;
  // the bonds' way, from one end to the other
  const ends = bonds.map((i) => m.bonds[i]).filter(Boolean).map((b) => [b.a1, b.a2]);
  if (ends.length !== bonds.length) return null;
  let path = [...ends[0]];
  const left = ends.slice(1);
  while (left.length) {
    const k = left.findIndex(([a, b]) => a === path[0] || b === path[0] || a === path[path.length - 1] || b === path[path.length - 1]);
    if (k < 0) return null;
    const [a, b] = left.splice(k, 1)[0];
    if (a === path[path.length - 1]) path = [...path, b];
    else if (b === path[path.length - 1]) path = [...path, a];
    else if (a === path[0]) path = [b, ...path];
    else path = [a, ...path];
  }
  // an atom besides, bonded to an end, goes on from it
  const bonded = (p: number, q: number) => m.bonds.some((b) => (b.a1 === p && b.a2 === q) || (b.a1 === q && b.a2 === p));
  for (const a of atoms) {
    if (path.includes(a)) continue;
    if (bonded(a, path[path.length - 1])) path = [...path, a];
    else if (bonded(a, path[0])) path = [a, ...path];
    else return null;
  }
  return new Set(path).size === path.length && path.length >= 2 && path.length <= 4 ? path : null;
}

/** A molecule in 3D as a turn takes it: where it stands, how high, how it is turned, and how high it stands alone. */
export type Turning3D = { id: number; at: { x: number; y: number; z?: number }; turn?: Turn3D; standing: number };
/** Where a turn leaves a molecule - how high, where it set that - and how it leaves it turned. */
export type Turned3D = { id: number; at: { x: number; y: number; z?: number }; turn: Turn3D };

const turnOf = (q: THREE.Quaternion): Turn3D => [q.x, q.y, q.z, q.w];

/**
 * Molecules turned together by `q`, as one body, about their common centre:
 * each carried round it and turned with it, and the whole then raised or
 * lowered so that it rests on the page - the lowest of them, for how far it
 * reaches, as high as it would stand alone, and none behind the page.
 */
export function turnedTogether(ms: readonly Turning3D[], q: THREE.Quaternion): (Turned3D & { at: { z: number } })[] {
  if (!ms.length) return [];
  const heights = ms.map((m) => m.at.z ?? m.standing);
  const c = new THREE.Vector3(
    ms.reduce((a, m) => a + m.at.x, 0) / ms.length,
    ms.reduce((a, m) => a + m.at.y, 0) / ms.length,
    heights.reduce((a, h) => a + h, 0) / ms.length,
  );
  const placed = ms.map((m, i) => {
    const r = new THREE.Vector3(m.at.x, m.at.y, heights[i]).sub(c).applyQuaternion(q).add(c);
    const turn = q.clone().multiply(m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion()).normalize();
    return { id: m.id, at: { x: r.x, y: r.y, z: r.z }, turn: turnOf(turn) };
  });
  const lift = -Math.min(...placed.map((p, i) => p.at.z - ms[i].standing));
  return placed.map((p) => ({ ...p, at: { ...p.at, z: p.at.z + lift } }));
}

/**
 * Molecules turned with a drawing in its plane, by `angle` (radians,
 * anticlockwise) about `about`: each carried round it and turned with it,
 * as high as it was.
 */
export function turnedInPlane(ms: readonly Turning3D[], about: { x: number; y: number }, angle: number): Turned3D[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  return ms.map((m) => {
    const dx = m.at.x - about.x;
    const dy = m.at.y - about.y;
    const turn = q.clone().multiply(m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion()).normalize();
    return {
      id: m.id,
      at: { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c, ...(m.at.z != null ? { z: m.at.z } : {}) },
      turn: turnOf(turn),
    };
  });
}

/** Where molecules in 3D stand when placed in a row about a point, each clear of the next. */
export function rowAbout(at: { x: number; y: number }, reaches: number[]): { x: number; y: number }[] {
  const gap = NOMINAL_BOND_LENGTH;
  const width = reaches.reduce((w, r) => w + 2 * r, 0) + gap * Math.max(0, reaches.length - 1);
  let x = at.x - width / 2;
  return reaches.map((r) => {
    const c = { x: x + r, y: at.y };
    x += 2 * r + gap;
    return c;
  });
}

/** Where molecules in 3D stand placed in a row to the right of `left`, about the height `y`. */
export function rowAfter(left: number, y: number, reaches: number[]): { x: number; y: number }[] {
  const width = reaches.reduce((w, r) => w + 2 * r, 0) + NOMINAL_BOND_LENGTH * Math.max(0, reaches.length - 1);
  return rowAbout({ x: left + width / 2, y }, reaches);
}

/**
 * A molecule in 3D as it is seen, for another program: the frame it shows,
 * turned as it is, about its centre - placed where it stands on the page,
 * `placed`, so that several keep their places side by side, and those turned
 * together as one body their heights too - in ångströms.
 */
export function asSeen(
  m: Pick<Molecule3D, "atoms" | "frames" | "at">,
  turn?: Turn3D,
  frame?: number,
  placed = false,
): { el: string; x: number; y: number; z: number; charge?: number; isotope?: number }[] {
  const n = m.atoms.length;
  const frames = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? []).filter((f) => f.length === 3 * n)];
  const xyz = frames[Math.min(Math.max(0, Math.round(frame ?? 0)), frames.length - 1)];
  const local = placesOf(xyz, n);
  const q = turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion();
  const k = WORLD_PER_ANGSTROM;
  const v = new THREE.Vector3();
  return m.atoms.map((a, i) => {
    v.set(local[3 * i], local[3 * i + 1], local[3 * i + 2]).applyQuaternion(q).divideScalar(k);
    if (placed) {
      v.x += m.at.x / k;
      v.y += m.at.y / k;
      v.z += (m.at.z ?? 0) / k;
    }
    return { el: a.el, x: v.x, y: v.y, z: v.z, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}) };
  });
}

/**
 * A molecule in 3D as a picture shows it - turned, in the frame and the look
 * it is shown in, seen as the canvas sees it: straight from above
 * (orthographic), or from an `eye` in perspective - as balls and sticks
 * from the back forward, in world units on the page. A stick is cut back at each end to where its atom's ball covers it,
 * so that one going back into a ball does not show over it.
 */
export function pictureMarks(m: Carried3D, style: Style3D, eye?: Eye): SolidMark[] {
  const look = lookOf(m);
  const drawn = style[look];
  const solid = solidOf({ ...m, id: 0 } as Molecule3D, style);
  const places = solid.frames[frameOf(solid, m.frame)];
  const radii = solid.radii[look];
  const height = heightOf(m, solid, look);
  const q = m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion();
  const seen = (p: THREE.Vector3) => ({ ...seenAt(m.at.x + p.x, m.at.y + p.y, height + p.z, eye), z: p.z });
  const at = (i: number) => new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]).applyQuaternion(q);
  const balls = m.atoms.map((a, i) => {
    const s = seen(at(i));
    return { kind: "ball" as const, c: { x: s.x, y: s.y }, r: radii[i] * s.k, color: atomColour(a.el), z: s.z };
  });
  // (an atom its look leaves out is not drawn, nor a bond to it)
  const left = solid.hidden[look];
  const shown = balls.filter((_, i) => !left[i]);
  const marks: (SolidMark & { z: number })[] = [...shown];
  if (drawn.atoms === "balls") {
    const turned = new Float32Array(places.length);
    for (let i = 0; i < radii.length; i++) at(i).toArray(turned, 3 * i);
    const bonds = bondsAt(m, frameOf(solid, m.frame)).filter((b) => !left[b.a1] && !left[b.a2]);
    for (const line of bondLines({ ...(m as Molecule3D), id: 0, bonds }, turned, bondRadiusOf(drawn) * WORLD_PER_ANGSTROM)) {
      const a = seen(line.a);
      const b = seen(line.b);
      // (which atoms the line runs between: the nearest at each end)
      const end = (p: { x: number; y: number }) =>
        shown.reduce((best, ball) => (Math.hypot(ball.c.x - p.x, ball.c.y - p.y) < Math.hypot(best.c.x - p.x, best.c.y - p.y) ? ball : best));
      const ra = end(a).r;
      const rb = end(b).r;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= (ra + rb) * 0.9) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      marks.push({
        kind: "stick",
        a: { x: a.x + ux * ra * 0.9, y: a.y + uy * ra * 0.9 },
        b: { x: b.x - ux * rb * 0.9, y: b.y - uy * rb * 0.9 },
        width: 2 * line.r * ((a.k + b.k) / 2),
        color: drawn.bondColor,
        // (behind a ball as deep as its middle)
        z: (a.z + b.z) / 2 - 1e-4,
      });
    }
  }
  // its chains as ribbons, where its look draws them so: sticks along each
  // ribbon, as wide as it is - what a picture without WebGL shows of it,
  // and the room it takes in any picture
  if (solid.ribbons[look] && m.biopolymer) {
    const turned = new Float32Array(places.length);
    for (let i = 0; i < radii.length; i++) at(i).toArray(turned, 3 * i);
    for (const run of chainRuns(m.biopolymer, m.atoms)) {
      const line = ribbonPoints(turned, run, m.biopolymer, style.ribbonColours, 1, WORLD_PER_ANGSTROM, 2);
      for (let j = 0; j + 1 < line.length; j++) {
        const a = seen(line[j].at);
        const b = seen(line[j + 1].at);
        marks.push({ kind: "stick", a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, width: line[j].w * ((a.k + b.k) / 2), color: `#${line[j].colour.getHexString()}`, z: (a.z + b.z) / 2 });
      }
    }
  }
  return marks.sort((x, y) => x.z - y.z).map(({ z: _z, ...mark }) => mark as SolidMark);
}

/**
 * What a picture of a molecule drawn without the hydrogens on its carbons
 * says over it, as the canvas does: "C-H hidden", `size` high, centred over
 * its highest atom, on a white ground as a measurement's value is (the
 * maintainer, 2026-10-10: a picture of it carries the mark too). Null for
 * one drawn with them all.
 */
export function hiddenPictureMark(m: Carried3D, style: Style3D, size: number, eye?: Eye): MeasureMark | null {
  const solid = solidOf({ ...m, id: 0 } as Molecule3D, style);
  if (!solid.hidesH[lookOf(m)]) return null;
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of pictureMarks(m, style, eye)) {
    if (k.kind !== "ball") continue;
    x0 = Math.min(x0, k.c.x - k.r);
    x1 = Math.max(x1, k.c.x + k.r);
    y1 = Math.max(y1, k.c.y + k.r);
  }
  if (!Number.isFinite(y1)) return null;
  // (half its height above the atom, its ground half its height again)
  return { lines: [], fan: [], width: 0, fanOpacity: 0, label: { x: (x0 + x1) / 2, y: y1 + 1.15 * size }, text: HIDDEN_MARK, size, color: HIDDEN_MARK_COLOUR };
}
