/**
 * A molecule in 3D edited as a quantum-chemistry program's builder edits
 * one (docs/WORKSPACE.md, *Editing in 3D*): a distance, an angle or a
 * torsion angle set to a value, by moving the part of the molecule on the
 * side of the last atom chosen. Only its shape changes - what it is made of
 * is the drawing's business - and only in the frame it shows. Pure, over
 * x, y, z in ångströms, atom after atom.
 */
import * as THREE from "three";
import type { Molecule3D } from "../store/types";
import { kindOf, measureValue, type MeasureKind } from "./measure3d";
import { bondsAt, WORLD_PER_ANGSTROM } from "./molecule3d";

type Bonded = { atoms: readonly unknown[]; bonds: readonly { a1: number; a2: number }[] };

/** Each atom's neighbours, by index. */
function neighbours(m: Bonded): number[][] {
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    if (!near[b.a1] || !near[b.a2]) continue;
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
  }
  return near;
}

/** The atoms reached from `from` along bonds, the bond `from`-`cut` not taken, and none through `walls`. */
function reached(near: number[][], from: number, cut: number | null, walls: ReadonlySet<number> = new Set()): Set<number> {
  const seen = new Set([from]);
  const edge = [from];
  while (edge.length) {
    const a = edge.pop()!;
    for (const b of near[a]) {
      if (seen.has(b) || walls.has(b)) continue;
      if (a === from && b === cut) continue;
      seen.add(b);
      edge.push(b);
    }
  }
  return seen;
}

/**
 * An atom and what hangs on it alone: the branches off it that reach none
 * of `fixed` without going through it - a methyl's hydrogens, a hydroxyl's.
 */
function hanging(near: number[][], atom: number, fixed: ReadonlySet<number>): Set<number> {
  const out = new Set([atom]);
  for (const b of near[atom]) {
    if (fixed.has(b)) continue;
    const branch = reached(near, b, null, new Set([atom]));
    if (![...branch].some((x) => fixed.has(x))) for (const x of branch) out.add(x);
  }
  return out;
}

/**
 * The atoms a measurement of `path` (2, 3 or 4 atoms, in the order chosen)
 * moves when it is set: the part on the side of the last atom chosen - for
 * a torsion angle, of the third - cut off at the bond before it; where that
 * bond is in a ring, and cutting it parts nothing, the last atom and what
 * hangs on it alone. Atoms not bonded to the rest: the whole piece the last
 * is in, where it holds none of the others. Null where a value cannot be
 * set so: a torsion angle about a bond in a ring, or about no bond.
 */
export function movingAtoms(m: Bonded, path: readonly number[]): number[] | null {
  if (path.length < 2 || path.length > 4 || new Set(path).size !== path.length) return null;
  const near = neighbours(m);
  const bonded = (a: number, b: number) => near[a]?.includes(b) ?? false;
  const kind = kindOf([...path]);
  const fixed = new Set(path.slice(0, kind === "torsion" ? 2 : path.length - 1));
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  if (kind === "torsion") {
    const [, b, c, d] = path;
    if (!bonded(b, c)) return null;
    const side = reached(near, c, b);
    // (in a ring the side reaches back: no turn about the bond sets it alone)
    if (side.has(b) || !side.has(d) || [...fixed].some((x) => side.has(x))) return null;
    return sorted(side);
  }
  const last = path[path.length - 1];
  const before = path[path.length - 2];
  const side = bonded(before, last) ? reached(near, last, before) : reached(near, last, null);
  if (![...fixed].some((x) => side.has(x))) return sorted(side);
  return sorted(hanging(near, last, fixed));
}

/** The atoms setting one of a molecule's measurements moves, in a frame of it (`movingAtoms`): null where it cannot be set. */
export function movingFor(m: Molecule3D, measure: number, frame: number): number[] | null {
  const x = m.measures?.find((k) => k.id === measure);
  return x ? movingAtoms({ atoms: m.atoms, bonds: bondsAt(m, frame) }, x.atoms) : null;
}

/** How far a value can be set: a distance in ångströms, an angle in degrees (a torsion angle goes round). */
export const SET_LIMITS: Record<MeasureKind, { min: number; max: number }> = {
  distance: { min: 0.5, max: 20 },
  angle: { min: 1, max: 179 },
  torsion: { min: -180, max: 180 },
};

/** A value as it can be set: a torsion angle brought round into (-180, 180], the others kept within their limits. */
export function settable(kind: MeasureKind, value: number): number {
  if (kind === "torsion") {
    const v = ((((value + 180) % 360) + 360) % 360) - 180;
    return v === -180 ? 180 : v;
  }
  const { min, max } = SET_LIMITS[kind];
  return Math.min(max, Math.max(min, value));
}

const vec = (xyz: ArrayLike<number>, i: number) => new THREE.Vector3(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]);

/** A measurement's value over x, y, z in ångströms, as measure3d's `measureValue` gives it over the page's units. */
export function valueOf(xyz: ArrayLike<number>, path: readonly number[]): number {
  const v = measureValue(xyz, [...path]);
  return path.length === 2 ? v * WORLD_PER_ANGSTROM : v;
}

/**
 * The places with a measurement of `path` set to `value`, the atoms in
 * `moving` moved to make it so: along the bond for a distance, about the
 * middle atom in the three atoms' plane for an angle, about the middle bond
 * for a torsion angle (IUPAC's sign, as it is measured).
 */
export function withValue(xyz: readonly number[], path: readonly number[], value: number, moving: readonly number[]): number[] {
  const out = [...xyz];
  const kind = kindOf([...path]);
  const target = settable(kind, value);
  const move = (f: (v: THREE.Vector3) => THREE.Vector3) => {
    for (const i of moving) f(vec(xyz, i)).toArray(out, 3 * i);
  };
  if (kind === "distance") {
    const [a, b] = path.map((i) => vec(xyz, i));
    const along = b.clone().sub(a);
    const now = along.length();
    // (two atoms in one place: no way to go along - none is taken)
    if (now < 1e-9) return out;
    const by = along.multiplyScalar((target - now) / now);
    move((v) => v.add(by));
    return out;
  }
  const turnAbout = (centre: THREE.Vector3, axis: THREE.Vector3, degrees: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), THREE.MathUtils.degToRad(degrees));
    move((v) => v.sub(centre).applyQuaternion(q).add(centre));
  };
  if (kind === "angle") {
    const [a, b, c] = path.map((i) => vec(xyz, i));
    const u = a.clone().sub(b);
    const w = c.clone().sub(b);
    let axis = u.clone().cross(w);
    // (in a line: any way square to it)
    if (axis.lengthSq() < 1e-12) {
      axis = u.clone().cross(new THREE.Vector3(0, 0, 1));
      if (axis.lengthSq() < 1e-12) axis = u.clone().cross(new THREE.Vector3(0, 1, 0));
    }
    turnAbout(b, axis, target - valueOf(xyz, path));
    return out;
  }
  const [, b, c] = path.map((i) => vec(xyz, i));
  let by = target - valueOf(xyz, path);
  by = ((((by + 180) % 360) + 360) % 360) - 180;
  turnAbout(c, c.clone().sub(b), by);
  return out;
}

/** A frame's places, in ångströms: the first frame's from its atoms. */
export function placesOf(m: Pick<Molecule3D, "atoms" | "frames">, frame: number): number[] {
  if (frame <= 0 || !m.frames?.[frame - 1]) return m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  return [...m.frames[frame - 1]];
}

/**
 * Whether a molecule is a result - a conformer set, a trajectory, what a
 * calculation or a step gave, or one whose file gives its energy - which
 * an edit never changes in place: an edited result is no longer that
 * result, so the edit is made on a copy of it (the maintainer, 2026-10-10).
 */
export function isResult(m: Molecule3D): boolean {
  return !!(m.conformerSet || m.calc || m.path || m.frames?.length || m.energies?.length || m.shares?.length);
}

/** What an edited copy of a result says it was made from, as its chip says it: "conformer 7", "frame 12", or the file it was read from. */
export function editedFrom(m: Molecule3D, frame: number): string {
  const count = 1 + (m.frames?.length ?? 0);
  if (count > 1) return m.conformerSet ? `conformer ${m.numbers?.[frame] ?? frame + 1}` : `frame ${frame + 1}`;
  return m.calc?.source?.name ?? m.name ?? "a calculation";
}

/**
 * A molecule's stereo labels after its places went from `before` to
 * `after`: a centre turned inside out has its R and S swapped (r and s
 * too), and a double bond turned past square its E and Z - the priorities
 * of what is round it are as they were, so only the way round changes.
 */
export function stereoAfter(m: Pick<Molecule3D, "atoms" | "bonds" | "stereo">, before: readonly number[], after: readonly number[]): Molecule3D["stereo"] {
  const st = m.stereo;
  if (!st) return st;
  const near = neighbours(m);
  const volume = (xyz: readonly number[], i: number) => {
    const n = near[i];
    if (n.length < 3) return 0;
    const o = vec(xyz, i);
    const [p, q, r] = n.slice(0, 3).map((k) => vec(xyz, k).sub(o));
    return p.dot(q.cross(r));
  };
  const SWAP: Record<string, string> = { R: "S", S: "R", r: "s", s: "r", E: "Z", Z: "E" };
  const atoms: Record<number, string> = {};
  for (const [k, text] of Object.entries(st.atoms)) {
    const i = Number(k);
    const flipped = SWAP[text] && Math.sign(volume(before, i)) * Math.sign(volume(after, i)) < 0;
    atoms[i] = flipped ? SWAP[text] : text;
  }
  const bonds: Record<number, string> = {};
  for (const [k, text] of Object.entries(st.bonds)) {
    const b = m.bonds[Number(k)];
    const n1 = b && near[b.a1].find((x) => x !== b.a2);
    const n2 = b && near[b.a2].find((x) => x !== b.a1);
    let swapped = false;
    if (b && n1 != null && n2 != null && SWAP[text]) {
      const was = Math.cos(THREE.MathUtils.degToRad(valueOf(before, [n1, b.a1, b.a2, n2])));
      const now = Math.cos(THREE.MathUtils.degToRad(valueOf(after, [n1, b.a1, b.a2, n2])));
      swapped = Math.sign(was) * Math.sign(now) < 0;
    }
    bonds[Number(k)] = swapped ? SWAP[text] : text;
  }
  return { ...st, atoms, bonds };
}

/**
 * A result's frame, edited, as a molecule of its own (`isResult`): its
 * atoms where the edit put them, its bonds as that frame has them, its
 * drawing, look, measurements and stereo labels kept - and nothing that
 * was the result's: no other frames, energies, populations, numbers or
 * calculation. It says what it was made from (`edited`).
 */
export function editedCopy(m: Molecule3D, frame: number, xyz: readonly number[], stereo: Molecule3D["stereo"], at: { x: number; y: number }): Omit<Molecule3D, "id"> {
  const {
    id: _id,
    frames: _frames,
    energies: _energies,
    calc: _calc,
    conformerSet: _set,
    shares: _shares,
    numbers: _numbers,
    path: _path,
    made: _made,
    bondsFrom: _bondsFrom,
    stereo: _stereo,
    ...rest
  } = m;
  return {
    ...rest,
    atoms: m.atoms.map((a, i) => ({ ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })),
    bonds: bondsAt(m, frame).map((b) => ({ ...b })),
    at,
    ...(stereo ? { stereo } : {}),
    edited: { from: editedFrom(m, frame) },
  };
}
