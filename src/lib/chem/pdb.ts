/**
 * PDB files read and written as the wwPDB's "Atomic Coordinate Entry Format
 * Version 3.3" describes them (wwpdb.org, format33/): every line a record,
 * its name in columns 1 to 6, its fields in fixed columns.
 *
 * Reading keeps all that the records it reads say - an atom's name,
 * residue, chain and the rest, not only its element and where it is - so
 * that more can be made of a file later than Meno makes of it now. Each
 * record it reads has a handler of its own (`RECORDS`); a record it does
 * not read yet is counted, by name, and a handler is all it takes to read
 * it. What the rest of Meno makes of an entry - molecules in 3D - is its
 * own business (lib/io/structures).
 *
 * Writing writes the coordinate records of molecules in 3D - HETATM, MODEL
 * and ENDMDL, CONECT, END - and nothing an archive entry has besides
 * (HEADER, CRYST1, MASTER...): a file of coordinates, not an entry of the
 * archive.
 *
 * Columns are numbered from 1 here, as the format numbers them.
 */
import { elements } from "../../utils/atomUtils";

/** An atom, as an ATOM or HETATM record gives it (Coordinate Section). */
export type PdbAtom = {
  /** ATOM for a standard residue's atom, HETATM for any other. */
  record: "ATOM" | "HETATM";
  /** Its serial number (7-11), by which CONECT records name it. */
  serial: number;
  /** Its name (13-16), as written, blanks trimmed. */
  name: string;
  /** Its alternate location indicator (17); blank for an atom in one place. */
  altLoc: string;
  /** Its residue's name (18-20), its chain (22), its residue's sequence number (23-26) and insertion code (27). */
  resName: string;
  chainID: string;
  resSeq: number;
  iCode: string;
  /** Where it is, in ångströms (31-54). */
  x: number;
  y: number;
  z: number;
  /** Its occupancy (55-60) and temperature factor (61-66), where given. */
  occupancy?: number;
  tempFactor?: number;
  /** Its element's symbol (77-78) - or, where those columns are blank, as its name's alignment says it (see `elementOf`). */
  element: string;
  /** Its charge (79-80): 2+, 1-... */
  charge?: number;
};

/** A model: the coordinates between a MODEL record and its ENDMDL - or, in an entry of one, all of them. */
export type PdbModel = {
  /** Its serial number (MODEL, 11-14); 1 where there is no MODEL record. */
  serial: number;
  atoms: PdbAtom[];
  /** Where its chains end, by TER records: how many of its atoms come before each. */
  chainEnds: number[];
};

/** A residue, as a secondary structure record names one: its name, its chain, its sequence number and insertion code. */
export type PdbResidue = { resName: string; chainID: string; seqNum: number; iCode: string };
// (HELIX and SHEET as the format's Secondary Structure Section lays them out:
// what lib/chem/biopolymer makes a molecule's chains' ribbons from)

/**
 * A helix, as a HELIX record gives it (Secondary Structure Section): its
 * serial number and identifier, its first (N-terminal) and last residue,
 * its class - 1 right-handed alpha (the default), 5 right-handed 3-10, 3
 * right-handed pi, and the others the format lists - its comment, and its
 * length in residues.
 */
export type PdbHelix = {
  serNum: number;
  helixID: string;
  init: PdbResidue;
  end: PdbResidue;
  helixClass: number;
  comment?: string;
  length?: number;
};

/**
 * A strand of a sheet, as a SHEET record gives it (Secondary Structure
 * Section): its number in its sheet, the sheet's identifier and its number
 * of strands, its first (N-terminal) and last residue, and its sense to the
 * strand before it - 0 the first, 1 parallel, -1 antiparallel - with the
 * hydrogen bond registering it to that strand, where given.
 */
export type PdbStrand = {
  strand: number;
  sheetID: string;
  numStrands: number;
  init: PdbResidue;
  end: PdbResidue;
  sense: number;
  registration?: { cur: PdbResidue & { atom: string }; prev: PdbResidue & { atom: string } };
};

/** What a PDB file says, as far as Meno reads it. */
export type PdbEntry = {
  /** HEADER: the entry's ID code (63-66) and classification (11-50), where given. */
  idCode?: string;
  classification?: string;
  /** TITLE, its continued lines put together. */
  title?: string;
  models: PdbModel[];
  /** CONECT: the bonds it gives, each once, between atoms by serial number, the lower first. */
  conect: [number, number][];
  /** HELIX and SHEET: its helices, and its sheets' strands, as listed. */
  helices: PdbHelix[];
  strands: PdbStrand[];
  /** The records not read, by name, and how many lines of each. */
  unread: Record<string, number>;
  /** Lines that are no record the format names, or an atom's whose coordinates do not read. */
  unreadable: number;
};

/**
 * Every record name the format has (Introduction, *Order of Records*), each
 * as columns 1 to 6 hold it, blanks trimmed: what a line of a PDB file
 * begins with.
 */
export const RECORD_NAMES: ReadonlySet<string> = new Set([
  "HEADER", "OBSLTE", "TITLE", "SPLIT", "CAVEAT", "COMPND", "SOURCE", "KEYWDS", "EXPDTA", "NUMMDL", "MDLTYP",
  "AUTHOR", "REVDAT", "SPRSDE", "JRNL", "REMARK", "DBREF", "DBREF1", "DBREF2", "SEQADV", "SEQRES", "MODRES",
  "HET", "HETNAM", "HETSYN", "FORMUL", "HELIX", "SHEET", "SSBOND", "LINK", "CISPEP", "SITE", "CRYST1",
  "ORIGX1", "ORIGX2", "ORIGX3", "SCALE1", "SCALE2", "SCALE3", "MTRIX1", "MTRIX2", "MTRIX3",
  "MODEL", "ATOM", "ANISOU", "TER", "HETATM", "ENDMDL", "CONECT", "MASTER", "END",
]);

/** Columns `from` to `to` of a line, as the format numbers them; blanks where the line is shorter. */
const cols = (line: string, from: number, to: number) => line.substring(from - 1, to);
/** A field's text, its blanks trimmed. */
const text = (line: string, from: number, to: number) => cols(line, from, to).trim();
/** An Integer field: right-justified, blank-filled; undefined where blank or not a number. */
function integer(line: string, from: number, to: number): number | undefined {
  const t = text(line, from, to);
  return /^[-+]?\d+$/.test(t) ? Number.parseInt(t, 10) : undefined;
}
/** A Real(n.m) field; undefined where blank or not a number. */
function real(line: string, from: number, to: number): number | undefined {
  const t = text(line, from, to);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return undefined;
  return Number.parseFloat(t);
}
/** The record name a line begins with: columns 1 to 6, blanks trimmed. */
export const recordName = (line: string) => cols(line, 1, 6).trimEnd();

const SYMBOLS: ReadonlySet<string> = new Set(elements.map((e) => e.symbol));
/** An element's symbol as Meno writes it - "Fe", not "FE" - or undefined where it is none. */
function symbol(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const sym = t[0].toUpperCase() + t.slice(1).toLowerCase();
  return SYMBOLS.has(sym) ? sym : undefined;
}

/**
 * An atom's element: its element symbol (77-78) - "always present", the
 * format says - or, where those columns are blank, as its name is aligned
 * (ATOM, *Details*): a one-letter element's name starts at column 14, a
 * two-letter one's at column 13. Undefined where neither says one.
 */
export function elementOf(line: string): string | undefined {
  const given = text(line, 77, 78);
  if (given) return symbol(given);
  const c13 = cols(line, 13, 13);
  return /[A-Za-z]/.test(c13) ? symbol(cols(line, 13, 14)) : symbol(cols(line, 14, 14));
}

/** A charge as the format writes it (79-80): a digit and a sign, "2+", "1-"; undefined where blank. */
function chargeOf(line: string): number | undefined {
  const m = /^(\d)([+-])$/.exec(text(line, 79, 80));
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return n === 0 ? undefined : m[2] === "-" ? -n : n;
}

/** An entry as it is read, line by line. */
type Reading = PdbEntry & { model: PdbModel | null; titleParts: string[]; bonds: Set<string> };

/** What a record's handler does with a line: "end" where the entry ends. */
type Handler = (line: string, r: Reading) => void | "end";

/** The model atoms go into: the one a MODEL record began, or - an entry of one model - the one there is. */
function modelOf(r: Reading): PdbModel {
  if (r.model) return r.model;
  const m: PdbModel = { serial: r.models.length + 1, atoms: [], chainEnds: [] };
  r.models.push(m);
  r.model = m;
  return m;
}

/** An ATOM or HETATM record (Coordinate Section): the two are laid out alike. */
const atomRecord =
  (record: PdbAtom["record"]): Handler =>
  (line, r) => {
    const x = real(line, 31, 38);
    const y = real(line, 39, 46);
    const z = real(line, 47, 54);
    const element = elementOf(line);
    if (x === undefined || y === undefined || z === undefined || !element) {
      r.unreadable++;
      return;
    }
    const occupancy = real(line, 55, 60);
    const tempFactor = real(line, 61, 66);
    const charge = chargeOf(line);
    modelOf(r).atoms.push({
      record,
      serial: integer(line, 7, 11) ?? Number.NaN,
      name: text(line, 13, 16),
      altLoc: text(line, 17, 17),
      resName: text(line, 18, 20),
      chainID: text(line, 22, 22),
      resSeq: integer(line, 23, 26) ?? 0,
      iCode: text(line, 27, 27),
      x,
      y,
      z,
      ...(occupancy !== undefined ? { occupancy } : {}),
      ...(tempFactor !== undefined ? { tempFactor } : {}),
      element,
      ...(charge !== undefined ? { charge } : {}),
    });
  };

/** Each record Meno reads, and what it makes of it. */
const RECORDS: Record<string, Handler> = {
  HEADER: (line, r) => {
    const classification = text(line, 11, 50);
    const idCode = text(line, 63, 66);
    if (classification) r.classification = classification;
    if (idCode) r.idCode = idCode;
  },
  // (a String continued over lines: its parts put together, runs of blanks one - Introduction, *Field Formats*)
  TITLE: (line, r) => void r.titleParts.push(cols(line, 11, 80)),
  MODEL: (line, r) => {
    // (atoms before the first MODEL record, should there be any, are a model of their own)
    const m: PdbModel = { serial: integer(line, 11, 14) ?? r.models.length + 1, atoms: [], chainEnds: [] };
    r.models.push(m);
    r.model = m;
  },
  ENDMDL: (_line, r) => {
    r.model = null;
  },
  ATOM: atomRecord("ATOM"),
  HETATM: atomRecord("HETATM"),
  TER: (_line, r) => {
    const m = modelOf(r);
    m.chainEnds.push(m.atoms.length);
  },
  CONECT: (line, r) => {
    const from = integer(line, 7, 11);
    if (from === undefined) return void r.unreadable++;
    for (const [a, b] of [[12, 16], [17, 21], [22, 26], [27, 31]]) {
      const to = integer(line, a, b);
      if (to === undefined || to === from) continue;
      r.bonds.add(from < to ? `${from} ${to}` : `${to} ${from}`);
    }
  },
  END: () => "end",
  // the Secondary Structure Section: a helix's or a strand's first and last residues
  HELIX: (line, r) => {
    const init = residueAt(line, 16, 20, 22, 26);
    const end = residueAt(line, 28, 32, 34, 38);
    if (!init || !end) return void r.unreadable++;
    const comment = text(line, 41, 70);
    const length = integer(line, 72, 76);
    r.helices.push({
      serNum: integer(line, 8, 10) ?? r.helices.length + 1,
      helixID: text(line, 12, 14),
      init,
      end,
      // (blank: the default class, right-handed alpha)
      helixClass: integer(line, 39, 40) ?? 1,
      ...(comment ? { comment } : {}),
      ...(length !== undefined ? { length } : {}),
    });
  },
  SHEET: (line, r) => {
    const init = residueAt(line, 18, 22, 23, 27);
    const end = residueAt(line, 29, 33, 34, 38);
    if (!init || !end) return void r.unreadable++;
    const cur = residueAt(line, 46, 50, 51, 55);
    const prev = residueAt(line, 61, 65, 66, 70);
    const curAtom = text(line, 42, 45);
    const prevAtom = text(line, 57, 60);
    r.strands.push({
      strand: integer(line, 8, 10) ?? 1,
      sheetID: text(line, 12, 14),
      numStrands: integer(line, 15, 16) ?? 0,
      init,
      end,
      sense: integer(line, 39, 40) ?? 0,
      ...(cur && prev && curAtom && prevAtom ? { registration: { cur: { ...cur, atom: curAtom }, prev: { ...prev, atom: prevAtom } } } : {}),
    });
  },
};

/**
 * A residue named in a record: its name in columns `name` to `name + 2`,
 * its chain at `chain`, its sequence number from `seq` to `seq + 3` and its
 * insertion code at `code`; undefined where its sequence number does not read.
 */
function residueAt(line: string, name: number, chain: number, seq: number, code: number): PdbResidue | undefined {
  const seqNum = integer(line, seq, seq + 3);
  if (seqNum === undefined) return undefined;
  return { resName: text(line, name, name + 2), chainID: text(line, chain, chain), seqNum, iCode: text(line, code, code) };
}

/** A PDB file's records, as far as Meno reads them; the rest counted. */
export function readPdb(content: string): PdbEntry {
  const r: Reading = { models: [], conect: [], helices: [], strands: [], unread: {}, unreadable: 0, model: null, titleParts: [], bonds: new Set() };
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const name = recordName(line);
    const handle = RECORDS[name];
    if (handle) {
      if (handle(line, r) === "end") break;
    } else if (RECORD_NAMES.has(name)) r.unread[name] = (r.unread[name] ?? 0) + 1;
    else r.unreadable++;
  }
  const title = r.titleParts.join(" ").replace(/\s+/g, " ").trim();
  return {
    ...(r.idCode ? { idCode: r.idCode } : {}),
    ...(r.classification ? { classification: r.classification } : {}),
    ...(title ? { title } : {}),
    // (a MODEL record with no atoms after it is no model)
    models: r.models.filter((m) => m.atoms.length),
    conect: [...r.bonds].map((k) => k.split(" ").map(Number) as [number, number]).sort((p, q) => p[0] - q[0] || p[1] - q[1]),
    helices: r.helices,
    strands: r.strands,
    unread: r.unread,
    unreadable: r.unreadable,
  };
}

/** An atom to be written: its element, where it is in ångströms, and its charge. */
export type PdbWriteAtom = { el: string; x: number; y: number; z: number; charge?: number };
/** A molecule to be written: its atoms, and its bonds between them by index. */
export type PdbWriteMolecule = { atoms: readonly PdbWriteAtom[]; bonds: readonly { a1: number; a2: number }[] };

/** Most atoms a model holds (MODEL, *Details*), and so the serial numbers 7-11 hold. */
export const MOST_ATOMS = 99_999;
/** Most residues a chain's sequence numbers hold (23-26). */
const MOST_RESIDUES = 9_999;

/** `s` right-justified in `n` columns. */
const right = (s: string, n: number) => s.padStart(n);
/** A Real(n.m) field, right-justified; throws where it does not fit. */
function realField(v: number, n: number, m: number): string {
  const s = v.toFixed(m);
  if (s.length > n || !Number.isFinite(v)) throw new Error(`${v} does not fit a PDB file's ${n}-column field.`);
  return right(s, n);
}

/**
 * An atom's name as the format aligns it (ATOM, *Details*): a one-letter
 * element's from column 14, a two-letter one's from column 13; its
 * element's symbol and its number among that element's atoms in its
 * residue - or its symbol alone, where the number does not fit.
 */
function atomName(symbol: string, n: number): string {
  const sym = symbol.toUpperCase();
  const width = sym.length === 1 ? 3 : 4;
  const named = `${sym}${n}`.length <= width ? `${sym}${n}` : sym;
  return sym.length === 1 ? ` ${named.padEnd(3)}` : named.padEnd(4);
}

/** A charge in columns 79-80: "2+", "1-"; blank for none, or for one the field cannot hold. */
const chargeField = (c?: number) => (c && Math.abs(c) <= 9 ? `${Math.abs(c)}${c > 0 ? "+" : "-"}` : "  ");

/** A line padded to the format's 80 columns. */
const line80 = (s: string) => s.padEnd(80);

/**
 * Molecules in 3D written as a PDB file's coordinates: each model the
 * molecules as they stand in it, each molecule a residue of its own -
 * HETATM records, "UNL" (the Chemical Component Dictionary's unknown
 * ligand), chain A, numbered from 1 - its atoms numbered from 1 in every
 * model; MODEL and ENDMDL records only where there is more than one model;
 * every bond in CONECT records, each given from both its atoms, in
 * increasing order, four to a record; END. Throws where a model holds more
 * atoms, or more molecules, than the format's fields can number.
 */
export function writePdb(models: readonly (readonly PdbWriteMolecule[])[]): string {
  const out: string[] = [];
  const several = models.length > 1;
  const bonded = new Map<number, Set<number>>();
  models.forEach((molecules, k) => {
    const total = molecules.reduce((n, m) => n + m.atoms.length, 0);
    if (total > MOST_ATOMS) throw new Error(`A PDB file's model holds at most ${MOST_ATOMS.toLocaleString("en")} atoms; this one would hold ${total.toLocaleString("en")}.`);
    if (molecules.length > MOST_RESIDUES) throw new Error(`A PDB file numbers at most ${MOST_RESIDUES.toLocaleString("en")} residues in a chain.`);
    if (several) out.push(line80(`MODEL     ${right(String(k + 1), 4)}`));
    let serial = 0;
    molecules.forEach((m, r) => {
      const first = serial + 1;
      const seen = new Map<string, number>();
      for (const a of m.atoms) {
        serial++;
        const sym = symbolFor(a.el);
        const n = (seen.get(sym) ?? 0) + 1;
        seen.set(sym, n);
        out.push(
          line80(
            "HETATM" +
              right(String(serial), 5) +
              " " +
              atomName(sym, n) +
              " " + // altLoc
              right("UNL", 3) +
              " " +
              "A" +
              right(String(r + 1), 4) +
              " " + // iCode
              "   " +
              realField(a.x, 8, 3) +
              realField(a.y, 8, 3) +
              realField(a.z, 8, 3) +
              realField(1, 6, 2) +
              realField(0, 6, 2) +
              " ".repeat(10) +
              right(sym.toUpperCase(), 2) +
              chargeField(a.charge),
          ),
        );
      }
      // (the bonds, once: every model has the same atoms, numbered alike)
      if (k === 0) {
        for (const b of m.bonds) {
          const p = first + b.a1;
          const q = first + b.a2;
          if (p === q) continue;
          if (!bonded.has(p)) bonded.set(p, new Set());
          if (!bonded.has(q)) bonded.set(q, new Set());
          bonded.get(p)!.add(q);
          bonded.get(q)!.add(p);
        }
      }
    });
    if (several) out.push(line80("ENDMDL"));
  });
  for (const from of [...bonded.keys()].sort((a, b) => a - b)) {
    const to = [...bonded.get(from)!].sort((a, b) => a - b);
    for (let i = 0; i < to.length; i += 4) {
      out.push(line80("CONECT" + right(String(from), 5) + to.slice(i, i + 4).map((s) => right(String(s), 5)).join("")));
    }
  }
  out.push(line80("END"));
  return out.join("\n") + "\n";
}

/** An atom's element for its element columns (77-78): a label that is no element - an abbreviation, say - is refused. */
function symbolFor(el: string): string {
  const sym = symbol(el);
  if (!sym) throw new Error(`"${el}" is no element: a PDB file holds atoms of elements only.`);
  return sym;
}
