/**
 * Meno's own reading of structures' files - MOL, SD, RXN, XYZ and PDB
 * files - as a reader under the contract (docs/FILE-IO.md): what such a
 * file holds, as Meno's reader gives it, run in Meno's own worker
 * (lib/calc/menoReads); and the checks the page makes of it, as of any
 * reader's answer.
 */
import { buildEditorModelFromRXN, moleculesToEditorModel, readMoleculesFromText, type EditorModel } from "../../utils/importers";
import { energiesOf } from "../../utils/xyzEnergies";
import { bondsByDistance } from "../../utils/structureParsers";
import type { Molecule, ParsedAtom, ParsedBond } from "../chem/molecule";
import { readPdb, type PdbAtom, type PdbEntry } from "../chem/pdb";
import { biopolymerOf, type Biopolymer } from "../chem/biopolymer";

/** The kinds of structures' files Meno reads itself. */
export type StructureKind = "mol" | "sdf" | "rxn" | "xyz" | "pdb";

/** A molecule in 3D as a file holds it: not yet placed on the page; showing its first frame, or the one `frame` says. */
export type FileMolecule3D = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  /** The rest of its frames: x, y, z of every atom, frame by frame. */
  frames?: number[][];
  /** Each frame's energy, in hartrees, the first frame's first. */
  energies?: number[];
  /** The file it came from. */
  name?: string;
  frame?: number;
  /** Its bonds are where its atoms stand close enough, frame by frame: its file gives none (an XYZ file). */
  bondsFrom?: "distance";
  /** Its atoms' names and residues, and its secondary structure: a PDB entry's chains (lib/chem/biopolymer). */
  biopolymer?: Biopolymer;
};

/**
 * What a structure's file holds: the drawing - its atoms and bonds where
 * the file lays them out, about `centroid`, and a reaction's arrow and "+"
 * signs - and its molecules in 3D, as the file has them. The caller places
 * them: centred for a file opened, at the drop for one dropped.
 */
export type StructureRead = {
  model: EditorModel;
  centroid: { x: number; y: number };
  arrow?: { x1: number; y1: number; x2: number; y2: number };
  /** A reaction's "+" signs: their middles. */
  pluses?: { x: number; y: number }[];
  molecules3d?: FileMolecule3D[];
};

/**
 * Whether each molfile of a MOL or SD file says it is 3D: its header's
 * second line, columns 21 and 22 (CTfile Formats).
 */
function saysThreeD(text: string): boolean[] {
  return text
    .split(/^\$\$\$\$[ \t]*\r?$/m)
    .filter((rec) => rec.trim())
    // (each record after the first begins with the line break that ended "$$$$";
    // a molfile's name line may itself be blank)
    .map((rec) => rec.replace(/^\r?\n/, "").split(/\r?\n/)[1]?.substring(20, 22).toUpperCase() === "3D");
}

/** An XYZ file's comment lines, one for each frame: what is left of it once its geometry is read. */
export function xyzComments(text: string): string[] {
  const lines = text.replace(/^\s+/, "").split(/\r?\n/);
  const comments: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const n = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(n) || n <= 0) break;
    comments.push(lines[i + 1] ?? "");
    i += 2 + n;
  }
  return comments;
}

/** How far a molecule's atoms spread in depth, in its file's units. */
function depthOf(m: Molecule): number {
  if (!m.atoms.length) return 0;
  // (by a loop: spread over tens of thousands of atoms, Math.max overruns a web worker's stack)
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of m.atoms) {
    lo = Math.min(lo, a.z);
    hi = Math.max(hi, a.z);
  }
  return hi - lo;
}

/** Why a file holds nothing to read, as the chemist is told. */
const noMolecules = (name: string) => new Error(`No molecules found in ${name}. Supported formats: MOL, SDF, RXN, XYZ, PDB.`);

/**
 * What a structure's file of `kind` holds: an RXN file's reaction, laid out
 * with its arrow and "+" signs; an XYZ file's frames, one molecule's, in
 * 3D, each with its energy where the comment lines give one; a PDB file's
 * models, in 3D (`pdbMolecules`); a MOL or SD file's records, each a
 * drawing or - where the file says it is 3D, or its atoms spread in depth -
 * a molecule in 3D.
 */
export function readStructures(kind: StructureKind, filename: string, content: string): StructureRead {
  const name = filename || "the file";
  if (kind === "pdb") {
    const molecules3d = pdbMolecules(readPdb(content), filename);
    if (!molecules3d.length) throw noMolecules(name);
    return { model: { atoms: [], bonds: [] }, centroid: { x: 0, y: 0 }, molecules3d };
  }
  if (kind === "rxn") {
    // RXN format: uses pre-computed layout with arrow
    const rxnLayout = buildEditorModelFromRXN(content);
    if (!rxnLayout.model.atoms.length) throw noMolecules(name);
    return {
      model: rxnLayout.model,
      centroid: rxnLayout.centroid,
      ...(rxnLayout.arrow ? { arrow: rxnLayout.arrow } : {}),
      ...(rxnLayout.pluses ? { pluses: rxnLayout.pluses } : {}),
    };
  }

  // MOL, SDF, XYZ formats: parse molecules and convert to editor model
  const molecules = readMoleculesFromText(content, kind);

  // 3D structures stand on the page as they are: an XYZ file's frames are
  // one molecule's, a MOL or SD file's records each a molecule of its own -
  // where the file says it is 3D, or its atoms spread in depth.
  if (kind === "xyz" && molecules.length && molecules[0].atoms.length) {
    const [first, ...rest] = molecules;
    // (and each frame's energy, as programs write it on the comment lines)
    const energies = rest.length ? energiesOf(xyzComments(content)) : undefined;
    return {
      model: { atoms: [], bonds: [] },
      centroid: { x: 0, y: 0 },
      molecules3d: [
        {
          atoms: first.atoms,
          bonds: first.bonds,
          bondsFrom: "distance",
          ...(rest.length ? { frames: rest.map((f) => f.atoms.flatMap((a) => [a.x, a.y, a.z])) } : {}),
          ...(energies?.length === molecules.length ? { energies } : {}),
          ...(filename ? { name: filename } : {}),
        },
      ],
    };
  }
  // (in a MOL or SD file, each record is a drawing or a molecule in 3D)
  const said = kind === "sdf" || kind === "mol" ? saysThreeD(content) : [];
  const inDepth = (m: Molecule, i: number) => m.atoms.length > 0 && (said[i] || depthOf(m) > 0.1);
  const molecules3d = molecules
    .filter(inDepth)
    .map((m) => ({ atoms: m.atoms, bonds: m.bonds, ...(filename ? { name: filename } : {}) }));
  const flat = molecules.filter((m, i) => !inDepth(m, i));
  if (molecules3d.length && !flat.some((m) => m.atoms.length)) {
    return { model: { atoms: [], bonds: [] }, centroid: { x: 0, y: 0 }, molecules3d };
  }
  const { model, centroid } = moleculesToEditorModel(flat);
  // The MOL parser returns an empty molecule rather than nothing for
  // unrecognised text, so check atoms, not molecules.
  if (!model.atoms.length) throw noMolecules(name);
  return { model, centroid, ...(molecules3d.length ? { molecules3d } : {}) };
}

/**
 * The atoms of a model Meno shows: each in one place - where an atom is
 * given in more than one, the first alternate location its residue gives
 * (ATOM, *Details*: a residue's atoms in one conformation share their
 * indicator).
 */
function inOnePlace(atoms: readonly PdbAtom[]): PdbAtom[] {
  const chosen = new Map<string, string>();
  return atoms.filter((a) => {
    if (!a.altLoc) return true;
    const residue = `${a.chainID} ${a.resSeq} ${a.iCode} ${a.resName}`;
    const first = chosen.get(residue);
    if (first === undefined) chosen.set(residue, a.altLoc);
    return (first ?? a.altLoc) === a.altLoc;
  });
}

/**
 * A model's bonds: those its CONECT records give, and - where they do not
 * speak for both atoms of a pair - those its atoms' distances give, as an
 * XYZ file's. CONECT records give a hetero group's bonds and the links
 * between groups (Connectivity Section); a standard residue's own bonds
 * are in the Chemical Component Dictionary, not in the file, and Meno does
 * not carry the dictionary.
 */
function pdbBonds(atoms: readonly PdbAtom[], conect: readonly [number, number][]): ParsedBond[] {
  const index = new Map<number, number>();
  atoms.forEach((a, i) => {
    if (Number.isFinite(a.serial) && !index.has(a.serial)) index.set(a.serial, i);
  });
  const given: ParsedBond[] = [];
  const spoken = new Set<number>();
  for (const [p, q] of conect) {
    const a1 = index.get(p);
    const a2 = index.get(q);
    if (a1 === undefined || a2 === undefined) continue;
    given.push({ a1: Math.min(a1, a2), a2: Math.max(a1, a2), order: 1 });
    spoken.add(a1).add(a2);
  }
  const near = bondsByDistance(atoms.map((a) => ({ el: a.element, x: a.x, y: a.y, z: a.z }))).filter(
    (b) => !(spoken.has(b.a1) && spoken.has(b.a2)),
  );
  const seen = new Set(given.map((b) => `${b.a1} ${b.a2}`));
  return [...given, ...near.filter((b) => !seen.has(`${b.a1} ${b.a2}`))].sort((x, y) => x.a1 - y.a1 || x.a2 - y.a2);
}

const parsedAtom = (a: PdbAtom): ParsedAtom => ({ el: a.element, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) });

/**
 * A PDB file's molecules in 3D: its models one molecule's frames, where
 * each holds the same atoms (MODEL, *Details*: an ensemble's models are
 * alike); else each model a molecule of its own. All a model holds - its
 * chains, hetero groups, waters - is one molecule in 3D, as an XYZ file's
 * atoms are.
 */
function pdbMolecules(entry: PdbEntry, filename: string): FileMolecule3D[] {
  const models = entry.models.map((m) => inOnePlace(m.atoms)).filter((atoms) => atoms.length);
  if (!models.length) return [];
  const [first, ...rest] = models;
  const alike = rest.every((atoms) => atoms.length === first.length && atoms.every((a, i) => a.element === first[i].element));
  const named = filename ? { name: filename } : {};
  // (its chains, residues and secondary structure: what it is drawn as a biopolymer by)
  const biopolymer = (atoms: readonly PdbAtom[]) => {
    const bp = biopolymerOf(atoms, entry.helices, entry.strands);
    return bp ? { biopolymer: bp } : {};
  };
  if (alike) {
    return [
      {
        atoms: first.map(parsedAtom),
        bonds: pdbBonds(first, entry.conect),
        ...(rest.length ? { frames: rest.map((atoms) => atoms.flatMap((a) => [a.x, a.y, a.z])) } : {}),
        ...named,
        ...biopolymer(first),
      },
    ];
  }
  return models.map((atoms) => ({ atoms: atoms.map(parsedAtom), bonds: pdbBonds(atoms, entry.conect), ...named, ...biopolymer(atoms) }));
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (p: unknown): p is { x: number; y: number } => finite((p as { x?: unknown })?.x) && finite((p as { y?: unknown })?.y);

/**
 * A reader's answer of structures, as the page takes it - checked as any
 * reader's is, whoever gave it: the drawing's atoms each placed and of an
 * element, its bonds between them; each molecule in 3D's atoms placed in
 * 3D, its bonds between them, its frames each as long as its atoms are.
 * Throws, saying what does not read.
 */
export function checkedStructures(raw: unknown, name: string): StructureRead {
  const s = raw as Partial<StructureRead> | null;
  const bad = (what: string) => new Error(`${name} could not be read: ${what}.`);
  const atoms = s?.model?.atoms;
  const bonds = s?.model?.bonds;
  if (!Array.isArray(atoms) || !Array.isArray(bonds) || !isPoint(s?.centroid)) throw bad("no drawing came back");
  if (!atoms.every((a) => isPoint(a) && finite(a.id) && typeof a.el === "string")) throw bad("an atom of its drawing is not placed");
  const ids = new Set(atoms.map((a) => a.id));
  if (!bonds.every((b) => finite(b.id) && ids.has(b.a) && ids.has(b.b))) throw bad("a bond of its drawing joins no atoms");
  if (s!.arrow != null && ![s!.arrow.x1, s!.arrow.y1, s!.arrow.x2, s!.arrow.y2].every(finite)) throw bad("its arrow is not placed");
  if (s!.pluses != null && !(Array.isArray(s!.pluses) && s!.pluses.every(isPoint))) throw bad("a \"+\" sign is not placed");
  for (const m of s!.molecules3d ?? []) {
    const n = m?.atoms?.length ?? 0;
    if (!n || !m.atoms.every((a) => isPoint(a) && finite(a.z) && typeof a.el === "string")) throw bad("a molecule in 3D is not placed");
    if (!(m.bonds ?? []).every((b) => finite(b.a1) && finite(b.a2) && b.a1 >= 0 && b.a2 >= 0 && b.a1 < n && b.a2 < n)) {
      throw bad("a bond of a molecule in 3D joins no atoms");
    }
    if (!(m.frames ?? []).every((f) => Array.isArray(f) && f.length === 3 * n && f.every(finite))) throw bad("a frame of a molecule in 3D is not whole");
  }
  return s as StructureRead;
}
