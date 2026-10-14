/**
 * Meno's own reading of structures' files - MOL, SD, RXN, XYZ and PDB
 * files - as a reader under the contract (docs/FILE-IO.md): what such a
 * file holds, as Meno's reader gives it, run in Meno's own worker
 * (lib/calc/menoReads); and the checks the page makes of it, as of any
 * reader's answer.
 */
import { buildEditorModelFromRXN, moleculesToEditorModel, readMoleculesFromText, type EditorModel } from "../../utils/importers";
import { energiesOf } from "../../utils/xyzEnergies";
import { atomsTogether, bondsByDistance, wholeXyzFrames } from "../../utils/structureParsers";
import type { Molecule, ParsedAtom, ParsedBond } from "../chem/molecule";
import { readPdb, type PdbAtom, type PdbEntry } from "../chem/pdb";
import { readRxnfile } from "../chem/ctfile";
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
  /** Its record's title, where its file gives one: an SD file's record's first line. */
  title?: string;
  frame?: number;
  /** Its bonds are where its atoms stand close enough, frame by frame: its file gives none (an XYZ file). */
  bondsFrom?: "distance";
  /** Its atoms' names and residues, and its secondary structure: a PDB entry's chains (lib/chem/biopolymer). */
  biopolymer?: Biopolymer;
  /** Its bonds' orders "unknown": its file gives coordinates alone (an XYZ or PDB file). */
  bondOrders?: "unknown";
  /** How many of its file's frames were left out - cut short, or with an atom whose place does not read - as the molecule says over it. */
  framesLeftOut?: number;
  /** How many of its atoms stand in one place with another, as it is read (utils/structureParsers `atomsTogether`): said over it. */
  together?: number;
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
  /** A file's several records drawn flat - an SD file's: each one's atoms in the drawing, by id, and its title where it gives one. */
  records?: { atoms: number[]; title?: string }[];
  /**
   * The records of an SD file left out as it was read - cut short, damaged,
   * or saying what Meno cannot read - each by its number among them, from
   * 1, and why: said, never left out silently (the maintainer, 2026-10-14).
   */
  recordsLeftOut?: { record: number; why: string }[];
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
    // (blank lines and ">" lines between frames passed over, as xyzFrames passes them)
    while (i < lines.length && (!lines[i].trim() || lines[i].trim() === ">")) i++;
    if (i >= lines.length) break;
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
 * Why a file that ends before what it says it holds - its atoms and bonds,
 * its reaction's molecules - is not read: what it holds is not what it says
 * (CTfile's counts lines, an XYZ frame's count), and read anyway its missing
 * atoms stood at the origin, or were left out, saying nothing.
 */
const cutShort = (name: string, what = "it") =>
  new Error(`${name} could not be read: ${what} ends before the atoms and bonds it says it has. It may be cut short or damaged.`);

/**
 * Why a file whose atoms or bonds do not read as what they are is not read
 * (`CtMolecule.damaged`, `why`): read anyway, an atom with no symbol was a
 * carbon, "1.19D+01" was 1.19, and a bond to an atom its record has not
 * joined the next record's.
 */
const damaged = (name: string, why: string, what = "it") => new Error(`${name} could not be read: ${what} has ${why}. It may be damaged.`);

/** Why a file that says what Meno cannot read is not read without it (`CtMolecule.unread`, `why`). */
const unread = (name: string, why: string, what = "it") => new Error(`${name} could not be read: ${what} ${why}.`);

/** Why a record does not read - cut short, damaged, saying what Meno cannot read - as its file's refusal says it; none, where it reads. */
const recordProblem = (m: Molecule): string | null =>
  m.ct?.cut ? "ends before the atoms and bonds it says it has" : m.ct?.damaged ? `has ${m.ct.damaged}` : (m.ct?.unread ?? null);

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
    // (its records by line, whatever ends them - an old Mac's CR too - and a byte-order mark no part of the first)
    const molecules3d = pdbMolecules(readPdb(content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")), filename);
    if (!molecules3d.length) throw noMolecules(name);
    return { model: { atoms: [], bonds: [] }, centroid: { x: 0, y: 0 }, molecules3d };
  }
  if (kind === "rxn") {
    const reaction = readRxnfile(content);
    if (reaction.cut) throw cutShort(name);
    if (reaction.damaged) throw damaged(name, reaction.damaged);
    if (reaction.unread) throw unread(name, reaction.unread);
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

  // 3D structures stand on the page as they are: an XYZ file's frames are
  // one molecule's, a MOL or SD file's records each a molecule of its own -
  // where the file says it is 3D, or its atoms spread in depth.
  if (kind === "xyz") {
    const text = content.replace(/\r\n?/g, "\n");
    // (a frame cut short, or with an atom whose place does not read, is left
    // out - and its energy with it - so that each frame kept is the one
    // shown, measured and written: every atom of the first whole one, each
    // somewhere; and never without a word: the molecule says how many. None
    // whole, the file is refused, saying why of its first frame)
    const whole = wholeXyzFrames(text, name);
    const kept = new Set(whole.kept);
    if (!kept.size) throw noMolecules(name);
    const [first, ...rest] = whole.frames;
    // (and each frame's energy, as programs write it on the comment lines)
    const energies = whole.total > 1 ? energiesOf(xyzComments(content))?.filter((_, i) => kept.has(i)) : undefined;
    return {
      model: { atoms: [], bonds: [] },
      centroid: { x: 0, y: 0 },
      molecules3d: [
        {
          atoms: first,
          // (its bonds as its first frame has them; frame by frame, they are found where they are drawn)
          bonds: bondsByDistance(first),
          bondsFrom: "distance",
          bondOrders: "unknown",
          ...(rest.length ? { frames: rest.map((atoms) => atoms.flatMap((a) => [a.x, a.y, a.z])) } : {}),
          ...(rest.length && energies?.length === kept.size ? { energies } : {}),
          ...(filename ? { name: filename } : {}),
          ...(kept.size < whole.total ? { framesLeftOut: whole.total - kept.size } : {}),
          ...togetherIn(first),
        },
      ],
    };
  }
  // MOL and SD files: their records, each a drawing or a molecule in 3D
  const molecules = readMoleculesFromText(content, kind);
  // (a record cut short, damaged or saying what Meno cannot read: of
  // several, left out, the others opened and those left out named - their
  // number and why - as a trajectory's frames left out are said (the
  // maintainer, 2026-10-14); refused where it is the file's only record,
  // or none reads - cut short said first, what it most likely is where it
  // is both)
  const problems = molecules.map(recordProblem);
  const good = molecules.flatMap((_, i) => (problems[i] ? [] : [i]));
  if (!good.length && problems[0]) {
    const what = molecules.length > 1 ? "its record 1" : "it";
    const ct = molecules[0].ct!;
    throw ct.cut ? cutShort(name, what) : ct.damaged ? damaged(name, ct.damaged, what) : unread(name, ct.unread!, what);
  }
  const recordsLeftOut = problems.flatMap((why, i) => (why ? [{ record: i + 1, why }] : []));
  const leftOut = recordsLeftOut.length ? { recordsLeftOut } : {};
  const said = saysThreeD(content);
  const inDepth = (i: number) => molecules[i].atoms.length > 0 && (said[i] || depthOf(molecules[i]) > 0.1);
  const molecules3d = good.filter(inDepth).map((i) => {
    const m = molecules[i];
    // (and its record's title, its first line, where it gives one)
    const title = m.ct?.name.trim();
    return { atoms: m.atoms, bonds: m.bonds, ...(filename ? { name: filename } : {}), ...(title ? { title } : {}) };
  });
  const flat = good.filter((i) => !inDepth(i)).map((i) => molecules[i]);
  if (molecules3d.length && !flat.some((m) => m.atoms.length)) {
    return { model: { atoms: [], bonds: [] }, centroid: { x: 0, y: 0 }, molecules3d, ...leftOut };
  }
  const { model, centroid, records } = moleculesToEditorModel(flat);
  // The MOL parser returns an empty molecule rather than nothing for
  // unrecognised text, so check atoms, not molecules.
  if (!model.atoms.length) throw noMolecules(name);
  // (several records with atoms: each one's atoms and title, for a stack of them)
  const held = records.filter((r) => r.atoms.length);
  return { model, centroid, ...(held.length > 1 ? { records: held } : {}), ...(molecules3d.length ? { molecules3d } : {}), ...leftOut };
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

/** How many atoms stand in one place with another, where any do: what the molecule says over it. */
function togetherIn(atoms: readonly { x: number; y: number; z: number }[]): { together?: number } {
  const n = atomsTogether(atoms.flatMap((a) => [a.x, a.y, a.z]));
  return n ? { together: n } : {};
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
        // (a PDB file gives no bond orders: CONECT records say which atoms are bonded, not how)
        bondOrders: "unknown" as const,
        ...togetherIn(first),
      },
    ];
  }
  return models.map((atoms) => ({ atoms: atoms.map(parsedAtom), bonds: pdbBonds(atoms, entry.conect), ...named, ...biopolymer(atoms), bondOrders: "unknown" as const, ...togetherIn(atoms) }));
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
  if (s!.records != null && !(Array.isArray(s!.records) && s!.records.every((r) => Array.isArray(r?.atoms) && r.atoms.every((id) => ids.has(id)) && (r.title == null || typeof r.title === "string")))) {
    throw bad("a record of its drawing holds atoms it does not have");
  }
  for (const m of s!.molecules3d ?? []) {
    const n = m?.atoms?.length ?? 0;
    if (!n || !m.atoms.every((a) => isPoint(a) && finite(a.z) && typeof a.el === "string")) throw bad("a molecule in 3D is not placed");
    if (!(m.bonds ?? []).every((b) => finite(b.a1) && finite(b.a2) && b.a1 >= 0 && b.a2 >= 0 && b.a1 < n && b.a2 < n)) {
      throw bad("a bond of a molecule in 3D joins no atoms");
    }
    if (!(m.frames ?? []).every((f) => Array.isArray(f) && f.length === 3 * n && f.every(finite))) throw bad("a frame of a molecule in 3D is not whole");
    if (m.framesLeftOut != null && !(Number.isInteger(m.framesLeftOut) && m.framesLeftOut > 0)) throw bad("a molecule in 3D's frames left out are no count");
    if (m.together != null && !(Number.isInteger(m.together) && m.together > 0)) throw bad("a molecule in 3D's atoms in one place are no count");
  }
  const left = (s as { recordsLeftOut?: unknown }).recordsLeftOut;
  if (left != null && !(Array.isArray(left) && left.every((r) => Number.isInteger(r?.record) && r.record > 0 && typeof r.why === "string"))) {
    throw bad("what it says of the records left out is not a list of them");
  }
  return s as StructureRead;
}
