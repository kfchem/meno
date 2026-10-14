import { ELEMENTS, elementOf, singleBondRadius } from "../lib/chem/elements";
import type { Molecule, ParsedAtom, ParsedBond, StereoGroup } from "../lib/chem/molecule";
import { readSDfile, type CtMolecule } from "../lib/chem/ctfile";

// (a file's molecule is the one in lib/chem/molecule; the names it had here)
export type { Molecule };
export type Atom = ParsedAtom;
export type Bond = ParsedBond;

/**
 * A CTfile molecule (lib/chem/ctfile) as the rest of the app takes a file's
 * molecule: its atoms' elements and chemistry, its bonds' types and V2000
 * stereo codes - and the whole of what the file said, as `ct`.
 */
export function fromCtfile(ct: CtMolecule): Molecule {
  const groups = stereoGroupsOf(ct);
  const atoms: Atom[] = ct.atoms.map((a, i) => ({
    x: a.x,
    y: a.y,
    z: a.z,
    // an alias is the label the atom is drawn with: it is what the atom is
    // taken to be (an abbreviation, if the dictionary knows it)
    el: a.alias || a.symbol,
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    ...(a.mass ? { isotope: a.mass } : {}),
    ...(a.rgroups?.length ? { rgroups: a.rgroups } : {}),
    ...(a.list ? { list: a.list } : {}),
    ...(a.valence != null ? { valence: a.valence } : {}),
    ...(a.hCount != null ? { hCount: a.hCount } : {}),
    ...(a.map ? { map: a.map } : {}),
    ...(a.invRet ? { invRet: a.invRet } : {}),
    ...(a.exactChange ? { exactChange: true } : {}),
    ...(groups.atoms.get(i) ? { stereoGroup: groups.atoms.get(i) } : {}),
  }));
  const bonds: Bond[] = ct.bonds.map((b) => {
    const code =
      b.stereo === "up" ? 1 : b.stereo === "down" ? 6 : b.stereo === "either" ? (b.type === 2 ? 3 : 4) : undefined;
    return { a1: b.a1, a2: b.a2, order: b.type, ...(code ? { stereoCode: code } : {}) };
  });
  return { atoms, bonds, ct };
}

/**
 * Each stereocentre's and stereo bond's enhanced stereo group: as the
 * file's collections have them (MDLV30/STEABS, STERACn, STERELn and the bond
 * collections STEBABS, STEBRACn, STEBRELn) - or, with none, the chiral flag
 * set for all of them: every centre a wedge starts at absolute ("CTfile
 * Formats", the counts line).
 */
export function stereoGroupsOf(ct: CtMolecule): { atoms: Map<number, StereoGroup>; bonds: Map<number, StereoGroup> } {
  const atoms = new Map<number, StereoGroup>();
  const bonds = new Map<number, StereoGroup>();
  for (const c of ct.collections) {
    const m = /^MDLV30\/STE(B?)(ABS|RAC|REL)(\d*)$/i.exec(c.name);
    if (!m) continue;
    const kind = m[2].toUpperCase() === "ABS" ? "abs" : m[2].toUpperCase() === "RAC" ? "and" : "or";
    const group: StereoGroup = kind === "abs" ? { kind } : { kind, n: Number.parseInt(m[3] || "1", 10) };
    if (m[1]) for (const b of c.bonds) bonds.set(b, group);
    else for (const a of c.atoms) atoms.set(a, group);
  }
  if (!atoms.size && !bonds.size && ct.chiral) {
    for (const b of ct.bonds) if (b.stereo === "up" || b.stereo === "down") atoms.set(b.a1, { kind: "abs" });
  }
  return { atoms, bonds };
}

/** An SDfile's (or a molfile's) molecules, V2000 or V3000, as "CTfile Formats" has them. */
export function parseSDF(sdf: string): Molecule[] {
  return readSDfile(sdf).map(fromCtfile);
}

const covalent = new Map<string, number>();

/** An element's single-bond covalent radius, in ångströms; 1.5 for one not known. */
function covalentRadius(el: string): number {
  let r = covalent.get(el);
  if (r === undefined) {
    r = singleBondRadius(el) ?? 1.5;
    covalent.set(el, r);
  }
  return r;
}

/** Each atom's single-bond covalent radius, in ångströms, by its element (1.5 for one not known): what `bondedPairs` takes. */
export function bondRadii(els: readonly string[]): Float64Array {
  return Float64Array.from(els, covalentRadius);
}

/**
 * Bonds where atoms stand closer than their covalent radii allow, a tenth
 * over: how a molecule given only its atoms and where they are - an XYZ
 * file's, a calculation's - is given its bonds, all single.
 */
export function bondsByDistance(atoms: readonly { el: string; x: number; y: number; z: number }[]): Bond[] {
  const xyz = new Float64Array(3 * atoms.length);
  atoms.forEach((a, i) => {
    xyz[3 * i] = a.x;
    xyz[3 * i + 1] = a.y;
    xyz[3 * i + 2] = a.z;
  });
  const pairs = bondedPairs(xyz, bondRadii(atoms.map((a) => a.el)));
  const bonds: Bond[] = [];
  for (let k = 0; k < pairs.length; k += 2) bonds.push({ a1: pairs[k], a2: pairs[k + 1], order: 1 });
  return bonds;
}

/**
 * The pairs of atoms `bondsByDistance` bonds, from where they stand - x, y
 * and z in turn, `xyz` - and their radii (`bondRadii`): each pair once, the
 * lower first, by the first and then the second, as their two indices in
 * turn. Nothing made for each atom: a trajectory's frames are each given
 * their bonds by it as it is opened (Workspace/utils/molecule3d
 * `frameBondsOf`).
 */
export function bondedPairs(xyz: ArrayLike<number>, radii: ArrayLike<number>): number[] {
  const n = radii.length;
  const out: number[] = [];
  const bonded = (m: number, k: number) => {
    const threshold = bondingDistance(radii[m], radii[k]);
    const dx = xyz[3 * m] - xyz[3 * k];
    const dy = xyz[3 * m + 1] - xyz[3 * k + 1];
    const dz = xyz[3 * m + 2] - xyz[3 * k + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    // (two atoms in one place are no bond - and many of them, a pair each, would be millions)
    return d2 < threshold * threshold && d2 >= ONE_PLACE * ONE_PLACE;
  };
  if (n <= GRID_FROM) {
    for (let m = 0; m < n; m++) for (let k = m + 1; k < n; k++) if (bonded(m, k)) out.push(m, k);
    return out;
  }
  // A big structure - a protein's thousands of atoms - is cut into cubes as
  // wide as the longest bond there can be, and each atom tried only against
  // those in its cube and the cubes about it: the same bonds, in the same
  // order, without trying every pair.
  // (the widest radius by a loop: spread over tens of thousands of atoms, Math.max overruns a web worker's stack)
  let most = 0;
  for (let i = 0; i < n; i++) most = Math.max(most, radii[i]);
  const side = bondingDistance(most, most);
  // each atom's cube, counted from the lowest, a cube to spare all round;
  // an atom that stands nowhere (NaN) is in none, and bonded to nothing
  const cube = new Float64Array(3 * n);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const placed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let ok = true;
    for (let d = 0; d < 3; d++) {
      const c = Math.floor(xyz[3 * i + d] / side);
      cube[3 * i + d] = c;
      if (!Number.isFinite(c)) ok = false;
    }
    if (!ok) continue;
    placed[i] = 1;
    for (let d = 0; d < 3; d++) {
      lo[d] = Math.min(lo[d], cube[3 * i + d]);
      hi[d] = Math.max(hi[d], cube[3 * i + d]);
    }
  }
  const ny = hi[1] - lo[1] + 3;
  const nz = hi[2] - lo[2] + 3;
  // (a cube by one number; were the box ever larger than a double counts
  // exactly, one cube read twice is caught as its atoms are taken below)
  const keyOf = (i: number) => ((cube[3 * i] - lo[0] + 1) * ny + (cube[3 * i + 1] - lo[1] + 1)) * nz + (cube[3 * i + 2] - lo[2] + 1);
  const cells = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!placed[i]) continue;
    const key = keyOf(i);
    const c = cells.get(key);
    if (c) c.push(i);
    else cells.set(key, [i]);
  }
  const near: number[] = [];
  for (let m = 0; m < n; m++) {
    if (!placed[m]) continue;
    const key = keyOf(m);
    near.length = 0;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (let dk = -1; dk <= 1; dk++) {
          const c = cells.get(key + (di * ny + dj) * nz + dk);
          if (c) for (const k of c) if (k > m && bonded(m, k)) near.push(k);
        }
    near.sort((p, q) => p - q);
    for (let j = 0; j < near.length; j++) if (j === 0 || near[j] !== near[j - 1]) out.push(m, near[j]);
  }
  return out;
}

/** How many atoms a structure has before its bonds are found cube by cube rather than pair by pair. */
const GRID_FROM = 400;

/** Nearer than this, in ångströms, two atoms are in one place: no bond (the shortest, H2's, is 0.74). */
export const ONE_PLACE = 0.1;
/** How much further than their radii together two atoms may stand and be bonded, in ångströms, at least: H2 (0.741) is beyond its radii's tenth over (0.704). */
const REACH_FLOOR = 0.15;

/** How far apart two atoms of these single-bond radii may stand and be bonded: their radii together and a tenth over - or, for the smallest, 0.15 Å over (the maintainer, 2026-10-13). */
export function bondingDistance(r1: number, r2: number): number {
  return Math.max((r1 + r2) * 1.1, r1 + r2 + REACH_FLOOR);
}

/**
 * How many atoms stand in one place with another (`ONE_PLACE`), from where
 * they stand (x, y, z in turn): what a molecule says over it, such a file
 * being damaged or not a molecule's (completeness `TOGETHER_MARK`). Cube by
 * cube, so a hundred thousand are counted at once.
 */
export function atomsTogether(xyz: ArrayLike<number>): number {
  const n = Math.floor(xyz.length / 3);
  const cells = new Map<string, number[]>();
  const key = (i: number, j: number, k: number) => `${i} ${j} ${k}`;
  const cell = (v: number) => Math.floor(v / ONE_PLACE);
  let together = 0;
  for (let a = 0; a < n; a++) {
    const [x, y, z] = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]];
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) continue;
    const [i, j, k] = [cell(x), cell(y), cell(z)];
    let near = false;
    for (let di = -1; di <= 1 && !near; di++)
      for (let dj = -1; dj <= 1 && !near; dj++)
        for (let dk = -1; dk <= 1 && !near; dk++)
          for (const b of cells.get(key(i + di, j + dj, k + dk)) ?? []) {
            const d = Math.hypot(xyz[3 * b] - x, xyz[3 * b + 1] - y, xyz[3 * b + 2] - z);
            if (d < ONE_PLACE) {
              near = true;
              break;
            }
          }
    if (near) together++;
    const c = cells.get(key(i, j, k));
    if (c) c.push(a);
    else cells.set(key(i, j, k), [a]);
  }
  return together;
}

const BY_NUMBER: ReadonlyMap<number, string> = new Map(ELEMENTS.map((e) => [e.number, e.symbol]));

/** An XYZ file's element as the periodic table writes it: its symbol in any case ("CL", "cl"), or its atomic number ("17"); as it is, where it is neither. */
function xyzElement(given: string): string {
  if (/^\d+$/.test(given)) return BY_NUMBER.get(Number(given)) ?? given;
  const symbol = given.charAt(0).toUpperCase() + given.slice(1).toLowerCase();
  return elementOf(symbol) ? symbol : given;
}

/** A coordinate as an XYZ file writes it: a decimal number, with an exponent after an E where it has one - not Fortran's D, "nan", "Infinity" or hexadecimal. */
const COORDINATE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/**
 * An XYZ file's frames' atoms, as far as a line gives a frame's count of
 * atoms (as `xyzComments` reads them, so each frame has its comment line).
 * A frame cut short holds the atoms it has; an atom whose place does not
 * read as a number (`COORDINATE`) stands nowhere (NaN): which frames to
 * keep is the reader's (`wholeXyzFrames`). Where `why` is given, it is told
 * why each frame is damaged, in the words a refusal of the file says it
 * (undefined for a whole one). Their bonds are found for those kept, not
 * here: a trajectory's would be found frame by frame for nothing.
 */
export function xyzFrames(xyz: string, why?: (string | undefined)[]): Atom[][] {
  const lines = xyz.trim().split("\n");
  const frames: Atom[][] = [];

  let i = 0;
  while (i < lines.length) {
    // (blank lines between frames, as some programs write them, and a line that is ">" alone, between the
    // frames of a file of many geometries: passed over)
    while (i < lines.length && (!lines[i].trim() || lines[i].trim() === ">")) i++;
    if (i >= lines.length) break;
    const atomCount = parseInt(lines[i].trim(), 10);
    if (!(atomCount > 0)) {
      // (more after the frames that is no frame - a line between frames that is no count of atoms, text at the
      // end: not read, and never without a word - a frame left out, as the molecule says over it)
      if (lines.slice(i).some((line) => line.trim())) {
        frames.push([]);
        why?.push(`Line ${i + 1} of the XYZ file is not a count of atoms: "${lines[i].trim().slice(0, 40)}".`);
      }
      break;
    }
    const atomLines = lines.slice(i + 2, i + 2 + atomCount);
    let damaged = atomLines.length < atomCount ? `The XYZ file ends before its atoms do: it says ${atomCount}, and gives ${atomLines.length}.` : undefined;

    frames.push(
      atomLines.map((line, k) => {
        const [element, ...place] = line.trim().split(/\s+/);
        const [x, y, z] = [0, 1, 2].map((d) => {
          const t = place[d] ?? "";
          if (COORDINATE.test(t)) return Number(t);
          damaged ??= `Line ${i + 3 + k} of the XYZ file gives ${element} a place that is not a number: "${t}".`;
          return NaN;
        });
        return { el: xyzElement(element ?? ""), x, y, z };
      }),
    );
    why?.push(damaged);
    i += 2 + atomCount;
  }

  return frames;
}

/**
 * An XYZ file's frames that are whole - every atom of the first whole one,
 * each somewhere - by their places among its frames, and how many it has;
 * the others are left
 * out, to be said in a count (a trajectory still being written, a frame
 * damaged). None whole, the file is refused, saying why of its first
 * frame: "The XYZ file ends before its atoms do: it says 3, and gives 2."
 */
export function wholeXyzFrames(xyz: string): { frames: Atom[][]; kept: number[]; total: number } {
  const why: (string | undefined)[] = [];
  const frames = xyzFrames(xyz, why);
  const n = frames.find((atoms, i) => atoms.length > 0 && !why[i])?.length ?? 0;
  const kept = frames.flatMap((atoms, i) => (n && !why[i] && atoms.length === n ? [i] : []));
  if (!kept.length && why[0]) throw new Error(why[0]);
  return { frames: kept.map((i) => frames[i]), kept, total: frames.length };
}

/** An XYZ file's whole frames (`wholeXyzFrames`), each with its bonds by distance. */
export function parseXYZ(xyz: string): Molecule[] {
  return wholeXyzFrames(xyz).frames.map((atoms) => ({ atoms, bonds: bondsByDistance(atoms) }));
}
