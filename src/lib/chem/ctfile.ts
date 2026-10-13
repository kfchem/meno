/**
 * Molfiles, SDfiles and Rxnfiles read as BIOVIA's "CTfile Formats"
 * (Chemistry 2026) describes them, V2000 and V3000 alike, into one form
 * that keeps everything they say about a structure - not only its atoms
 * and bonds, but atom lists and Rgroups, query and reaction properties,
 * Sgroups (abbreviations, polymers, data) and collections (enhanced
 * stereo). What each part of the app makes of it is its own business; this
 * reads the files, and says nothing about drawing.
 *
 * Indices are 0-based here wherever the file's are 1-based, and a V3000
 * file's own indices - which need only be unique - are turned into
 * positions.
 */
import { ELEMENTS } from "./elements";
import type { AtomList, Radical } from "./molecule";

export type { AtomList };

export type CtAtom = {
  x: number;
  y: number;
  z: number;
  /**
   * An element's symbol, or one of the reserved atom types: R# an Rgroup,
   * A any atom, Q any but C or H, X a halogen, M a metal, R any atom or H,
   * * a star atom, LP a lone pair - or L, for an atom list (`list`).
   */
  symbol: string;
  list?: AtomList;
  charge?: number;
  radical?: Radical;
  /** Its absolute mass, where it is one isotope. */
  mass?: number;
  /** Its valence as the file sets it: a number of bonds, 0 for none. */
  valence?: number;
  /** [Query] how many hydrogens it must have at least, 0 for none (H0). */
  hCount?: number;
  /** [Reaction] its atom-atom mapping number. */
  map?: number;
  /** [Reaction] whether its configuration inverts or is retained. */
  invRet?: "invert" | "retain";
  /** [Reaction] the change on it must be exactly as shown. */
  exactChange?: boolean;
  /** [Query] its double bond's configuration counts in a search. */
  stereoCare?: boolean;
  /** [Query] substitution count, unsaturation, ring bond count, as the file has them. */
  substitution?: number;
  unsaturated?: boolean;
  ringBonds?: number;
  /** Text shown in place of the atom's symbol (V2000 "A" line). */
  alias?: string;
  /** A value attached to the atom (V2000 "V" line). */
  value?: string;
  /** For an R# atom: the Rgroups that may stand there. */
  rgroups?: number[];
  /** [Rgroup member] which attachment point it is: 1, 2, or both (3). */
  attachPoint?: number;
  /** [Rgroup] the attachment order of each neighbour of an R# atom, by atom index. */
  attachOrder?: { neighbour: number; order: number }[];
};

export type CtBond = {
  a1: number;
  a2: number;
  /**
   * 1 single, 2 double, 3 triple, 4 aromatic, 5 single or double, 6 single
   * or aromatic, 7 double or aromatic, 8 any (5 to 8 for queries only),
   * 9 coordination, 10 hydrogen.
   */
  type: number;
  /**
   * A single bond's wedge (up), hashed wedge (down) or either; a double
   * bond's "either" - cis or trans, not known. Wedges start narrow at `a1`.
   */
  stereo?: "up" | "down" | "either";
  /** [Query] in a ring, or in a chain. */
  topology?: "ring" | "chain";
  /** [Reaction] reacting centre status, as the file's number. */
  reactingCentre?: number;
  /** [Query] its configuration counts in a search. */
  stereoCare?: boolean;
  /**
   * A bond from `a1` to several atoms at once (V3000 ENDPTS): to all of
   * them - a haptic bond to a pi system - or to any one of them.
   */
  endpoints?: number[];
  attach?: "all" | "any";
  /** How a coordination or hydrogen bond is displayed (V3000 DISP). */
  display?: "HBOND1" | "HBOND2" | "COORD" | "DATIVE";
};

export type CtBracket = { x1: number; y1: number; x2: number; y2: number };

export type CtSgroup = {
  /** Its type, by its first three letters: SUP, MUL, SRU, MON, MER, COP, CRO, MOD, GRA, COM, MIX, FOR, DAT, ANY, GEN. */
  type: string;
  /** The file's own number for it, for parents and collections to refer to. */
  index: number;
  atoms: number[];
  /** Crossing bonds (containment bonds for data Sgroups in V2000), by bond index. */
  bonds: number[];
  /** Containment bonds (V3000 CBONDS). */
  containment?: number[];
  /** A multiple group's paradigmatic repeating unit. */
  patoms?: number[];
  subtype?: string;
  multiplier?: number;
  connect?: string;
  /** Its parent Sgroup, by `index`. */
  parent?: number;
  componentNumber?: number;
  /** An abbreviation's label, a multiple group's multiplier, a polymer's subscript. */
  label?: string;
  brackets: CtBracket[];
  bracketStyle?: "bracket" | "paren";
  /** An abbreviation shown expanded rather than as its label. */
  expanded?: boolean;
  /** An abbreviation's attachment points: the atom, the atom that leaves, an id. */
  attachments?: { atom: number; leaving: number | null; id: string }[];
  /** A contracted abbreviation's crossing bond and the vector to it (SBV, CSTATE). */
  bondVectors?: { bond: number; x: number; y: number }[];
  className?: string;
  /** A data Sgroup's field, its data and how it is shown. */
  field?: {
    name: string;
    type?: string;
    units?: string;
    data: string[];
    display?: string;
    info?: string;
    queryType?: string;
    queryOp?: string;
  };
  /** Crossing bonds that share a bracket (CRS), and the head bracket's (XBHEAD) and correspondence (XBCORR). */
  crossings?: number[][];
  head?: number[];
  correspondence?: number[];
};

/** A V3000 collection: MDLV30/STEABS, MDLV30/STERACn, MDLV30/STEBRELn, MDLV30/HILITE, or a file's own. */
export type CtCollection = { name: string; atoms: number[]; bonds: number[]; sgroups: number[] };

/** A link atom: atom and its substituents repeated min to max times. */
export type CtLink = { atom: number; min: number; max: number; ends: number[] };

export type CtRgroup = {
  number: number;
  /** IF this Rgroup THEN `then`; RestH; the occurrence range, as text. */
  logic?: { then: number; restH: boolean; occurrence: string };
  members: CtMolecule[];
};

export type CtMolecule = {
  name: string;
  atoms: CtAtom[];
  bonds: CtBond[];
  sgroups: CtSgroup[];
  collections: CtCollection[];
  links: CtLink[];
  rgroups: CtRgroup[];
  /** The chiral flag: a single stereoisomer, as drawn. */
  chiral: boolean;
  /** Which version the block was written in. */
  version: "V2000" | "V3000";
  /**
   * Its connection table ends before it does - a file cut short: before
   * the atoms and bonds its counts line gives (V2000), or with no END CTAB
   * (V3000). What it has, and no more.
   */
  cutShort?: boolean;
};

export type CtReaction = {
  name: string;
  reactants: CtMolecule[];
  products: CtMolecule[];
  reagents: CtMolecule[];
};

// --- shared ------------------------------------------------------------------

const RADICALS: Record<number, Radical> = { 1: "singlet", 2: "doublet", 3: "triplet" };
const SYMBOL_OF = new Map<number, string>(ELEMENTS.map((e) => [e.number, e.symbol]));

/**
 * The mass the periodic table gives each element, rounded: what a V2000
 * atom block's mass difference is a difference from. (The M  ISO line,
 * which gives the mass itself, supersedes it.)
 */
const TABLE_MASS: Record<string, number> = {
  H: 1, He: 4, Li: 7, Be: 9, B: 11, C: 12, N: 14, O: 16, F: 19, Ne: 20,
  Na: 23, Mg: 24, Al: 27, Si: 28, P: 31, S: 32, Cl: 35, Ar: 40, K: 39, Ca: 40,
  Sc: 45, Ti: 48, V: 51, Cr: 52, Mn: 55, Fe: 56, Co: 59, Ni: 59, Cu: 64, Zn: 65,
  Ga: 70, Ge: 73, As: 75, Se: 79, Br: 80, Kr: 84, Rb: 85, Sr: 88, Y: 89, Zr: 91,
  Nb: 93, Mo: 96, Ru: 101, Rh: 103, Pd: 106, Ag: 108, Cd: 112, In: 115, Sn: 119,
  Sb: 122, Te: 128, I: 127, Xe: 131, Cs: 133, Ba: 137, La: 139, Ce: 140, Pt: 195,
  Au: 197, Hg: 201, Tl: 204, Pb: 207, Bi: 209,
};

const int = (s: string | undefined): number => {
  const n = Number.parseInt((s ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
};
const float = (s: string | undefined): number => {
  const n = Number.parseFloat((s ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
};

const lines = (text: string): string[] => text.replace(/\r\n?/g, "\n").split("\n");

const emptyMolecule = (version: CtMolecule["version"], name = ""): CtMolecule => ({
  name,
  atoms: [],
  bonds: [],
  sgroups: [],
  collections: [],
  links: [],
  rgroups: [],
  chiral: false,
  version,
});

const STEREO_OF_SINGLE: Record<number, CtBond["stereo"]> = { 1: "up", 4: "either", 6: "down" };

// --- V2000 -------------------------------------------------------------------

/** A V2000 counts line: atoms, bonds, atom lists, the chiral flag, and its version stamp. */
function countsV2000(line: string) {
  let atoms = Number.parseInt(line.slice(0, 3), 10);
  let bonds = Number.parseInt(line.slice(3, 6), 10);
  if (!Number.isFinite(atoms) || !Number.isFinite(bonds)) {
    // (some writers leave the fixed columns: whatever the numbers are)
    const m = line.trim().match(/^(\d+)\s+(\d+)/);
    atoms = m ? Number.parseInt(m[1], 10) : NaN;
    bonds = m ? Number.parseInt(m[2], 10) : NaN;
  }
  return {
    atoms,
    bonds,
    lists: int(line.slice(6, 9)),
    chiral: int(line.slice(12, 15)) === 1,
    version: /V3000/i.test(line) ? ("V3000" as const) : ("V2000" as const),
  };
}

/** Where a molfile's counts line is: its fourth line, or the first that reads as one. */
function findCounts(ls: string[], from: number): number {
  const at = ls[from + 3];
  if (at != null && (/V[23]000/i.test(at) || Number.isFinite(Number.parseInt(at.slice(0, 3), 10)))) {
    return from + 3;
  }
  for (let i = from; i < Math.min(ls.length, from + 8); i++) {
    if (/V[23]000\s*$/i.test(ls[i]) || /^\s*\d+\s+\d+(\s+\d+){3,}/.test(ls[i])) return i;
  }
  return -1;
}

function atomV2000(line: string): CtAtom {
  let x = float(line.slice(0, 10));
  let y = float(line.slice(10, 20));
  let z = float(line.slice(20, 30));
  let symbol = line.slice(31, 34).trim();
  // aaaddcccssshhhbbbvvvHHHrrriiimmmnnneee after the symbol
  let [dd, ccc, , hhh, bbb, vvv, HHH, , , mmm, nnn, eee] = [
    line.slice(34, 36),
    line.slice(36, 39),
    line.slice(39, 42),
    line.slice(42, 45),
    line.slice(45, 48),
    line.slice(48, 51),
    line.slice(51, 54),
    line.slice(54, 57),
    line.slice(57, 60),
    line.slice(60, 63),
    line.slice(63, 66),
    line.slice(66, 69),
  ];
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    // Not in its columns: read it as whitespace-separated fields instead.
    const t = line.trim().split(/\s+/);
    x = float(t[0]);
    y = float(t[1]);
    z = float(t[2]);
    symbol = t[3] ?? "";
    [dd, ccc, , hhh, bbb, vvv, HHH, , , mmm, nnn, eee] = t.slice(4);
  }
  const atom: CtAtom = { x: x || 0, y: y || 0, z: Number.isFinite(z) ? z : 0, symbol: symbol || "C" };
  const massDiff = int(dd);
  if (massDiff && TABLE_MASS[atom.symbol]) atom.mass = TABLE_MASS[atom.symbol] + massDiff;
  const charge = int(ccc);
  if (charge === 4) atom.radical = "doublet";
  else if (charge >= 1 && charge <= 7) atom.charge = 4 - charge;
  const h = int(hhh);
  if (h > 0) atom.hCount = h - 1;
  if (int(HHH) === 1 && atom.hCount == null) atom.hCount = 0;
  if (int(bbb) === 1) atom.stereoCare = true;
  const v = int(vvv);
  if (v === 15) atom.valence = 0;
  else if (v > 0) atom.valence = v;
  const map = int(mmm);
  if (map > 0) atom.map = map;
  const ir = int(nnn);
  if (ir === 1) atom.invRet = "invert";
  else if (ir === 2) atom.invRet = "retain";
  if (int(eee) === 1) atom.exactChange = true;
  return atom;
}

function bondV2000(line: string): CtBond | null {
  let a1 = Number.parseInt(line.slice(0, 3), 10);
  let a2 = Number.parseInt(line.slice(3, 6), 10);
  let type = Number.parseInt(line.slice(6, 9), 10);
  let [sss, , rrr, ccc] = [line.slice(9, 12), line.slice(12, 15), line.slice(15, 18), line.slice(18, 21)];
  if (!Number.isFinite(a1) || !Number.isFinite(a2) || !Number.isFinite(type)) {
    const t = line.trim().split(/\s+/);
    a1 = Number.parseInt(t[0], 10);
    a2 = Number.parseInt(t[1], 10);
    type = Number.parseInt(t[2], 10);
    [sss, , rrr, ccc] = t.slice(3);
  }
  if (!Number.isFinite(a1) || !Number.isFinite(a2) || !Number.isFinite(type)) return null;
  const bond: CtBond = { a1: a1 - 1, a2: a2 - 1, type };
  const stereo = int(sss);
  // single bonds' wedges; a double bond's 3 is cis or trans, not known
  if (type === 2) {
    if (stereo === 3) bond.stereo = "either";
  } else if (STEREO_OF_SINGLE[stereo]) {
    bond.stereo = STEREO_OF_SINGLE[stereo];
  }
  const topo = int(rrr);
  if (topo === 1) bond.topology = "ring";
  else if (topo === 2) bond.topology = "chain";
  const centre = int(ccc);
  if (centre) bond.reactingCentre = centre;
  return bond;
}

/** The pairs on a V2000 "nn8 aaa vvv ..." line, after its tag. */
function pairs(rest: string): [number, number][] {
  const t = rest.trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
  const out: [number, number][] = [];
  for (let k = 0; k < t[0] && 2 + 2 * k <= t.length; k++) out.push([t[1 + 2 * k], t[2 + 2 * k]]);
  return out;
}

/** The pairs on a V2000 "nn8 sss ttt ..." line whose second items are words. */
function wordPairs(rest: string): [number, string][] {
  const t = rest.trim().split(/\s+/);
  const out: [number, string][] = [];
  const n = Number.parseInt(t[0], 10);
  for (let k = 0; k < n && 2 + 2 * k <= t.length; k++) out.push([Number.parseInt(t[1 + 2 * k], 10), t[2 + 2 * k]]);
  return out;
}

/**
 * A V2000 connection table, from its counts line at `at` to its M  END:
 * the molecule, and the line after it.
 */
function ctabV2000(ls: string[], at: number, name: string): { mol: CtMolecule; next: number } {
  const counts = countsV2000(ls[at] ?? "");
  const mol = emptyMolecule("V2000", name);
  mol.chiral = counts.chiral;
  let i = at + 1;
  // (the file ending, or its M  END coming, where an atom or a bond is
  // still to come: cut short - the rest not read from what is not there,
  // carbons at 0, 0)
  const short = (l: string | undefined) => l == null || !l.trim() || /^(M {2}END|\${4}|\$MOL)/.test(l);
  for (let k = 0; k < (counts.atoms || 0) + (counts.bonds || 0); k++, i++) {
    if (short(ls[i])) {
      mol.cutShort = true;
      return { mol, next: i };
    }
    if (k < (counts.atoms || 0)) mol.atoms.push(atomV2000(ls[i]));
    else {
      const b = bondV2000(ls[i]);
      if (b) mol.bonds.push(b);
    }
  }
  // the atom list block: "aaa kSSSSn 111 222 333 444 555", atomic numbers
  for (let k = 0; k < counts.lists; k++, i++) {
    const l = ls[i] ?? "";
    const atom = mol.atoms[int(l.slice(0, 3)) - 1];
    if (!atom) continue;
    const n = int(l.slice(9, 10));
    const symbols: string[] = [];
    for (let e = 0; e < n; e++) {
      const s = SYMBOL_OF.get(int(l.slice(10 + 4 * e, 14 + 4 * e)));
      if (s) symbols.push(s);
    }
    atom.list = { not: l.slice(4, 5) === "T", symbols };
  }
  i = propertiesV2000(ls, i, mol);
  return { mol, next: i };
}

/** A V2000 properties block, up to and past M  END: what it says about `mol`. */
function propertiesV2000(ls: string[], from: number, mol: CtMolecule): number {
  const sgroups = new Map<number, CtSgroup>();
  const sgroup = (n: number) => {
    let g = sgroups.get(n);
    if (!g) {
      g = { type: "GEN", index: n, atoms: [], bonds: [], brackets: [] };
      sgroups.set(n, g);
    }
    return g;
  };
  const dataLine = new Map<number, string>();
  let chargesSet = false;
  let i = from;
  for (; i < ls.length; i++) {
    const l = ls[i];
    if (/^M {2}END/.test(l) || /^\$\$\$\$/.test(l) || /^\$MOL/.test(l) || /^\$RGP|^\$END/.test(l)) break;
    const atomAt = (s: string) => mol.atoms[int(s) - 1];
    if (/^A {2}/.test(l)) {
      // an alias: the atom on this line, its text on the next
      const atom = atomAt(l.slice(3, 6));
      const text = ls[i + 1] ?? "";
      i++;
      if (atom) atom.alias = text.trim();
      continue;
    }
    if (/^V {2}/.test(l)) {
      const atom = atomAt(l.slice(3, 6));
      if (atom) atom.value = l.slice(7).trim();
      continue;
    }
    if (/^G {2}/.test(l)) {
      // a group abbreviation of old: the atoms on aaa's side of the aaa-ppp bond
      const a = int(l.slice(3, 6)) - 1;
      const p = int(l.slice(6, 9)) - 1;
      const text = (ls[i + 1] ?? "").trim();
      i++;
      const side = sideOf(mol, a, p);
      const bond = mol.bonds.findIndex((b) => (b.a1 === a && b.a2 === p) || (b.a1 === p && b.a2 === a));
      const n = Math.max(0, ...sgroups.keys(), ...mol.sgroups.map((g) => g.index)) + 1;
      sgroups.set(n, {
        type: "SUP",
        index: n,
        atoms: side,
        bonds: bond >= 0 ? [bond] : [],
        brackets: [],
        label: text,
      });
      continue;
    }
    if (/^S {2}SKP/.test(l)) {
      i += int(l.slice(6, 9));
      continue;
    }
    const m = /^M {2}(\S{3})(.*)$/.exec(l);
    if (!m) continue;
    const [, tag, rest] = m;
    switch (tag) {
      case "CHG":
      case "RAD": {
        if (!chargesSet) {
          // either line clears what the atom block said about charges and radicals
          for (const a of mol.atoms) {
            delete a.charge;
            delete a.radical;
          }
          chargesSet = true;
        }
        for (const [a, v] of pairs(rest)) {
          const atom = mol.atoms[a - 1];
          if (!atom) continue;
          if (tag === "CHG") {
            if (v) atom.charge = v;
            else delete atom.charge;
          } else if (RADICALS[v]) atom.radical = RADICALS[v];
          else delete atom.radical;
        }
        break;
      }
      case "ISO":
        for (const [a, v] of pairs(rest)) {
          const atom = mol.atoms[a - 1];
          if (atom && v > 0) atom.mass = v;
        }
        break;
      case "RBC":
      case "SUB":
      case "UNS":
        for (const [a, v] of pairs(rest)) {
          const atom = mol.atoms[a - 1];
          if (!atom || !v) continue;
          if (tag === "RBC") atom.ringBonds = v;
          else if (tag === "SUB") atom.substitution = v;
          else atom.unsaturated = v === 1;
        }
        break;
      case "LIN": {
        const t = rest.trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
        for (let k = 0; k < t[0]; k++) {
          const [a, v, b, c] = t.slice(1 + 4 * k, 5 + 4 * k);
          if (a > 0) mol.links.push({ atom: a - 1, min: 1, max: v, ends: [b, c].filter((e) => e > 0).map((e) => e - 1) });
        }
        break;
      }
      case "ALS": {
        // "M  ALS aaannn e 1111222233334444..." - symbols four wide
        const atom = mol.atoms[int(l.slice(7, 10)) - 1];
        const n = int(l.slice(10, 13));
        if (!atom) break;
        const symbols: string[] = [];
        for (let e = 0; e < n; e++) {
          const s = l.slice(16 + 4 * e, 20 + 4 * e).trim();
          if (s) symbols.push(s);
        }
        atom.list = { not: l.slice(14, 15) === "T", symbols };
        break;
      }
      case "APO":
        for (const [a, v] of pairs(rest)) {
          const atom = mol.atoms[a - 1];
          if (atom && v) atom.attachPoint = v;
        }
        break;
      case "AAL": {
        const t = rest.trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
        const atom = mol.atoms[t[0] - 1];
        if (!atom) break;
        atom.attachOrder = [];
        for (let k = 0; k < t[1]; k++) {
          atom.attachOrder.push({ neighbour: t[2 + 2 * k] - 1, order: t[3 + 2 * k] });
        }
        break;
      }
      case "RGP":
        for (const [a, r] of pairs(rest)) {
          const atom = mol.atoms[a - 1];
          if (atom && r > 0) atom.rgroups = [...(atom.rgroups ?? []), r];
        }
        break;
      case "LOG": {
        // "M  LOG  1 rrr iii hhh ooo..."
        const r = int(l.slice(10, 14));
        const then = int(l.slice(14, 18));
        const restH = int(l.slice(18, 22)) === 1;
        const occurrence = l.slice(22).trim() || ">0";
        rgroupOf(mol, r).logic = { then, restH, occurrence };
        break;
      }
      case "STY":
        for (const [n, t] of wordPairs(rest)) sgroup(n).type = t.slice(0, 3).toUpperCase();
        break;
      case "SST":
        for (const [n, t] of wordPairs(rest)) sgroup(n).subtype = t.slice(0, 3).toUpperCase();
        break;
      case "SCN":
        for (const [n, t] of wordPairs(rest)) sgroup(n).connect = t.toUpperCase();
        break;
      case "SBT":
        for (const [n, t] of wordPairs(rest)) sgroup(n).bracketStyle = t === "1" ? "paren" : "bracket";
        break;
      case "SPL":
        for (const [c, p] of pairs(rest)) sgroup(c).parent = p;
        break;
      case "SNC":
        for (const [n, o] of pairs(rest)) sgroup(n).componentNumber = o;
        break;
      case "SLB":
        // (unique identifiers for the Sgroups: not needed to read them)
        break;
      case "SDS": {
        // "M  SDS EXPn15 sss ..."
        const t = l.slice(10).trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
        for (let k = 0; k < t[0]; k++) sgroup(t[1 + k]).expanded = true;
        break;
      }
      case "SAL":
      case "SBL":
      case "SPA": {
        const t = rest.trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
        const g = sgroup(t[0]);
        const items = t.slice(2, 2 + t[1]).map((v) => v - 1);
        if (tag === "SAL") g.atoms.push(...items);
        else if (tag === "SBL") g.bonds.push(...items);
        else g.patoms = [...(g.patoms ?? []), ...items];
        break;
      }
      case "SMT": {
        // "M  SMT sss m..." - the text from column 12
        const g = sgroup(int(l.slice(7, 10)));
        g.label = l.slice(11).trim();
        const n = Number.parseInt(g.label, 10);
        if (g.type === "MUL" && Number.isFinite(n)) g.multiplier = n;
        break;
      }
      case "CRS": {
        const t = rest.trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
        const g = sgroup(t[0]);
        g.crossings = [...(g.crossings ?? []), t.slice(2, 2 + t[1]).map((v) => v - 1)];
        break;
      }
      case "SDI": {
        const t = rest.trim().split(/\s+/);
        const g = sgroup(Number.parseInt(t[0], 10));
        const [x1, y1, x2, y2] = t.slice(2, 6).map(float);
        if ([x1, y1, x2, y2].every(Number.isFinite)) g.brackets.push({ x1, y1, x2, y2 });
        break;
      }
      case "SBV": {
        const t = rest.trim().split(/\s+/);
        const g = sgroup(Number.parseInt(t[0], 10));
        g.bondVectors = [
          ...(g.bondVectors ?? []),
          { bond: Number.parseInt(t[1], 10) - 1, x: float(t[2]), y: float(t[3]) },
        ];
        break;
      }
      case "SDT": {
        // "M  SDT sss fff...fff(30)g hhh...(20)ii jjj..."
        const g = sgroup(int(l.slice(7, 10)));
        g.field = {
          ...(g.field ?? { data: [] }),
          name: l.slice(11, 41).trim(),
          type: l.slice(41, 42).trim() || undefined,
          units: l.slice(42, 62).trim() || undefined,
          queryType: l.slice(62, 64).trim() || undefined,
          queryOp: l.slice(64).trim() || undefined,
        };
        break;
      }
      case "SDD": {
        const g = sgroup(int(l.slice(7, 10)));
        g.field = { ...(g.field ?? { name: "", data: [] }), display: l.slice(11) };
        break;
      }
      case "SCD":
      case "SED": {
        // 69 characters of data from column 12; an SED ends the line
        const n = int(l.slice(7, 10));
        const text = (dataLine.get(n) ?? "") + l.slice(11, 80);
        if (tag === "SCD") {
          dataLine.set(n, text);
        } else {
          const g = sgroup(n);
          g.field = { ...(g.field ?? { name: "" }), data: [...(g.field?.data ?? []), text.replace(/\s+$/, "").slice(0, 200)] };
          dataLine.delete(n);
        }
        break;
      }
      case "SAP": {
        // "M  SAP sssnn6 iii ooo cc", each entry 11 wide from column 14
        const g = sgroup(int(l.slice(7, 10)));
        const n = int(l.slice(10, 13));
        for (let k = 0; k < n; k++) {
          const e = l.slice(13 + 11 * k, 24 + 11 * k);
          const atom = int(e.slice(1, 4)) - 1;
          const out = int(e.slice(5, 8));
          if (atom < 0) continue;
          g.attachments = [
            ...(g.attachments ?? []),
            { atom, leaving: out > 0 ? out - 1 : null, id: e.slice(9, 11).trim() },
          ];
        }
        break;
      }
      case "SCL": {
        const g = sgroup(int(l.slice(7, 10)));
        g.className = l.slice(11).trim();
        break;
      }
      default:
        // anything else is not understood here, and ignored, as the format says
        break;
    }
  }
  for (const g of sgroups.values()) mol.sgroups.push(g);
  // past the M  END
  if (/^M {2}END/.test(ls[i] ?? "")) i++;
  return i;
}

/** The atoms on `a`'s side of the bond a-p, `a` among them. */
function sideOf(mol: CtMolecule, a: number, p: number): number[] {
  const seen = new Set<number>([a]);
  const stack = [a];
  while (stack.length) {
    const at = stack.pop()!;
    for (const b of mol.bonds) {
      const other = b.a1 === at ? b.a2 : b.a2 === at ? b.a1 : -1;
      if (other < 0 || other === p || seen.has(other)) continue;
      seen.add(other);
      stack.push(other);
    }
  }
  return [...seen].sort((x, y) => x - y);
}

function rgroupOf(mol: CtMolecule, n: number): CtRgroup {
  let r = mol.rgroups.find((g) => g.number === n);
  if (!r) {
    r = { number: n, members: [] };
    mol.rgroups.push(r);
  }
  return r;
}

/**
 * The Rgroups an RGfile's V2000 root carries after its M  END: "$RGP",
 * the Rgroup's number, then a "$CTAB" ... "$END CTAB" per member, to
 * "$END RGP".
 */
function rgroupsV2000(ls: string[], from: number, mol: CtMolecule): number {
  let i = from;
  while (i < ls.length && /^\$RGP/.test(ls[i])) {
    const r = rgroupOf(mol, int(ls[i + 1]));
    i += 2;
    while (i < ls.length && /^\$CTAB/.test(ls[i])) {
      // a member's CTAB has no header: its counts line comes first
      const { mol: member, next } = ctabV2000(ls, i + 1, "");
      r.members.push(member);
      i = next;
      while (i < ls.length && !/^\$END CTAB/.test(ls[i])) i++;
      i++;
    }
    while (i < ls.length && !/^\$END RGP/.test(ls[i])) i++;
    i++;
  }
  return i;
}

// --- V3000 -------------------------------------------------------------------

/**
 * V3000 lines, "M  V30 " stripped and a trailing "-" joined to the next
 * line's text, from `from` up to and including "M  END" or a line that is
 * not V3000; and where it stopped.
 */
function v30Lines(ls: string[], from: number): { out: string[]; next: number } {
  const out: string[] = [];
  let i = from;
  let carry = "";
  for (; i < ls.length; i++) {
    const l = ls[i];
    const m = /^M {2}V30 ?(.*)$/.exec(l);
    if (!m) {
      if (/^M {2}END/.test(l)) {
        i++;
        break;
      }
      // (other lines between V3000 blocks - an old-style property, say - pass)
      if (/^\$/.test(l)) break;
      continue;
    }
    let text = m[1];
    if (text.endsWith("-")) {
      carry += text.slice(0, -1);
      continue;
    }
    text = carry + text;
    carry = "";
    out.push(text);
  }
  if (carry) out.push(carry);
  return { out, next: i };
}

/**
 * A V3000 entry's items: positional values and KEYWORD=value pairs, where a
 * value may be "quoted" ("" a literal quote) or a (N v1 ... vN) list.
 */
export function v30Items(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    let item = "";
    let depth = 0;
    let quoted = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            item += '"';
            i++;
            continue;
          }
          quoted = false;
          continue;
        }
        item += c;
        continue;
      }
      if (c === '"') {
        quoted = true;
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (/\s/.test(c) && depth <= 0) break;
      item += c;
    }
    out.push(item);
  }
  return out;
}

/** An entry's KEYWORD=value pairs, keywords in capitals; a keyword given twice keeps every value. */
function keywords(items: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const it of items) {
    const eq = it.indexOf("=");
    if (eq <= 0) continue;
    const key = it.slice(0, eq).toUpperCase();
    out.set(key, [...(out.get(key) ?? []), it.slice(eq + 1)]);
  }
  return out;
}

/** A (N v1 ... vN) list's values. */
function list(value: string | undefined): string[] {
  if (!value) return [];
  const m = /^\((.*)\)$/.exec(value.trim());
  if (!m) return [value];
  const t = m[1].trim().split(/\s+/);
  return t.slice(1, 1 + Number.parseInt(t[0], 10));
}

/** An atom's type, as a symbol and, for a list, the list. */
function atomType(type: string): { symbol: string; list?: AtomList } {
  const m = /^(NOT\s*)?\[(.*)\]$/i.exec(type.trim());
  if (!m) return { symbol: type };
  return {
    symbol: "L",
    list: { not: !!m[1], symbols: m[2].split(",").map((s) => s.trim()).filter(Boolean) },
  };
}

/**
 * A V3000 CTAB, its "BEGIN CTAB" at `at` among V3000 lines: the molecule,
 * and the line after its Rgroups.
 */
function ctabV3000(v: string[], at: number, name: string): { mol: CtMolecule; next: number } {
  const mol = emptyMolecule("V3000", name);
  const atomIndex = new Map<number, number>();
  const bondIndex = new Map<number, number>();
  const sgroupIndex = new Map<number, number>();
  const atomOf = (s: string) => atomIndex.get(Number.parseInt(s, 10)) ?? -1;
  const atomsOf = (value: string | undefined) => list(value).map(atomOf).filter((a) => a >= 0);
  let block = "";
  let defaults: string[] = [];
  let ended = false;
  let i = at + 1;
  for (; i < v.length; i++) {
    const text = v[i];
    const items = v30Items(text);
    const head = (items[0] ?? "").toUpperCase();
    if (head === "END" && (items[1] ?? "").toUpperCase() === "CTAB") {
      ended = true;
      i++;
      break;
    }
    if (head === "BEGIN") {
      block = (items[1] ?? "").toUpperCase();
      defaults = [];
      continue;
    }
    if (head === "END") {
      block = "";
      continue;
    }
    if (head === "COUNTS") {
      mol.chiral = items[5] === "1";
      const kw = keywords(items);
      if (kw.get("NAME")) mol.name = kw.get("NAME")![0];
      continue;
    }
    if (head === "LINKNODE") {
      // LINKNODE minrep maxrep nbonds inatom outatom ...
      const [min, max, n] = items.slice(1, 4).map((s) => Number.parseInt(s, 10));
      const ends = items.slice(4, 4 + 2 * n).map(atomOf);
      if (ends.length) mol.links.push({ atom: ends[0], min, max, ends: ends.slice(1) });
      continue;
    }
    if (head === "DEFAULT") {
      defaults = items.slice(1);
      continue;
    }
    const kw = keywords([...defaults, ...items]);
    const one = (k: string) => kw.get(k)?.[kw.get(k)!.length - 1];
    if (block === "ATOM") {
      const index = Number.parseInt(items[0], 10);
      const { symbol, list: atomList } = atomType(items[1] ?? "C");
      const atom: CtAtom = {
        x: float(items[2]) || 0,
        y: float(items[3]) || 0,
        z: float(items[4]) || 0,
        symbol,
        ...(atomList ? { list: atomList } : {}),
      };
      const map = Number.parseInt(items[5] ?? "0", 10);
      if (map > 0) atom.map = map;
      const n = (k: string) => Number.parseInt(one(k) ?? "0", 10);
      if (n("CHG")) atom.charge = n("CHG");
      if (RADICALS[n("RAD")]) atom.radical = RADICALS[n("RAD")];
      if (n("MASS") > 0) atom.mass = n("MASS");
      if (n("VAL") === -1) atom.valence = 0;
      else if (n("VAL") > 0) atom.valence = n("VAL");
      if (n("HCOUNT") === -1) atom.hCount = 0;
      else if (n("HCOUNT") > 0) atom.hCount = n("HCOUNT");
      if (n("STBOX") === 1) atom.stereoCare = true;
      if (n("INVRET") === 1) atom.invRet = "invert";
      else if (n("INVRET") === 2) atom.invRet = "retain";
      if (n("EXACHG") === 1) atom.exactChange = true;
      if (n("SUBST")) atom.substitution = n("SUBST");
      if (n("UNSAT") === 1) atom.unsaturated = true;
      if (n("RBCNT")) atom.ringBonds = n("RBCNT");
      if (n("ATTCHPT")) atom.attachPoint = n("ATTCHPT") === -1 ? 3 : n("ATTCHPT");
      const rg = list(one("RGROUPS")).map((s) => Number.parseInt(s, 10)).filter((r) => r > 0);
      if (rg.length) atom.rgroups = rg;
      const order = list(one("ATTCHORD"));
      if (order.length) {
        atom.attachOrder = [];
        for (let k = 0; k + 1 < order.length; k += 2) {
          atom.attachOrder.push({ neighbour: Number.parseInt(order[k], 10), order: Number.parseInt(order[k + 1], 10) });
        }
      }
      atomIndex.set(index, mol.atoms.length);
      mol.atoms.push(atom);
      continue;
    }
    if (block === "BOND") {
      const index = Number.parseInt(items[0], 10);
      const type = Number.parseInt(items[1], 10);
      const a1 = atomOf(items[2]);
      const a2 = atomOf(items[3]);
      if (!Number.isFinite(type) || a1 < 0 || a2 < 0) continue;
      const bond: CtBond = { a1, a2, type };
      const cfg = Number.parseInt(one("CFG") ?? "0", 10);
      if (type === 2) {
        if (cfg === 2) bond.stereo = "either";
      } else if (cfg === 1) bond.stereo = "up";
      else if (cfg === 2) bond.stereo = "either";
      else if (cfg === 3) bond.stereo = "down";
      const topo = Number.parseInt(one("TOPO") ?? "0", 10);
      if (topo === 1) bond.topology = "ring";
      else if (topo === 2) bond.topology = "chain";
      const centre = Number.parseInt(one("RXCTR") ?? "0", 10);
      if (centre) bond.reactingCentre = centre;
      if (one("STBOX") === "1") bond.stereoCare = true;
      const ends = atomsOf(one("ENDPTS"));
      if (ends.length) {
        bond.endpoints = ends;
        bond.attach = (one("ATTACH") ?? "ALL").toUpperCase() === "ANY" ? "any" : "all";
      }
      const disp = (one("DISP") ?? "").toUpperCase();
      if (disp === "HBOND1" || disp === "HBOND2" || disp === "COORD" || disp === "DATIVE") bond.display = disp;
      bondIndex.set(index, mol.bonds.length);
      mol.bonds.push(bond);
      continue;
    }
    if (block === "SGROUP") {
      const index = Number.parseInt(items[0], 10);
      const g: CtSgroup = {
        type: (items[1] ?? "GEN").slice(0, 3).toUpperCase(),
        index,
        atoms: atomsOf(one("ATOMS")),
        bonds: list(one("XBONDS")).map((s) => bondIndex.get(Number.parseInt(s, 10)) ?? -1).filter((b) => b >= 0),
        brackets: [],
      };
      const bondsOf = (k: string) =>
        list(one(k)).map((s) => bondIndex.get(Number.parseInt(s, 10)) ?? -1).filter((b) => b >= 0);
      if (kw.get("CBONDS")) g.containment = bondsOf("CBONDS");
      if (kw.get("PATOMS")) g.patoms = atomsOf(one("PATOMS"));
      if (one("SUBTYPE")) g.subtype = one("SUBTYPE")!.slice(0, 3).toUpperCase();
      if (one("MULT")) g.multiplier = Number.parseInt(one("MULT")!, 10);
      if (one("CONNECT")) g.connect = one("CONNECT")!.toUpperCase();
      if (one("PARENT")) g.parent = Number.parseInt(one("PARENT")!, 10);
      if (one("COMPNO")) g.componentNumber = Number.parseInt(one("COMPNO")!, 10);
      if (one("LABEL") != null) g.label = one("LABEL");
      if (kw.get("XBHEAD")) g.head = bondsOf("XBHEAD");
      if (kw.get("XBCORR")) g.correspondence = bondsOf("XBCORR");
      for (const b of kw.get("BRKXYZ") ?? []) {
        const t = list(b).map(float);
        if (t.length >= 5) g.brackets.push({ x1: t[0], y1: t[1], x2: t[3], y2: t[4] });
      }
      const brk = (one("BRKTYP") ?? "").toUpperCase();
      if (brk) g.bracketStyle = brk === "PAREN" ? "paren" : "bracket";
      if ((one("ESTATE") ?? "").toUpperCase() === "E") g.expanded = true;
      for (const c of kw.get("CSTATE") ?? []) {
        const t = list(c);
        const bond = bondIndex.get(Number.parseInt(t[0], 10));
        if (bond != null) g.bondVectors = [...(g.bondVectors ?? []), { bond, x: float(t[1]), y: float(t[2]) }];
      }
      for (const s of kw.get("SAP") ?? []) {
        const t = list(s);
        const atom = atomOf(t[0]);
        const leaving = t[1] && t[1] !== "0" ? atomOf(t[1]) : -1;
        if (atom >= 0) {
          g.attachments = [...(g.attachments ?? []), { atom, leaving: leaving >= 0 ? leaving : null, id: t[2] ?? "" }];
        }
      }
      if (one("CLASS")) g.className = one("CLASS");
      if (kw.get("FIELDNAME") || kw.get("FIELDDATA")) {
        g.field = {
          name: one("FIELDNAME") ?? "",
          data: kw.get("FIELDDATA") ?? [],
          ...(one("FIELDDISP") ? { display: one("FIELDDISP") } : {}),
          ...(one("FIELDINFO") ? { info: one("FIELDINFO") } : {}),
          ...(one("QUERYTYPE") ? { queryType: one("QUERYTYPE") } : {}),
          ...(one("QUERYOP") ? { queryOp: one("QUERYOP") } : {}),
        };
      }
      sgroupIndex.set(index, mol.sgroups.length);
      mol.sgroups.push(g);
      continue;
    }
    if (block === "COLLECTION") {
      mol.collections.push({
        name: items[0] ?? "",
        atoms: atomsOf(one("ATOMS")),
        bonds: list(one("BONDS")).map((s) => bondIndex.get(Number.parseInt(s, 10)) ?? -1).filter((b) => b >= 0),
        sgroups: list(one("SGROUPS")).map((s) => Number.parseInt(s, 10)),
      });
      continue;
    }
    // OBJ3D and TEMPLATE blocks are not read
  }
  if (!ended) mol.cutShort = true;
  // Rgroups follow their root's CTAB
  while (i < v.length) {
    const items = v30Items(v[i]);
    if ((items[0] ?? "").toUpperCase() !== "BEGIN" || (items[1] ?? "").toUpperCase() !== "RGROUP") break;
    const r = rgroupOf(mol, Number.parseInt(items[2], 10));
    i++;
    while (i < v.length) {
      const it = v30Items(v[i]);
      const h = (it[0] ?? "").toUpperCase();
      if (h === "END" && (it[1] ?? "").toUpperCase() === "RGROUP") {
        i++;
        break;
      }
      if (h === "RLOGIC") {
        r.logic = { then: Number.parseInt(it[1], 10) || 0, restH: it[2] === "1", occurrence: it[3] ?? ">0" };
        i++;
        continue;
      }
      if (h === "BEGIN" && (it[1] ?? "").toUpperCase() === "CTAB") {
        const { mol: member, next } = ctabV3000(v, i, "");
        r.members.push(member);
        i = next;
        continue;
      }
      i++;
    }
  }
  return { mol, next: i };
}

// --- molfiles, SDfiles and Rxnfiles --------------------------------------

/**
 * A molfile from line `from`: its header (name, program, comment), its
 * counts line, and its connection table in V2000 or V3000; and the line
 * after it.
 */
function molfileAt(ls: string[], from: number): { mol: CtMolecule; next: number } | null {
  const c = findCounts(ls, from);
  if (c < 0) return null;
  const name = c - 3 >= from ? (ls[c - 3] ?? "").trim() : "";
  const counts = countsV2000(ls[c]);
  if (counts.version === "V3000") {
    const { out, next } = v30Lines(ls, c + 1);
    const at = out.findIndex((t) => /^BEGIN\s+CTAB/i.test(t.trim()));
    if (at < 0) return { mol: emptyMolecule("V3000", name), next };
    const { mol } = ctabV3000(out, at, name);
    if (!mol.name) mol.name = name;
    return { mol, next };
  }
  const { mol, next } = ctabV2000(ls, c, name);
  return { mol, next: rgroupsV2000(ls, next, mol) };
}

/** A molfile, V2000 or V3000. */
export function readMolfile(text: string): CtMolecule | null {
  return molfileAt(lines(text), 0)?.mol ?? null;
}

/** An SDfile's molecules, its records split at $$$$ (their data items are not kept). */
export function readSDfile(text: string): CtMolecule[] {
  const out: CtMolecule[] = [];
  let record: string[] = [];
  const flush = () => {
    if (record.some((l) => l.trim())) {
      const m = molfileAt(record, 0);
      if (m) out.push(m.mol);
    }
    record = [];
  };
  for (const l of lines(text)) {
    if (/^\${4}/.test(l)) flush();
    else record.push(l);
  }
  flush();
  return out;
}

/**
 * An Rxnfile, V2000 or V3000: its reactants, products and reagents, in the
 * order the file gives them.
 */
export function readRxnfile(text: string): CtReaction {
  const ls = lines(text);
  const start = ls.findIndex((l) => /^\$RXN/.test(l));
  const head = start < 0 ? 0 : start;
  const reaction: CtReaction = { name: (ls[head + 1] ?? "").trim(), reactants: [], products: [], reagents: [] };
  if (/V3000/i.test(ls[head] ?? "")) {
    // "M  V30 COUNTS r p [a]", then BEGIN REACTANT / PRODUCT / REAGENT blocks of CTABs
    const { out } = v30Lines(ls, head + 1);
    let role: CtMolecule[] | null = null;
    for (let i = 0; i < out.length; i++) {
      const items = v30Items(out[i]);
      const h = (items[0] ?? "").toUpperCase();
      const what = (items[1] ?? "").toUpperCase();
      if (h === "BEGIN" && what === "REACTANT") role = reaction.reactants;
      else if (h === "BEGIN" && what === "PRODUCT") role = reaction.products;
      else if (h === "BEGIN" && (what === "REAGENT" || what === "AGENT")) role = reaction.reagents;
      else if (h === "END" && (what === "REACTANT" || what === "PRODUCT" || what === "REAGENT" || what === "AGENT")) role = null;
      else if (h === "BEGIN" && what === "CTAB" && role) {
        const { mol, next } = ctabV3000(out, i, "");
        role.push(mol);
        i = next - 1;
      }
    }
    return reaction;
  }
  // V2000: the counts line "rrrpppggg" on the header's fifth line, then
  // $MOL blocks for the reactants, the products, then the reagents
  const counts = ls[head + 4] ?? "";
  let r = Number.parseInt(counts.slice(0, 3), 10);
  let p = Number.parseInt(counts.slice(3, 6), 10);
  let g = Number.parseInt(counts.slice(6, 9), 10);
  if (!Number.isFinite(r) || !Number.isFinite(p)) {
    const t = counts.trim().split(/\s+/).map((s) => Number.parseInt(s, 10));
    [r, p, g] = [t[0] || 0, t[1] || 0, t[2] || 0];
  }
  if (!Number.isFinite(g)) g = 0;
  const mols: CtMolecule[] = [];
  for (let i = head + 5; i < ls.length; i++) {
    if (!/^\$MOL/.test(ls[i])) continue;
    const m = molfileAt(ls, i + 1);
    if (!m) continue;
    mols.push(m.mol);
    i = m.next - 1;
  }
  reaction.reactants = mols.slice(0, r);
  reaction.products = mols.slice(r, r + p);
  reaction.reagents = mols.slice(r + p, r + p + g);
  // (more blocks than counted: products, as a reader can best take them)
  if (mols.length > r + p + g) reaction.products.push(...mols.slice(r + p + g));
  return reaction;
}
