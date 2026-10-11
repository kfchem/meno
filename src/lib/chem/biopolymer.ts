/**
 * What a PDB entry says of a molecule beyond its atoms, kept with the
 * molecule in 3D so that it can be drawn as a biopolymer (docs/WORKSPACE.md,
 * *Ribbons*): each atom's name and residue, and each residue's secondary
 * structure as the entry's HELIX and SHEET records give it - Meno does not
 * work secondary structure out itself. Read as the wwPDB's "Atomic
 * Coordinate Entry Format Version 3.3" lays it out (./pdb).
 */
import type { PdbAtom, PdbHelix, PdbResidue, PdbStrand } from "./pdb";

/** A residue: its name, chain, sequence number and insertion code (which, together, are the residue: ATOM, *Details*); whether a standard residue's ATOM records give it. */
export type BioResidue = { name: string; chain: string; seq: number; iCode: string; standard: boolean };

/** A residue's secondary structure, where a record gives one. */
export type Structure = "helix" | "strand";

export type Biopolymer = {
  /** Each atom's name (13-16), blanks trimmed. */
  names: string[];
  /** Each atom's residue, by its place in `residues`. */
  residueOf: number[];
  /** The residues, in the order the entry lists their atoms: a protein's from its amino end, a nucleic acid's from its 5' end (ATOM, *Details*). */
  residues: BioResidue[];
  /** Each residue's secondary structure; null, a HELIX or SHEET record takes in none. */
  structure: (Structure | null)[];
};

const keyOf = (chain: string, seq: number, iCode: string) => `${chain}|${seq}|${iCode}`;
const keyOfRecord = (r: PdbResidue) => keyOf(r.chainID, r.seqNum, r.iCode);

/**
 * The residues from `init` to `end` - a helix's or a strand's, its first
 * the N-terminal one - by their place among a chain's residues as listed:
 * every one between, whatever its number. None where either is not there.
 */
function between(residues: readonly BioResidue[], at: Map<string, number>, init: PdbResidue, end: PdbResidue): number[] {
  const a = at.get(keyOfRecord(init));
  const b = at.get(keyOfRecord(end));
  if (a === undefined || b === undefined || residues[a].chain !== residues[b].chain) return [];
  const out: number[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (residues[i].chain === residues[a].chain) out.push(i);
  return out;
}

/**
 * A model's atoms as a biopolymer: their names and residues, and the
 * residues' secondary structure from `helices` and `strands`. Undefined
 * where it holds no chain to draw - no alpha carbon and no phosphorus of a
 * nucleic acid's backbone (Introduction, MDLTYP: "C alpha or P atoms").
 */
export function biopolymerOf(atoms: readonly PdbAtom[], helices: readonly PdbHelix[], strands: readonly PdbStrand[]): Biopolymer | undefined {
  if (!atoms.some((a) => traceKind(a.name, a.element))) return undefined;
  const residues: BioResidue[] = [];
  const at = new Map<string, number>();
  const residueOf = atoms.map((a) => {
    const key = keyOf(a.chainID, a.resSeq, a.iCode);
    let i = at.get(key);
    if (i === undefined) {
      i = residues.length;
      at.set(key, i);
      residues.push({ name: a.resName, chain: a.chainID, seq: a.resSeq, iCode: a.iCode, standard: a.record === "ATOM" });
    } else if (a.record === "ATOM") residues[i].standard = true;
    return i;
  });
  const structure: (Structure | null)[] = residues.map(() => null);
  for (const h of helices) for (const i of between(residues, at, h.init, h.end)) structure[i] = "helix";
  for (const s of strands) for (const i of between(residues, at, s.init, s.end)) structure[i] = "strand";
  return { names: atoms.map((a) => a.name), residueOf, residues, structure };
}

/**
 * What an atom traces a chain's backbone as, by its name and element: a
 * protein's alpha carbon (CA), or a nucleic acid's phosphorus (P); neither,
 * null - calcium is named CA too, but is no carbon.
 */
export function traceKind(name: string, element: string): "protein" | "nucleic" | null {
  if (name === "CA" && element === "C") return "protein";
  if (name === "P" && element === "P") return "nucleic";
  return null;
}

/** Water, by its residue name in the Chemical Component Dictionary as the format's examples write it. */
export const isWater = (r: Pick<BioResidue, "name">) => r.name === "HOH" || r.name === "DOD";

/** A biopolymer as it reads back from a copy or a saved workspace, for a molecule of `n` atoms; undefined where it does not read. */
export function readBiopolymer(raw: unknown, n: number): Biopolymer | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Partial<Record<keyof Biopolymer, unknown>>;
  const { names, residueOf, residues, structure } = r;
  if (!Array.isArray(names) || !Array.isArray(residueOf) || !Array.isArray(residues) || !Array.isArray(structure)) return undefined;
  if (names.length !== n || residueOf.length !== n || structure.length !== residues.length) return undefined;
  if (!names.every((s) => typeof s === "string")) return undefined;
  if (!residueOf.every((i) => Number.isInteger(i) && i >= 0 && i < residues.length)) return undefined;
  const fine = (x: unknown): x is BioResidue => {
    const v = x as Partial<BioResidue>;
    return typeof v?.name === "string" && typeof v.chain === "string" && Number.isInteger(v.seq) && typeof v.iCode === "string" && typeof v.standard === "boolean";
  };
  if (!residues.every(fine)) return undefined;
  if (!structure.every((s) => s === null || s === "helix" || s === "strand")) return undefined;
  return {
    names: names as string[],
    residueOf: residueOf as number[],
    residues: (residues as BioResidue[]).map(({ name, chain, seq, iCode, standard }) => ({ name, chain, seq, iCode, standard })),
    structure: structure as (Structure | null)[],
  };
}

/**
 * A run of a chain drawn as one ribbon: protein or nucleic acid; its
 * residues in order, by their place in `residues`; each one's backbone
 * atom - its alpha carbon, or its phosphorus - and, for a protein, its
 * carbonyl oxygen (O), which says which way its peptide's plane faces.
 */
export type ChainRun = { kind: "protein" | "nucleic"; residues: number[]; trace: number[]; guide: (number | null)[] };

/** How far apart two residues' backbone atoms stand, at most, to be one run - a protein's alpha carbons are about 3.8 Å apart, a nucleic acid's phosphorus atoms about 6 to 7 - in ångströms; further, the chain is broken there. */
const RUN_GAP = { protein: 4.5, nucleic: 8.5 };

const runs = new WeakMap<Biopolymer, { xyz: readonly unknown[]; v: ChainRun[] }>();

/**
 * A biopolymer's chains as runs to draw (`ChainRun`), from where its atoms
 * stand (`atoms`, as the molecule's first frame has them): consecutive
 * residues of one chain whose backbone atoms are near enough, two or more
 * of them - a lone residue is drawn as its atoms.
 */
export function chainRuns(bp: Biopolymer, atoms: readonly { el: string; x: number; y: number; z: number }[]): ChainRun[] {
  const known = runs.get(bp);
  if (known && known.xyz === atoms) return known.v;
  const trace = new Map<number, { atom: number; kind: "protein" | "nucleic" }>();
  const guide = new Map<number, number>();
  atoms.forEach((a, i) => {
    const r = bp.residueOf[i];
    const kind = traceKind(bp.names[i], a.el);
    if (kind && !trace.has(r)) trace.set(r, { atom: i, kind });
    if (bp.names[i] === "O" && a.el === "O" && !guide.has(r)) guide.set(r, i);
  });
  const out: ChainRun[] = [];
  let run: ChainRun = { kind: "protein", residues: [], trace: [], guide: [] };
  const close = () => {
    if (run.residues.length >= 2) out.push(run);
    run = { kind: "protein", residues: [], trace: [], guide: [] };
  };
  for (let r = 0; r < bp.residues.length; r++) {
    const t = trace.get(r);
    if (!t) {
      close();
      continue;
    }
    if (run.residues.length) {
      const p = atoms[run.trace[run.trace.length - 1]];
      const q = atoms[t.atom];
      const near = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= RUN_GAP[t.kind];
      if (run.kind !== t.kind || bp.residues[run.residues[0]].chain !== bp.residues[r].chain || !near) close();
    }
    if (!run.residues.length) run.kind = t.kind;
    run.residues.push(r);
    run.trace.push(t.atom);
    run.guide.push(t.kind === "protein" ? (guide.get(r) ?? null) : null);
  }
  close();
  runs.set(bp, { xyz: atoms, v: out });
  return out;
}

/** How near a residue's atom comes to a ligand's or an ion's, at most, for the residue to be drawn about it, in ångströms: a contact's reach. */
export const POCKET_REACH = 4.5;

/** A protein residue's backbone atoms by name - what its ribbon stands for even where its side chain is drawn about a ligand. */
const BACKBONE = new Set(["N", "C", "O", "OXT", "H", "H1", "H2", "H3"]);

/**
 * The atoms a ribbon stands for, and so not drawn as atoms where ribbons
 * are: every atom of a residue in a run (`chainRuns`) - but for a residue
 * that comes within `POCKET_REACH` of something bound to the chains (a
 * ligand, an ion), whose side chain is drawn from its alpha carbon, so
 * that what holds the ligand shows; and water, which would hide them.
 * What is bound to the chains is drawn as atoms.
 */
export function ribbonAtoms(bp: Biopolymer, atoms: readonly { el: string; x: number; y: number; z: number }[]): Uint8Array {
  const inRun = new Uint8Array(bp.residues.length);
  for (const run of chainRuns(bp, atoms)) for (const r of run.residues) inRun[r] = 1;
  // what is bound: atoms of residues in no run, water left out
  const bound = atoms.flatMap((a, i) => (!inRun[bp.residueOf[i]] && !isWater(bp.residues[bp.residueOf[i]]) ? [a] : []));
  const pocket = new Uint8Array(bp.residues.length);
  if (bound.length) {
    const reach2 = POCKET_REACH * POCKET_REACH;
    atoms.forEach((a, i) => {
      const r = bp.residueOf[i];
      if (!inRun[r] || pocket[r]) return;
      for (const b of bound) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        if (dx * dx + dy * dy + dz * dz <= reach2) {
          pocket[r] = 1;
          return;
        }
      }
    });
  }
  const out = new Uint8Array(atoms.length);
  for (let i = 0; i < atoms.length; i++) {
    const r = bp.residueOf[i];
    if (isWater(bp.residues[r])) out[i] = 1;
    else if (inRun[r] && !(pocket[r] && !BACKBONE.has(bp.names[i]))) out[i] = 1;
  }
  return out;
}
