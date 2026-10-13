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

/**
 * Bonds where atoms stand closer than their covalent radii allow, a tenth
 * over: how a molecule given only its atoms and where they are - an XYZ
 * file's, a calculation's - is given its bonds, all single.
 */
export function bondsByDistance(atoms: readonly { el: string; x: number; y: number; z: number }[]): Bond[] {
  // (each atom's covalent radius looked up once, not once for every pair:
  // a trajectory of hundreds of frames is read quickly)
  const radii = atoms.map((a) => covalentRadius(a.el));
  const bonded = (m: number, n: number) => {
    const a1 = atoms[m];
    const a2 = atoms[n];
    const threshold = (radii[m] + radii[n]) * 1.1;
    const dx = a1.x - a2.x;
    const dy = a1.y - a2.y;
    const dz = a1.z - a2.z;
    return dx * dx + dy * dy + dz * dz < threshold * threshold;
  };
  const bonds: Bond[] = [];
  if (atoms.length <= GRID_FROM) {
    for (let m = 0; m < atoms.length; m++) {
      for (let n = m + 1; n < atoms.length; n++) if (bonded(m, n)) bonds.push({ a1: m, a2: n, order: 1 });
    }
    return bonds;
  }
  // A big structure - a protein's thousands of atoms - is cut into cubes as
  // wide as the longest bond there can be, and each atom tried only against
  // those in its cube and the cubes about it: the same bonds, in the same
  // order, without trying every pair.
  // (the widest radius by a loop: spread over tens of thousands of atoms, Math.max overruns a web worker's stack)
  const side = 2 * radii.reduce((most, r) => Math.max(most, r), 0) * 1.1;
  const cell = (v: number) => Math.floor(v / side);
  const key = (i: number, j: number, k: number) => `${i} ${j} ${k}`;
  const cells = new Map<string, number[]>();
  atoms.forEach((a, n) => {
    const k = key(cell(a.x), cell(a.y), cell(a.z));
    const c = cells.get(k);
    if (c) c.push(n);
    else cells.set(k, [n]);
  });
  for (let m = 0; m < atoms.length; m++) {
    const a = atoms[m];
    const [i, j, k] = [cell(a.x), cell(a.y), cell(a.z)];
    const near: number[] = [];
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (let dk = -1; dk <= 1; dk++) for (const n of cells.get(key(i + di, j + dj, k + dk)) ?? []) if (n > m && bonded(m, n)) near.push(n);
    near.sort((p, q) => p - q);
    for (const n of near) bonds.push({ a1: m, a2: n, order: 1 });
  }
  return bonds;
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
