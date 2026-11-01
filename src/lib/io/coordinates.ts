/**
 * Coordinates as a paper's supporting information prints them (docs/FILE-IO.md,
 * *Coordinates in a text*): each structure's atoms, an element and where it
 * stands, set among what a printed page sets about them - a name over each,
 * its charge and multiplicity, its energies, the page's numbers and running
 * heads - and broken wherever the page or the viewer copying it broke the
 * lines. Read from the words in turn, not the lines, so that a line broken
 * anywhere is read as if it were whole.
 *
 * An atom is an element - its symbol, or its atomic number - and three
 * numbers written with a decimal point (or an exponent): `C 1.2 3.4 5.6`;
 * its element written as a label of up to four letters and digits (`C1`,
 * `H1A`); a whole number between, read as nothing (`C 0 x y z`); its items
 * set apart by spaces, tabs or commas; or `1 C x y z`, numbered. A table of
 * atoms a program prints in a form of its own is read as its plugin declares
 * it (`QuotedTables`), only where that plugin is added.
 *
 * A structure's atoms run on until something other than an atom comes -
 * words, a name - and that begins the next; a page's number, set among
 * them, does not. Its name is the first line before it that is no note:
 * an energy, a frequency, a method are notes, kept with it. A charge and a
 * multiplicity ("0 1") set before its atoms are its; so is a count of its
 * atoms, said ("52 atoms") or set alone as an XYZ file sets it. Lengths are
 * in ångströms, or in bohr where the text says so (and turned into
 * ångströms).
 */
import { ELEMENTS } from "../chem/elements";
import type { QuotedColumn, QuotedTableDecl } from "../plugins/manifest";
import { bondsByDistance } from "../../utils/structureParsers";
import { BOHR_ANGSTROM } from "../units";

/** One bohr, in ångströms (Meno's units table, CODATA 2018). */
export const BOHR = BOHR_ANGSTROM;

export type CoordinateAtom = { el: string; x: number; y: number; z: number };

/** A structure read from a text: its name, what was said of it, its atoms (in ångströms) and what looks wrong about them. */
export type CoordinateStructure = {
  name: string;
  notes: string[];
  charge?: number;
  multiplicity?: number;
  /** How many atoms the text says it has. */
  stated?: number;
  /** Whether the text gave its lengths in bohr. */
  bohr: boolean;
  atoms: CoordinateAtom[];
  /** What looks wrong, said as the user is shown it. */
  warnings: string[];
  /** Its atoms came mixed with another's - two columns read across - and could not be told apart: not to be placed. */
  mixed?: true;
  /** Lines among its atoms that look like an atom's, or say a charge or multiplicity, but do not read as one: not to be placed - nothing is guessed. */
  broken?: string[];
  /** The other lines among its atoms, left out: a page's number, a running head, a table's heads set again, a caption. */
  skipped?: string[];
  /** The page's numbers it runs on over: one structure across a page's end. */
  continues?: string[];
  /** A table of atoms a program prints in a form only a plugin not added reads, said so (`QuotedTables`): none of it read, not to be placed. */
  unread?: true;
};

/** A table of atoms a program prints, as its plugin declares it (lib/plugins/manifest `quotedTables`), with the plugin's name. */
export type QuotedTable = QuotedTableDecl & { plugin: string };
/** The tables of the plugins added - read - and of those only offered - told, and said to be theirs, never read. */
export type QuotedTables = { added: readonly QuotedTable[]; offered: readonly QuotedTable[] };
export const NO_QUOTED: QuotedTables = { added: [], offered: [] };

const SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e.symbol]));
const BY_NUMBER = new Map(ELEMENTS.map((e) => [e.number, e.symbol]));

/** A number with a decimal point or an exponent - a coordinate (D for an exponent, as Fortran writes one). */
const DECIMAL = /^[+-]?(?:\d+\.\d*|\.\d+|\d+(?=[eEdD]))(?:[eEdD][+-]?\d+)?$/;
const INTEGER = /^[+-]?\d+$/;

/**
 * An element's symbol from a label: the symbol, as it is written (C, Cl - a
 * TS1 names a structure), with a number and up to two letters or digits more
 * after it (C1, C12, H1A): a label of four at most, as tables of atoms label
 * them - a longer one is a name.
 */
function elementOfLabel(t: string): string | null {
  const m = /^([A-Z][a-z]?)(?:\d[0-9A-Za-z']{0,2})?$/.exec(t);
  return m ? (SYMBOL.get(m[1].toLowerCase()) ?? null) : null;
}

const num = (t: string) => Number(t.replace(/[dD]/, "e"));

/** A word of the text, and the line it is on. */
type Token = { t: string; line: number };

/** An atom as written: where it begins and ends among the words, the line it begins on, its number where it is numbered. */
type Rec = CoordinateAtom & { from: number; to: number; line: number; end: number; index?: number; slot: number };

/** The atom a row of a declared table (`QuotedTable`) is, from word `i`: each column in turn, all on one line; or none. */
function tableRowAt(ts: readonly Token[], i: number, columns: readonly QuotedColumn[]): Omit<Rec, "slot"> | null {
  const line = ts[i].line;
  if (ts[i + columns.length - 1]?.line !== line) return null;
  let el: string | null = null;
  let index: number | undefined;
  const at: Record<"x" | "y" | "z", number> = { x: NaN, y: NaN, z: NaN };
  for (const [k, c] of columns.entries()) {
    const t = ts[i + k].t;
    if (c === "x" || c === "y" || c === "z") {
      if (!DECIMAL.test(t)) return null;
      at[c] = num(t);
    } else if (c === "element") el = elementOfLabel(t);
    else if (!INTEGER.test(t)) return null;
    else if (c === "atomic-number") el = BY_NUMBER.get(Number(t)) ?? null;
    else if (c === "centre") index = Number(t);
  }
  return el ? { el, ...at, from: i, to: i + columns.length, line, end: line, ...(index != null ? { index } : {}) } : null;
}

/** Whether a line is a row of a declared table, whole: its words those of the columns, in turn. */
function rowOf(line: string, columns: readonly QuotedColumn[]): boolean {
  const ts = wordsOf([line]);
  return ts.length === columns.length && tableRowAt(ts, 0, columns) != null;
}

/** The atom written from word `i`, or none: a row of a declared table first (`tables`), then as tables of atoms are written. */
function recordAt(ts: readonly Token[], i: number, tables: readonly QuotedTable[] = []): Omit<Rec, "slot"> | null {
  const t = (k: number) => ts[i + k]?.t ?? "";
  const dec = (k: number) => DECIMAL.test(t(k));
  const int = (k: number) => INTEGER.test(t(k));
  const three = (k: number) => dec(k) && dec(k + 1) && dec(k + 2);
  const at = (el: string, k: number, index?: number) => ({ el, x: num(t(k)), y: num(t(k + 1)), z: num(t(k + 2)), from: i, to: i + k + 3, line: ts[i].line, end: ts[i + k + 2].line, ...(index != null ? { index } : {}) });
  // (a number before the element, on its line: the atom's own - a "0 1" on the line before is the charge's)
  const sameLine = ts[i + 1]?.line === ts[i].line;
  for (const table of tables) {
    const row = tableRowAt(ts, i, table.columns);
    if (row) return row;
  }
  // (numbered: 1 C x y z)
  if (sameLine && int(0) && three(2)) {
    const el = elementOfLabel(t(1));
    if (el) return at(el, 2, Number(t(0)));
  }
  const el = elementOfLabel(t(0)) ?? (sameLine && /^\d+$/.test(t(0)) ? (BY_NUMBER.get(Number(t(0))) ?? null) : null);
  if (!el) return null;
  // (a freeze code between: C 0 x y z)
  if (sameLine && int(1) && three(2)) return at(el, 2);
  if (three(1)) return at(el, 1);
  return null;
}

/** A line of a page's own, not the text's: its number, alone ("S12", "Page 3 of 40", "- 4 -", "3/40"). */
const PAGE_MARK = /^(?:S-?\d+|page\s+\d+(?:\s+of\s+\d+)?|\d+\s*\/\s*\d+|[-\u2013\u2014]\s*\d+\s*[-\u2013\u2014]|S\d+\s+of\s+S?\d+)$/i;
/** A note of a structure's: an energy, a frequency, a correction, its method. */
const NOTE =
  /energ|hartree|kcal|kj\s*\/?\s*mol|\bscf\b|\bzpe\b|zero[- ]point|enthalp|gibbs|frequenc|imaginary|\be\s*\(|\b[eGH]\s*=|\bdelta\b|thermal|correction|b3lyp|m06|wb97|pbe|def2|6-31|6-311|cc-pv|\btzvp|\bsvp\b|level of theory/i;
/** A line saying what follows, not naming it: a table's heads, "Cartesian coordinates", rules - and the headings and heads of the tables declared (`headingIn`). */
const HEADING_ONLY =
  /^(?:cartesian\s+coordinates?|coordinates?|xyz\s+coordinates?|optimi[sz]ed\s+(?:geometry|coordinates|structure)|atom\b|symbol\b|element\b|x\s+y\s+z|[-=_\s]+$|\(?(?:å|angstroms?|a\.?u\.?|bohr)\)?:?$)/i;
/** A line as its start is compared with a declared heading's: without regard to case, its spaces one. */
const plainStart = (l: string) => l.trim().toLowerCase().replace(/\s+/g, " ");
/** Whether a line begins as one of `starts` does (`plainStart`). */
const beginsAs = (l: string, starts: readonly string[]) => starts.some((h) => plainStart(l).startsWith(plainStart(h)));
/** Whether a line says what follows: as `HEADING_ONLY` has it, or as a declared table's heading or heads begin. */
function headingIn(quoted: QuotedTables): (l: string) => boolean {
  const starts = [...quoted.added, ...quoted.offered].flatMap((t) => [...t.headings, ...t.heads]);
  return (l) => HEADING_ONLY.test(l) || beginsAs(l, starts);
}
/** A note within a longer line: an energy ("E = -1234.5678 Hartree", "E(RB3LYP) = -1234.5 A.U."), a count of imaginary frequencies. */
const FRAGMENT = /\b(?:E|G|H|ZPE)(?:\s*\([^)]*\))?\s*=\s*[-+]?\d+\.\d+(?:\s*(?:hartrees?|a\.u\.|au|eh|kcal\s*\/?\s*mol))?|imaginary frequenc(?:y|ies)\s*:?\s*\d+/i;
const STATED = /(\d+)\s*atoms\b|\batoms?\s*[:=]\s*(\d+)|number of atoms\s*[:=]?\s*(\d+)/i;
const SAYS_BOHR = /\bbohrs?\b|\ba\.\s*u\.|\batomic units\b|units\s*=\s*(?:bohr|au)\b/i;
const SAYS_ANGSTROM = /\u00e5|\u00e5ngstr\u00f6m|angstr[o\u00f6]m|\bunits\s*=\s*ang/i;
/** What a line says the units of, besides an energy: the coordinates, the geometry, its lengths. */
const OF_LENGTHS = /coordinat|geometr|position|distance|length|\bxyz\b/i;
/**
 * Whether a line says lengths are in bohr: bohr named, or atomic units -
 * but not atomic units an energy is given in ("SCF energy (a.u.) =
 * -154.98"), which say nothing of the lengths.
 */
const saysBohr = (l: string) => SAYS_BOHR.test(l) && !(NOTE.test(l) && !OF_LENGTHS.test(l));

/** A charge said in words, and a multiplicity ("Charge = 1 Multiplicity = 1", "charge: -1, spin multiplicity: 2"), as Gaussian's output and many papers set them. */
const CHARGE_SAID = /\bcharge\s*[=:]\s*([+-]?\d+)(?![\d.])/i;
const MULTIPLICITY_SAID = /\bmultiplicity\s*[=:]\s*(\d+)(?![\d.])/i;
/** A line that says a charge or a multiplicity, by name and an "=" or ":" - read by the two above, or not read and so refused. */
const SAYS_SPECIES = /\b(?:charge|multiplicity)\s*[=:]/i;
/** Whether a line says a charge, or a multiplicity, that does not read: each said by name must read. */
const speciesUnread = (l: string) => (/\bcharge\s*[=:]/i.test(l) && !CHARGE_SAID.test(l)) || (/\bmultiplicity\s*[=:]/i.test(l) && !MULTIPLICITY_SAID.test(l));

/**
 * A line that looks like an atom's, but did not read as one (`recordAt`):
 * an element or a label first - or a number, then one - and a number with a
 * decimal point after it ("C 1.0 2.0", "C 1.0x 2.0 3.0").
 */
function looksLikeAtom(l: string): boolean {
  const ws = l.split(/[\s,;]+/).filter(Boolean);
  const first = /^\d+$/.test(ws[0] ?? "") && ws.length > 1 ? 1 : 0;
  if (elementOfLabel(ws[first] ?? "") != null && ws.slice(first + 1).some((w) => /\d\.\d/.test(w))) return true;
  // (or a symbol no element has - a ghost atom's, a dummy's: Bq, X, Xx - and three numbers, as an atom's line has them)
  return /^[A-Za-z]{1,3}\d{0,3}$/.test(ws[first] ?? "") && ws.slice(first + 1, first + 4).filter((w) => DECIMAL.test(w)).length === 3;
}

/** A value of a crystal structure's table: a number and its uncertainty in brackets, or a displacement starred. */
const CRYSTAL = /\d\.\d+\s*\(\d{1,3}\)|(?:^|\s)\d*\.\d+\*(?:\s|$)/;

/** A minus however printed - a true minus, a figure dash, a dash - before a number: made one. */
const MINUS = /[\u2212\u2012\u2013\u2014\ufe63\uff0d](?=\s*[\d.])/g;
const plainMinus = (t: string) => t.replace(MINUS, "-");

/** The text's lines as written, a minus however printed made one. */
function rawLinesOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(MINUS, "-")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.trim());
}

/** The text's lines, a minus however printed made one, page marks and running heads and feet - lines set again and again, words only - left out. */
function linesOf(text: string, tables: readonly QuotedTable[] = []): string[] {
  const lines = rawLinesOf(text);
  const count = new Map<string, number>();
  for (const l of lines) count.set(l, (count.get(l) ?? 0) + 1);
  return lines.map((l) => {
    if (PAGE_MARK.test(l)) return "";
    // (a line set twice or more that is words, no atom nor a number alone - a journal's foot, a running head - is the page's; a table's heads are said once each structure and left out anyway)
    if ((count.get(l) ?? 0) >= 2 && l.length >= 6 && /[A-Za-z]{3}/.test(l) && !NOTE.test(l) && !STATED.test(l) && !SAYS_BOHR.test(l) && !SAYS_ANGSTROM.test(l) && !wordsOf([l]).some((_, i, ts) => recordAt(ts, i, tables)))
      return "";
    return l;
  });
}

function wordsOf(lines: readonly string[]): Token[] {
  const out: Token[] = [];
  lines.forEach((l, line) => {
    for (const raw of l.split(/[\s,;]+/)) {
      if (!raw) continue;
      // (a number set close against the one before - 1.234-5.678 - two)
      for (const t of raw.split(/(?<=\d)(?=[+-]\d|[+-]\.\d)/)) out.push({ t, line });
    }
  });
  return out;
}

/** What lies between two runs of atoms, line by line: the words on each line not an atom's. */
function gapLines(ts: readonly Token[], from: number, to: number, lines: readonly string[]): string[] {
  const on = new Map<number, string[]>();
  for (let k = from; k < to; k++) on.set(ts[k].line, [...(on.get(ts[k].line) ?? []), ts[k].t]);
  // (a line all of it between them as it was written - its spaces kept, two columns' names set apart by them - else its words)
  const whole = (line: number) => (from === 0 || ts[from - 1].line !== line) && (to >= ts.length || ts[to].line !== line);
  return [...on].map(([line, words]) => (whole(line) ? lines[line] : words.join(" ")));
}

/** A run of atoms with what was written before it. */
type Run = { recs: Rec[]; before: string[]; after: string[] };

/** A line of numbers alone: a charge and a multiplicity, or a count. */
const NUMBERS_ONLY = /^[+-]?\d+(?:[\s,]+[+-]?\d+)?$/;
/** Whether a line may name a structure: no note, no table's head (`heading`), no numbers alone, no count. */
const namingBy = (heading: (l: string) => boolean) => (l: string) => !NOTE.test(l) && !heading(l) && !NUMBERS_ONLY.test(l) && !SAYS_SPECIES.test(l) && /[A-Za-z0-9]/.test(nameOf(l)) && l.length <= 80;
/** A line as a name: its count of atoms, where it says one ("TS1 (52 atoms)"), and the units its lengths are in ("coordinates in bohr"), left out. */
const nameOf = (l: string) =>
  l
    .replace(STATED, "")
    .replace(/[,;:]?\s*\(?\s*(?:(?:cartesian\s+)?coordinates\s+)?in\s+(?:bohrs?|a\.\s*u\.|atomic units|\u00e5|\u00e5ngstr\u00f6ms?|angstroms?)\s*\)?/i, "")
    .replace(/[\s,;:]*\(\s*\)|[\s,;:]+$/g, "")
    .trim();

/**
 * The structures written in a text, in the order they come: each with its
 * name, its notes, its charge and multiplicity and the count of its atoms
 * where the text gives them, and what looks wrong. A table of atoms a
 * program prints in a form of its own is read as the plugin added declares
 * it (`quoted.added`); one only a plugin not added declares is none of it
 * read, and said to be that plugin's (`quoted.offered`).
 */
export function readCoordinates(text: string, quoted: QuotedTables = NO_QUOTED): CoordinateStructure[] {
  const raw = rawLinesOf(text);
  const heading = headingIn(quoted);
  const naming = namingBy(heading);
  // (the rows of a table only a plugin not added declares - one no plugin added reads the same: never read, as atoms or
  // anything else; each run of them said to be that plugin's, below)
  const unreadTables = quoted.offered.filter((o) => !quoted.added.some((a) => a.columns.join() === o.columns.join()));
  const claimed = new Map<number, QuotedTable>();
  const all = linesOf(text, quoted.added);
  all.forEach((l, k) => {
    const t = l && unreadTables.find((u) => rowOf(l, u.columns));
    if (t) claimed.set(k, t);
  });
  const lines = all.map((l, k) => (claimed.has(k) ? "" : l));
  const ts = wordsOf(lines);
  const bohrAll = lines.some(saysBohr) && !SAYS_ANGSTROM.test(text);
  // every atom written, in turn - but a crystal's, its place a fraction of its cell's edges: on a line with a value's
  // uncertainty in brackets ("0.41270 (14)") or a displacement marked as a hydrogen's ("0.037*"), as a crystal structure's
  // tables print them
  const recs: Rec[] = [];
  for (let i = 0; i < ts.length; ) {
    const r = recordAt(ts, i, quoted.added);
    if (r && (CRYSTAL.test(lines[r.line] ?? "") || CRYSTAL.test(lines[r.end] ?? ""))) i = r.to;
    else if (r) {
      const slot = recs.filter((q) => q.line === r.line).length;
      recs.push({ ...r, slot });
      i = r.to;
    } else i++;
  }
  // (a number before an atom's element, the atoms after it not numbered on - "0 1 C x y z" on one line, a text whose lines'
  // ends were made spaces - is no atom's: the multiplicity's)
  for (let k = 0; k < recs.length; k++) {
    const r = recs[k];
    const numbered = (q: Rec | undefined) => q?.index != null && (q.to === r.from || q.from === r.to);
    if (r.index != null && !numbered(recs[k - 1]) && !numbered(recs[k + 1]) && elementOfLabel(ts[r.from + 1]?.t ?? "")) {
      const { index: _index, ...rest } = r;
      recs[k] = { ...rest, from: r.from + 1 };
    }
  }
  // runs: atoms one after another, nothing between - or a page's number alone, unless it counts the atoms after it
  const runs: Run[] = [];
  let last = 0;
  for (let k = 0; k < recs.length; k++) {
    const r = recs[k];
    const gap = ts.slice(last, r.from).map((x) => x.t);
    const prev = runs[runs.length - 1];
    const count = gap.length === 1 && /^\d+$/.test(gap[0]) ? Number(gap[0]) : null;
    const counts = count != null && count > 0 && k + count <= recs.length && (k + count === recs.length || recs[k + count - 1].to !== recs[k + count].from);
    // (numbered atoms: the count begun again - a new structure)
    const renumbered = r.index === 1 && prev != null && prev.recs[prev.recs.length - 1].index != null;
    if (prev && !renumbered && (gap.length === 0 || (count != null && !counts))) prev.recs.push(r);
    else runs.push({ recs: [r], before: gapLines(ts, last, r.from, lines), after: [] });
    last = r.to;
  }
  if (runs.length) runs[runs.length - 1].after = gapLines(ts, last, ts.length, lines);
  // (a structure broken by a page's foot or head said once, no charge nor count after it: one, where its two parts together
  // bond and no atom of one stands in another's place - two structures each about the origin stand in each other's)
  for (let k = 1; k < runs.length; k++) {
    const [a, b] = [runs[k - 1], runs[k]];
    // (a note between them alone - an energy set among its atoms - parts them no more than a page's foot does: one, where they
    // bond as one; a note with a name, a count or a charge between them begins the next)
    const notesOnly = b.before.length > 0 && b.before.every((l) => NOTE.test(l) || FRAGMENT.test(l));
    if (!notesOnly && b.before.some((l) => NUMBERS_ONLY.test(l) || STATED.test(l) || NOTE.test(l))) continue;
    const pa = atomsOfRecs(a.recs, 1);
    const pb = atomsOfRecs(b.recs, 1);
    if (pieces([...pa, ...pb]) < pieces(pa) + pieces(pb) && !crowds(pa, pb)) {
      a.recs.push(...b.recs);
      a.after = b.after;
      runs.splice(k--, 1);
    }
  }
  // (a run of one atom is a structure only where what comes before it says it is one - its energy, its charge and
  // multiplicity, its count, a table's heads - not one met among some other table's numbers or a text's words, a crystal's
  // atom with its uncertainties, a peak list's page number; nor one written by its atomic number alone)
  const geometry = (r: Run) => r.before.some((l) => NOTE.test(l) || heading(l) || STATED.test(l) || /^[+-]?\d+[\s,]+\d+$/.test(l));
  // (nor a run of atoms written by atomic numbers that count up one by one - 1, 2, 3 - a table's positions with values beside
  // them, an NMR table's shifts: no molecule's elements run so)
  const counting = (r: Run) => {
    const ns = r.recs.map((q) => (q.index == null ? ts[q.from].t : ""));
    return ns.length >= 3 && ns.every((t, k) => /^\d+$/.test(t) && (k === 0 || Number(t) === Number(ns[k - 1]) + 1));
  };
  const kept = runs.filter((r) => !counting(r) && (r.recs.length > 1 || (elementOfLabel(ts[r.recs[0].from].t) != null && geometry(r))));
  const out: CoordinateStructure[] = [];
  const allAtomLines = new Set(recs.flatMap((r) => Array.from({ length: r.end - r.line + 1 }, (_, k) => r.line + k)));
  kept.forEach((run, n) => {
    // (the words between two structures: the notes said after the first, then - from the first line that may name one - the next's)
    let first = run.before.findIndex(naming);
    // (a count set alone just before its name, as an XYZ file sets it, the structure's too)
    while (first > 0 && NUMBERS_ONLY.test(run.before[first - 1])) first--;
    const own = first < 0 ? run.before : run.before.slice(first);
    if (out.length && first > 0) out[out.length - 1].notes.push(...run.before.slice(0, first).filter((l) => NOTE.test(l)));
    // (the lines among its atoms that are none of them: left out and said - or, where one looks like an atom's or says a
    // charge or multiplicity and does not read, the structure refused, the line named)
    const atomLines = new Set(run.recs.flatMap((r) => Array.from({ length: r.end - r.line + 1 }, (_, k) => r.line + k)));
    const [first0, last0] = [Math.min(...atomLines), Math.max(...atomLines)];
    const among = raw.slice(first0, last0 + 1).flatMap((l, k) => (l && !atomLines.has(first0 + k) ? [l] : []));
    // (and the lines right before its first atom and right after its last - a table's first or last row that does not read -
    // where they look like an atom's: never an atom of any structure)
    const edge = (from: number, step: number) => {
      for (let i = from; i >= 0 && i < raw.length; i += step) if (raw[i]) return allAtomLines.has(i) ? null : raw[i];
      return null;
    };
    const edges = [edge(first0 - 1, -1), edge(last0 + 1, 1)].filter((l): l is string => !!l && (looksLikeAtom(l) || speciesUnread(l)));
    const broken = [...new Set([...edges.slice(0, 1), ...among.filter((l) => looksLikeAtom(l) || speciesUnread(l)), ...own.filter(speciesUnread), ...edges.slice(1)])];
    const skipped = among.filter((l) => !broken.includes(l));
    // (where it runs on over a page's end: said, by the page's number there, so the chemist sees where it was joined)
    const breaks = skipped.filter((l) => PAGE_MARK.test(l));
    out.push(...structureOf(run, own, bohrAll, n + 1, naming).map((s) => ({ ...s, ...(broken.length ? { broken } : {}), ...(skipped.length ? { skipped } : {}), ...(breaks.length ? { continues: breaks } : {}) })));
  });
  // (a lone atom left out by a structure - set apart from it by something - named on the card, never dropped unsaid)
  const near = (r: Run) => kept.some((k) => k.recs.some((q) => Math.abs(q.line - r.recs[0].line) <= 3));
  for (const r of runs) {
    if (kept.includes(r) || r.recs.length !== 1 || counting(r) || !near(r)) continue;
    const line = raw[r.recs[0].line] ?? "";
    out.push({ name: "An atom on its own", notes: [], bohr: false, atoms: atomsOfRecs(r.recs, 1), warnings: [], broken: [line] });
  }
  if (out.length) out[out.length - 1].notes.push(...kept[kept.length - 1].after.filter((l) => NOTE.test(l)));
  // (each run of a table's rows only a plugin not added reads: named by its heading, where one is just above it, and said
  // to be that plugin's - none of it read, nothing placed)
  const unread: CoordinateStructure[] = [];
  for (const [k, t] of claimed) {
    if (claimed.get(k - 1) === t) continue;
    let n = k;
    while (claimed.get(n + 1) === t) n++;
    const above = raw.slice(Math.max(0, k - 6), k).reverse().find((l) => beginsAs(l, t.headings));
    unread.push({ name: above ?? "A table of atoms", notes: [], bohr: false, atoms: [], warnings: [`A table as its program prints it: the ${t.plugin} plugin reads it, once added in Settings, Plugins.`], unread: true });
  }
  // (after those read)
  return [...out.map(checked), ...unread];
}

const atomsOfRecs = (recs: readonly Rec[], scale: number): CoordinateAtom[] => recs.map((r) => ({ el: r.el, x: r.x * scale, y: r.y * scale, z: r.z * scale }));

/** Whether an atom of `a` stands where one of `b` does: closer than any bond. */
function crowds(a: readonly CoordinateAtom[], b: readonly CoordinateAtom[]): boolean {
  return a.some((p) => b.some((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < TOO_NEAR));
}

/** The structure, or structures, a run of atoms is - two read across two columns, told apart where they can be - with what was said before it. */
function structureOf(run: Run, said: readonly string[], bohrAll: boolean, n: number, naming: (l: string) => boolean): CoordinateStructure[] {
  // (named by the line nearest its atoms that may name it - or, its lines' ends made spaces, by what comes before its first note
  // on the line before its atoms, where that may name it: "TS-1 E = -76.4 Hartree 0 1")
  const last = said[said.length - 1] ?? "";
  const before = FRAGMENT.exec(last) ? last.slice(0, last.search(FRAGMENT)).trim() : "";
  // (a number alone on its line is the count of its atoms, as an XYZ file sets it, where it is as many; else, nearer its atoms
  // than any other name, its name - a compound's number, set alone over its coordinates)
  const counts = (l: string) => /^\d+$/.test(l) && Number(l) === run.recs.length;
  const nearest = [...said].reverse().find((l) => naming(l) || (/^\d+$/.test(l) && !counts(l)));
  const named = nearest ?? (before && naming(before) ? before : undefined);
  // (a note on a line with more before it - the lines' ends made spaces, its name before it: its energies and frequencies alone)
  const notes = said.filter((l) => NOTE.test(l)).flatMap((l) => (l.search(FRAGMENT) > 0 ? [...l.matchAll(new RegExp(FRAGMENT.source, "gi"))].map((m) => m[0].trim()) : [l]));
  // (a charge and a multiplicity on a line of their own, alone: two numbers at the end of a longer line - a title's, "Conformer 12 3",
  // "TS 2 1" - are no charge and multiplicity, but the line's own words, kept with it - never taken for the species)
  // (or said in words, on one line or two: "Charge = 1 Multiplicity = 1")
  const saidCharge = [...said].reverse().map((l) => CHARGE_SAID.exec(l)).find((m) => m)?.[1];
  const saidMultiplicity = [...said].reverse().map((l) => MULTIPLICITY_SAID.exec(l)).find((m) => m)?.[1];
  const inWords = saidCharge != null && saidMultiplicity != null ? `${saidCharge} ${saidMultiplicity}` : undefined;
  const pair = inWords ?? [...said].reverse().find((l) => /^[+-]?\d+[\s,]+[+-]?\d+$/.test(l));
  const [charge, multiplicity] = pair ? pair.split(/[\s,]+/).map(Number) : [];
  const stated = said.map((l) => STATED.exec(l)).find((m) => m) ?? null;
  const alone = said.find(counts);
  const count = stated ? Number(stated[1] ?? stated[2] ?? stated[3]) : alone ? Number(alone) : undefined;
  const bohr = said.some(saysBohr) || (bohrAll && !said.some((l) => SAYS_ANGSTROM.test(l)));
  const base = {
    name: named ? nameOf(named) : `Structure ${n}`,
    notes,
    ...(pair && multiplicity >= 1 ? { charge, multiplicity } : {}),
    ...(count != null ? { stated: count } : {}),
    bohr,
  };
  const scale = bohr ? BOHR : 1;
  const atomsOf = (recs: readonly Rec[]) => atomsOfRecs(recs, scale);
  // (two atoms on most lines: two columns read across, each its own)
  const lines = new Map<number, Rec[]>();
  for (const r of run.recs) lines.set(r.line, [...(lines.get(r.line) ?? []), r]);
  // (two on a line, each whole on it - not a line broken through an atom, the next begun on it)
  const twos = [...lines.values()].filter((l) => l.length === 2 && l.every((r) => r.end === r.line)).length;
  if (twos >= 2) {
    // (an atom alone on its line - one column run on past the other's end - is the column's it bonds to, where it bonds to one
    // only as an atom can - two structures written about the origin stand in each other's way: an H bonded twice, two atoms
    // closer than any bond, are none's; to both, or neither, it cannot be told)
    const paired = (r: Rec) => lines.get(r.line)!.length === 2;
    const cols = [0, 1].map((s) => run.recs.filter((r) => paired(r) && r.slot === s));
    let told = true;
    for (const r of run.recs.filter((q) => !paired(q))) {
      const joins = cols.map((c) => pieces(atomsOf([...c, r])) === pieces(atomsOf(c)) && likely(atomsOf([...c, r])));
      if (joins[0] === joins[1]) told = false;
      else cols[joins[0] ? 0 : 1].push(r);
    }
    const parts = (named ?? "").split(/\s{2,}|\t/);
    if (told && cols.every((c) => c.length && pieces(atomsOf(c)) === 1)) {
      return cols.map((c, s) => ({ ...base, name: parts.length === 2 ? parts[s] : `${base.name} (${s + 1})`, notes: [...notes], atoms: atomsOf(c), warnings: [] }));
    }
    return [{ ...base, atoms: atomsOf(run.recs), warnings: [], mixed: true }];
  }
  // (the atoms of two structures taken in turn, a line of each: every other one makes each whole)
  const atoms = atomsOf(run.recs);
  if (atoms.length >= 6 && pieces(atoms) > 1 && turns(atoms) > atoms.length / 3) {
    const halves = [0, 1].map((h) => run.recs.filter((_, i) => i % 2 === h));
    if (halves.every((c) => pieces(atomsOf(c)) === 1)) {
      return halves.map((c, h) => ({ ...base, name: `${base.name} (${h + 1})`, notes: [...notes], atoms: atomsOf(c), warnings: [] }));
    }
    return [{ ...base, atoms, warnings: [], mixed: true }];
  }
  return [{ ...base, atoms, warnings: [] }];
}

/** Whether atoms could be one structure's: no H bonded twice, no two closer than any bond. */
function likely(atoms: readonly CoordinateAtom[]): boolean {
  const n = atoms.map(() => 0);
  for (const b of bondsByDistance(atoms)) {
    n[b.a1]++;
    n[b.a2]++;
  }
  return !atoms.some((a, i) => a.el === "H" && n[i] > 1) && !atoms.some((a, i) => atoms.some((b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < TOO_NEAR));
}

/** How many pieces atoms make, bonded by distance. */
function pieces(atoms: readonly CoordinateAtom[]): number {
  return pieceOf(atoms).count;
}

function pieceOf(atoms: readonly CoordinateAtom[]): { of: number[]; count: number } {
  const of = atoms.map((_, i) => i);
  const root = (i: number): number => (of[i] === i ? i : (of[i] = root(of[i])));
  for (const b of bondsByDistance(atoms)) of[root(b.a1)] = root(b.a2);
  const roots = new Set(atoms.map((_, i) => root(i)));
  return { of: atoms.map((_, i) => root(i)), count: roots.size };
}

/** How often, atom to atom in turn, the piece changes: a structure's pieces are written one after another, two taken in turn every time. */
function turns(atoms: readonly CoordinateAtom[]): number {
  const { of } = pieceOf(atoms);
  let n = 0;
  for (let i = 1; i < of.length; i++) if (of[i] !== of[i - 1]) n++;
  return n;
}

/** Nearer than this, in ångströms, two atoms cannot stand: H2's bond, the shortest, is 0.74. */
const TOO_NEAR = 0.6;
/** Further than this from every other, in ångströms, an atom stands apart. */
const APART = 4;

/** A structure with what looks wrong about it said. */
function checked(s: CoordinateStructure): CoordinateStructure {
  const warnings = [...s.warnings];
  if (s.mixed) warnings.push("Two columns came mixed together here: copy or select one column at a time.");
  for (const l of s.broken ?? []) warnings.push(`"${l}" does not read as an atom, or as a charge and multiplicity, so this structure is not placed: nothing is guessed.`);
  if (s.stated != null && s.stated !== s.atoms.length) warnings.push(`The text gives ${s.stated} atoms; ${s.atoms.length} are here.`);
  const d = (a: CoordinateAtom, b: CoordinateAtom) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  let near = false;
  let apart = false;
  if (s.atoms.length <= 3000) {
    for (let i = 0; i < s.atoms.length; i++) {
      let least = Infinity;
      for (let j = 0; j < s.atoms.length; j++) {
        if (i === j) continue;
        const e = d(s.atoms[i], s.atoms[j]);
        if (e < least) least = e;
      }
      if (least < TOO_NEAR) near = true;
      if (s.atoms.length > 2 && least > APART) apart = true;
    }
  }
  if (near) warnings.push("Two atoms stand closer than any bond.");
  if (apart) warnings.push("An atom stands far from all the others.");
  return { ...s, warnings };
}

/** A structure's formula, as Hill writes one: C, then H, then the rest by their symbols; none of them, every element by its symbol. */
export function formulaOf(atoms: readonly { el: string }[]): string {
  const n = new Map<string, number>();
  for (const a of atoms) n.set(a.el, (n.get(a.el) ?? 0) + 1);
  const els = [...n.keys()].sort();
  const order = n.has("C") ? ["C", ...(n.has("H") ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H")] : els;
  return order.map((e) => `${e}${n.get(e)! > 1 ? n.get(e) : ""}`).join("");
}

/** A word of a PDF's page and the box round it - left, top, right, bottom, in points from the page's top left. */
export type PlacedWord = { text: string; box: readonly [number, number, number, number] };
/** A page's words taken, and how large the page is. */
export type PlacedPage = { words: readonly PlacedWord[]; width: number; height: number };

/** How far down a page, or up from its foot, a running head or foot is set: a fourteenth of it. */
const MARGIN = 1 / 14;

/**
 * Words taken from a PDF's pages, where each lies, as the text they make
 * read as the page is read: line by line, a page's two columns one after
 * the other - where the words either side of a gap between them each make
 * whole atoms on their lines - and its running heads and feet left out:
 * those set again on another page, as near its top or foot, the page's
 * numbers changing.
 */
export function textOfPages(pages: readonly PlacedPage[]): string {
  const linesOfPage = pages.map((p) => lineUp(p.words));
  // (a head or foot: a line near the page's top or foot, its digits aside, set so on another page too)
  const banded = (p: PlacedPage, l: PlacedLine) => l.top < p.height * MARGIN || l.bottom > p.height * (1 - MARGIN);
  const key = (l: PlacedLine) => l.words.map((w) => w.text).join(" ").replace(/\d+/g, "#");
  const seen = new Map<string, number>();
  linesOfPage.forEach((ls, i) => new Set(ls.filter((l) => banded(pages[i], l)).map(key)).forEach((k) => seen.set(k, (seen.get(k) ?? 0) + 1)));
  const out: string[] = [];
  linesOfPage.forEach((ls, i) => {
    const kept = ls.filter((l) => !(banded(pages[i], l) && ((seen.get(key(l)) ?? 0) >= 2 || PAGE_MARK.test(textOfLine(l)))));
    const split = gutterOf(kept, pages[i].width);
    if (split == null) out.push(...kept.map(textOfLine));
    else {
      // (a line run on across the gap as a line runs - a heading over both columns - kept whole, where it comes)
      const whole = new Set(kept.filter((l) => across(l, split)));
      const side = (left: boolean) =>
        kept.map((l) => (whole.has(l) ? (left ? l : { ...l, words: [] }) : { ...l, words: l.words.filter((w) => (w.box[2] <= split) === left) })).filter((l) => l.words.length);
      out.push(...side(true).map(textOfLine), ...side(false).map(textOfLine));
    }
  });
  return out.join("\n");
}

type PlacedLine = { words: PlacedWord[]; top: number; bottom: number };

const textOfLine = (l: PlacedLine) => l.words.map((w) => w.text).join(" ");

/**
 * Words set on lines: each with those whose middle lies level with the
 * first word of a line - not with the line as it has grown, which one word
 * standing taller than its line would stretch over the next - left to
 * right; the lines top to bottom.
 */
function lineUp(words: readonly PlacedWord[]): PlacedLine[] {
  const lines: (PlacedLine & { band: readonly [number, number] })[] = [];
  for (const w of [...words].sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0])) {
    const mid = (w.box[1] + w.box[3]) / 2;
    const l = lines.find((q) => mid > q.band[0] && mid < q.band[1]);
    if (l) {
      l.words.push(w);
      l.top = Math.min(l.top, w.box[1]);
      l.bottom = Math.max(l.bottom, w.box[3]);
    } else lines.push({ words: [w], top: w.box[1], bottom: w.box[3], band: [w.box[1], w.box[3]] });
  }
  for (const l of lines) l.words.sort((a, b) => a.box[0] - b.box[0]);
  return lines.sort((a, b) => a.top - b.top).map(({ words: ws, top, bottom }) => ({ words: ws, top, bottom }));
}

/** Whether a line's words are one atom, whole. */
function wholeAtom(words: readonly PlacedWord[]): boolean {
  const ts = wordsOf([plainMinus(words.map((w) => w.text).join(" "))]);
  const r = ts.length ? recordAt(ts, 0) : null;
  return !!r && r.to === ts.length;
}

/** Whether a line's words are part of an atom cut short: an element and one or two of its numbers, or one or two numbers alone. */
function cutAtom(words: readonly PlacedWord[]): boolean {
  const nums = words.filter((w) => DECIMAL.test(plainMinus(w.text))).length;
  const rest = words.filter((w) => !DECIMAL.test(plainMinus(w.text)));
  return nums > 0 && nums < 3 && (rest.length === 0 || (rest.length === 1 && rest[0] === words[0] && elementOfLabel(rest[0].text) != null));
}

/**
 * Where a page's two columns part: a gap no line's word crosses, in the
 * page's middle half, with lines of whole atoms either side of it - two at
 * least on each - and none of the lines cut short there; the widest such.
 * None, for a page of one column (the gap between an atom's x and its y
 * leaves no atom whole either side).
 */
/**
 * Whether a line runs on across a page's gap between columns: a word set
 * over the gap, or words either side of it set no farther apart than its
 * words are elsewhere - two and a half times its widest space, or a line's
 * height with none to go by - no atom among them.
 */
function across(l: PlacedLine, split: number): boolean {
  const a = l.words.filter((w) => w.box[2] <= split);
  const b = l.words.filter((w) => w.box[0] >= split);
  if (wholeAtom(a) || wholeAtom(b)) return false;
  // (a word set over the gap itself)
  if (l.words.some((w) => w.box[0] < split && w.box[2] > split)) return true;
  if (!a.length || !b.length) return false;
  const gaps = l.words.slice(1).map((w, i) => w.box[0] - l.words[i].box[2]);
  const at = b[0].box[0] - a[a.length - 1].box[2];
  const others = gaps.filter((g) => g !== at);
  const em = (a[a.length - 1].box[3] - a[a.length - 1].box[1]) || 9;
  return at <= (others.length ? 2.5 * Math.max(...others) : em);
}

function gutterOf(lines: readonly PlacedLine[], width: number): number | null {
  // (the gap looked for between lines of numbers - atoms, energies - alone: a heading, a paragraph or the page's number set
  // across both columns does not close it)
  const spans = lines
    .filter((l) => l.words.filter((w) => DECIMAL.test(plainMinus(w.text))).length >= 3)
    .flatMap((l) => l.words.map((w) => [w.box[0], w.box[2]] as const))
    .sort((a, b) => a[0] - b[0]);
  const gaps: { at: number; wide: number }[] = [];
  let reach = -Infinity;
  for (const [x0, x1] of spans) {
    if (reach > -Infinity && x0 > reach) gaps.push({ at: (reach + x0) / 2, wide: x0 - reach });
    reach = Math.max(reach, x1);
  }
  for (const g of gaps.filter((q) => q.at > width / 4 && q.at < (3 * width) / 4).sort((a, b) => b.wide - a.wide)) {
    let left = 0;
    let right = 0;
    let cut = 0;
    let beside = 0;
    for (const l of lines) {
      const a = l.words.filter((w) => w.box[2] <= g.at);
      const b = l.words.filter((w) => w.box[0] >= g.at);
      // (an atom whole on one side, words on the other - not another column of a table's numbers)
      const worded = (part: readonly PlacedWord[]) => part.some((w) => /[A-Za-z]{3}/.test(w.text));
      if ((wholeAtom(a) && worded(b)) || (wholeAtom(b) && worded(a))) beside++;
      for (const part of [a, b]) {
        if (!part.length) continue;
        if (wholeAtom(part)) part === a ? left++ : right++;
        else if (cutAtom(part)) cut++;
      }
    }
    // (atoms whole on both sides - or on one, words beside them on the other: a column of atoms beside one of notes)
    if ((left >= 2 && right >= 2) || ((left >= 2 || right >= 2) && beside >= 2)) {
      if (cut <= (left + right) / 10) return g.at;
    }
  }
  return null;
}
