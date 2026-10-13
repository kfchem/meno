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
    const threshold = (radii[m] + radii[k]) * 1.1;
    const dx = xyz[3 * m] - xyz[3 * k];
    const dy = xyz[3 * m + 1] - xyz[3 * k + 1];
    const dz = xyz[3 * m + 2] - xyz[3 * k + 2];
    return dx * dx + dy * dy + dz * dz < threshold * threshold;
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
  const side = 2 * most * 1.1;
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

const BY_NUMBER: ReadonlyMap<number, string> = new Map(ELEMENTS.map((e) => [e.number, e.symbol]));

/** An XYZ file's element as the periodic table writes it: its symbol in any case ("CL", "cl"), or its atomic number ("17"); as it is, where it is neither. */
function xyzElement(given: string): string {
  if (/^\d+$/.test(given)) return BY_NUMBER.get(Number(given)) ?? given;
  const symbol = given.charAt(0).toUpperCase() + given.slice(1).toLowerCase();
  return elementOf(symbol) ? symbol : given;
}

/**
 * An XYZ file's frames' atoms, as far as a line gives a frame's count of
 * atoms (as `xyzComments` reads them, so each frame has its comment line).
 * A frame cut short holds the atoms it has; an atom whose place does not
 * read stands nowhere (NaN): which frames to keep is the reader's
 * (lib/io/structures). Their bonds are found for those kept, not here: a
 * trajectory's would be found frame by frame for nothing.
 */
export function xyzFrames(xyz: string): Atom[][] {
  const lines = xyz.trim().split("\n");
  const frames: Atom[][] = [];

  let i = 0;
  while (i < lines.length) {
    const atomCount = parseInt(lines[i].trim(), 10);
    if (!(atomCount > 0)) break;
    const atomLines = lines.slice(i + 2, i + 2 + atomCount);

    frames.push(
      atomLines.map((line) => {
        const [element, x, y, z] = line.trim().split(/\s+/);
        return {
          el: xyzElement(element ?? ""),
          x: Number(x),
          y: Number(y),
          z: Number(z),
        };
      }),
    );
    i += 2 + atomCount;
  }

  return frames;
}

/** An XYZ file's frames (`xyzFrames`), each with its bonds by distance. */
export function parseXYZ(xyz: string): Molecule[] {
  return xyzFrames(xyz).map((atoms) => ({ atoms, bonds: bondsByDistance(atoms) }));
}
