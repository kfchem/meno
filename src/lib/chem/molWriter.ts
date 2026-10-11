import { NOMINAL_BOND_LENGTH } from "./acs";
import { wedgeNarrowAtom } from "./layout2d";
import { abbreviationOf } from "./abbreviations";
import { placedAbbreviation } from "./abbreviationPlace";
import type { AbbreviationStructure, AtomChem, BondChem } from "./molecule";
import { elements } from "../../utils/atomUtils";

/** An atom to write: what it is (./molecule), and where, in the editor's world units. */
export type WriterAtom = AtomChem & { id: number; x: number; y: number };
/** A bond to write, between two atoms by id, as the editor holds it. */
export type WriterBond = BondChem & {
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "either" | "none";
  stereoOrient?: "principle" | "reverse";
  dative?: boolean;
};
export type WriterModel = { atoms: WriterAtom[]; bonds: WriterBond[] };

/** How long a MOL file's bonds are, in ångström: the usual 1.5. */
export const MOL_BOND_LENGTH = 1.5;

/** MOL's bond type for a coordination (dative) bond, and for a hydrogen bond. */
const COORDINATION_BOND = 9;
const HYDROGEN_BOND = 10;
/** A query bond's type ("CTfile Formats", the bond block). */
const QUERY_TYPE = { "single-or-double": 5, "single-or-aromatic": 6, "double-or-aromatic": 7, any: 8 } as const;

type Row = {
  first: number;
  second: number;
  type: number;
  stereo: "up" | "down" | "wavy" | "either" | "none";
  /** V3000's DISP: a coordination bond drawn as a plain line. */
  coord?: boolean;
  /** Its reacting centre status. */
  centre?: number;
  /** A bond to several atoms at once (V3000 ENDPTS), 1-based, and to all of them or any. */
  endpoints?: number[];
  attach?: "all" | "any";
};

/** A bond's CTfile type. */
function bondType(b: WriterBond): number {
  if (b.hydrogen) return HYDROGEN_BOND;
  if (b.query) return QUERY_TYPE[b.query];
  if ((b.dative || b.coordination) && b.order === 1) return COORDINATION_BOND;
  return b.order;
}

/**
 * The bonds as a MOL file lists them: 1-based atoms, the first of a wedge its
 * narrow end - the stereocentre, as the drawing has it - and the first of a
 * wavy bond or a dative one where the drawing starts it.
 */
function rows(model: WriterModel, index: Map<number, number>): Row[] {
  const deg = new Map<number, number>();
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    deg.set(i, (deg.get(i) ?? 0) + 1);
    deg.set(j, (deg.get(j) ?? 0) + 1);
  }
  const out: Row[] = [];
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    const stereo = b.stereo ?? "none";
    let first = i;
    if (stereo === "up" || stereo === "down") {
      first = wedgeNarrowAtom(
        { a1: i, a2: j, order: b.order, stereoOrient: b.stereoOrient },
        deg,
      );
    } else if (stereo === "wavy") {
      first = (deg.get(i) ?? 0) >= (deg.get(j) ?? 0) ? i : j;
    }
    const second = first === i ? j : i;
    // ("either" is a double bond's alone: cis or trans not known)
    const either = stereo === "either" && b.order === 2 && !b.query;
    out.push({
      first: first + 1,
      second: second + 1,
      type: bondType(b),
      stereo: stereo === "either" && !either ? "none" : stereo,
      ...(b.coordination && !b.dative ? { coord: true } : {}),
      ...(b.reactingCentre ? { centre: b.reactingCentre } : {}),
      ...(b.endpoints?.length
        ? {
            endpoints: b.endpoints.flatMap((id) => (index.has(id) ? [index.get(id)! + 1] : [])),
            attach: b.attach ?? "all",
          }
        : {}),
    });
  }
  return out;
}

const f10 = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4).padStart(10);
const i3 = (n: number) => String(n).padStart(3);
/** Whether a coordinate fits V2000's xxxxx.xxxx: ten columns, four of them decimals. */
const fitsF10 = (v: number) => f10(v).length <= 10;
/** A number as a V3000 entry has it: four decimals, as V2000's coordinates. */
const v30Number = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4);
/**
 * A string as a V3000 entry has it: in double quotes where it holds a
 * blank, a quote, a double quote, "=", "(" or ")", a double quote in it
 * doubled ("CTfile Formats", the general syntax of entries).
 */
const v30String = (t: string) => (/[\s'"=()]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
/** A V3000 molfile's fourth line: a counts line of no atoms, and the version. */
const V3000_COUNTS = "  0  0  0     0  0  0  0  0  0999 V3000";

/** MOL's radical codes. */
const RADICAL_CODE = { singlet: 1, doublet: 2, triplet: 3 } as const;

const ELEMENT_SYMBOLS = new Set(elements.map((e) => e.symbol));
/** The atom types "CTfile Formats" reserves: written as they are. */
const RESERVED = new Set(["A", "Q", "X", "M", "R", "*", "LP", "R#", "L"]);

/** An abbreviation Sgroup to write: its atoms by id (the labelled atom's first) and its label. */
type Sup = { label: string; atoms: number[] };

/**
 * The structure as a file holds it: each abbreviation written out - the
 * atoms a file gave it, or the dictionary's, placed - its labelled atom
 * become the atom it is attached by, where it was, and the rest after the
 * drawing's atoms, so that those keep their places; the abbreviation
 * Sgroups that say how they were shown; and every other label that is not
 * an element nor a reserved type, an alias on a star atom.
 */
function prepared(model: WriterModel): { model: WriterModel; sups: Sup[]; aliases: Map<number, string> } {
  const atoms = model.atoms.map((a) => ({ ...a }));
  const bonds = model.bonds.map((b) => ({ ...b }));
  const sups: Sup[] = [];
  const aliases = new Map<number, string>();
  let nextId = Math.max(0, ...model.atoms.map((a) => a.id)) + 1;
  const byId = new Map(atoms.map((a) => [a.id, a]));
  for (const a of model.atoms) {
    // (a group named as an element is - Ac, Pr, Ts - written out as the group it holds)
    if ((ELEMENT_SYMBOLS.has(a.el) && !a.abbrev) || RESERVED.has(a.el) || a.list) continue;
    const touching = bonds.filter((b) => b.a === a.id || b.b === a.id);
    const first = touching[0] ? byId.get(touching[0].a === a.id ? touching[0].b : touching[0].a) : undefined;
    const structure: AbbreviationStructure | null =
      a.abbrev ??
      (abbreviationOf(a.el)
        ? placedAbbreviation(a.el, first ? { x: first.x - a.x, y: first.y - a.y } : null, NOMINAL_BOND_LENGTH)
        : null);
    if (!structure || !structure.atoms.length) {
      aliases.set(a.id, a.el);
      continue;
    }
    const head = structure.attach[0] ?? 0;
    const ids = structure.atoms.map((_, k) => (k === head ? a.id : nextId++));
    const at = byId.get(a.id)!;
    structure.atoms.forEach((s, k) => {
      const { x, y, ...chem } = s;
      const atom = { ...chem, id: ids[k], x: a.x + x, y: a.y + y };
      if (k === head) Object.assign(at, { ...atom, abbrev: undefined, rgroups: undefined });
      else atoms.push(atom);
    });
    for (const b of structure.bonds) {
      bonds.push({ ...b, a: ids[b.a1], b: ids[b.a2], ...(b.endpoints ? { endpoints: b.endpoints.map((e) => ids[e]) } : {}) });
    }
    // the bonds out, to the atoms it is attached by, in order - haptic
    // where that is a pi system's star
    touching.forEach((b, k) => {
      const at = structure.attach[k] ?? head;
      const to = ids[at];
      if (b.a === a.id) b.a = to;
      else b.b = to;
      const pi = structure.haptic?.find((h) => h.star === at);
      if (pi) Object.assign(b, { endpoints: pi.atoms.map((e) => ids[e]), attach: "all", coordination: true });
      // (a donor that lends its pair: a coordination bond)
      else if (structure.lends?.[k] && !b.dative) Object.assign(b, { coordination: true });
    });
    sups.push({ label: a.el, atoms: [a.id, ...ids.filter((id) => id !== a.id)] });
  }
  return { model: { atoms, bonds }, sups, aliases };
}

/** An Sgroup to write: its type, its atoms by id, and what the file says of it. */
type Group = {
  type: string;
  atoms: number[];
  label?: string;
  subtype?: string;
  connect?: string;
  paren?: boolean;
  multiplier?: number;
  patoms?: number[];
  expanded?: boolean;
  componentNumber?: number;
  /** Its parent, by its place in the list. */
  parent?: number;
  field?: { name: string; data: string[]; units?: string; type?: string };
};

/**
 * Every Sgroup to write: the abbreviations written out, then the groups
 * the atoms carry (SgroupMark), each once, in the order they first come.
 */
function groupsOf(model: WriterModel, sups: Sup[]): Group[] {
  const out: Group[] = sups.map((g) => ({ type: "SUP", atoms: g.atoms, label: g.label }));
  const at = new Map<number, number>();
  const parents: (number | undefined)[] = [];
  for (const a of model.atoms) {
    for (const m of a.sgroups ?? []) {
      let k = at.get(m.id);
      if (k == null) {
        k = out.length;
        at.set(m.id, k);
        out.push({
          type: m.type,
          atoms: [],
          ...(m.label ? { label: m.label } : {}),
          ...(m.subtype ? { subtype: m.subtype } : {}),
          ...(m.connect ? { connect: m.connect } : {}),
          ...(m.bracketStyle === "paren" ? { paren: true } : {}),
          ...(m.multiplier ? { multiplier: m.multiplier } : {}),
          ...(m.type === "MUL" ? { patoms: [] } : {}),
          ...(m.type === "SUP" ? { expanded: true } : {}),
          ...(m.componentNumber ? { componentNumber: m.componentNumber } : {}),
          ...(m.field ? { field: m.field } : {}),
        });
        parents[k] = m.parent;
      }
      out[k].atoms.push(a.id);
      if (m.paradigm) out[k].patoms!.push(a.id);
    }
  }
  parents.forEach((p, k) => {
    if (p != null && at.has(p)) out[k].parent = at.get(p);
  });
  return out;
}

/** The types whose brackets are drawn, and so written. */
const BRACKETED = new Set(["SRU", "COP", "MON", "MER", "CRO", "MOD", "GRA", "COM", "MIX", "FOR", "ANY", "GEN"]);

/**
 * A group's brackets as the file has them, in its units: one across each
 * bond out of it, at its middle, or for a group with no bond out, one
 * either side of it - as Meno draws them.
 */
function bracketsOf(model: WriterModel, g: Group, scale: number): { x1: number; y1: number; x2: number; y2: number }[] {
  const inside = new Set(g.atoms);
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const b of model.bonds) {
    if (inside.has(b.a) === inside.has(b.b) || b.endpoints?.length) continue;
    const p = byId.get(b.a);
    const q = byId.get(b.b);
    if (!p || !q) continue;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
    const c = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const h = len * 0.35;
    out.push({ x1: (c.x - n.x * h) * scale, y1: (c.y - n.y * h) * scale, x2: (c.x + n.x * h) * scale, y2: (c.y + n.y * h) * scale });
  }
  if (!out.length && g.atoms.length) {
    const ats = g.atoms.map((id) => byId.get(id)!).filter(Boolean);
    const xs = ats.map((a) => a.x);
    const ys = ats.map((a) => a.y);
    const pad = NOMINAL_BOND_LENGTH * 0.5;
    const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
    out.push({ x1: x0 * scale, y1: y0 * scale, x2: x0 * scale, y2: y1 * scale });
    out.push({ x1: x1 * scale, y1: y0 * scale, x2: x1 * scale, y2: y1 * scale });
  }
  return out;
}

/** An atom's type as written: its element, a reserved type, a star for a label, L for a list. */
function symbolOf(a: WriterAtom, aliases: Map<number, string>): string {
  if (a.list) return "L";
  if (aliases.has(a.id)) return "*";
  return a.el;
}

/**
 * A V2000 block's property lines for its charges, radicals and isotopes,
 * eight atoms a line, as the format has them. (The atom block's own charge
 * field is left at 0: a CHG line supersedes it anyway, and holds any
 * charge, where the field stops at 3.)
 */
function propertyLines(model: WriterModel, sups: Sup[] = [], aliases = new Map<number, string>()): string[] {
  const lines: string[] = [];
  const add = (tag: string, entries: [number, number][]) => {
    for (let k = 0; k < entries.length; k += 8) {
      const part = entries.slice(k, k + 8);
      lines.push(`M  ${tag}${i3(part.length)}${part.map(([i, v]) => ` ${i3(i)} ${i3(v)}`).join("")}`);
    }
  };
  const each = <T>(pick: (a: WriterAtom) => T | undefined, code: (v: T) => number) =>
    model.atoms.flatMap((a, i): [number, number][] => {
      const v = pick(a);
      return v ? [[i + 1, code(v)]] : [];
    });
  add("CHG", each((a) => a.charge, (v) => v));
  add("RAD", each((a) => a.radical, (v) => RADICAL_CODE[v]));
  add("ISO", each((a) => a.isotope, (v) => v));
  // an Rgroup's numbers; an atom list's symbols, four wide
  add(
    "RGP",
    model.atoms.flatMap((a, i): [number, number][] => (a.rgroups ?? []).map((r) => [i + 1, r])),
  );
  model.atoms.forEach((a, i) => {
    if (!a.list) return;
    const symbols = a.list.symbols.slice(0, 16);
    lines.push(`M  ALS ${i3(i + 1)}${i3(symbols.length)} ${a.list.not ? "T" : "F"} ${symbols.map((s) => s.padEnd(4)).join("")}`);
  });
  // a label that is no element nor any abbreviation: an alias, its text on the next line
  model.atoms.forEach((a, i) => {
    const text = aliases.get(a.id);
    if (text) lines.push(`A  ${i3(i + 1)}`, text);
  });
  const groups = groupsOf(model, sups);
  if (groups.length) {
    const index = new Map(model.atoms.map((a, i) => [a.id, i + 1]));
    const rowOf = new Map(model.bonds.map((b, i) => [b, i + 1]));
    const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
    const each = (tag: string, entries: string[], per: number) => {
      for (let k = 0; k < entries.length; k += per) {
        const part = entries.slice(k, k + per);
        lines.push(`M  ${tag}${i3(part.length)}${part.join("")}`);
      }
    };
    each("STY", groups.map((g, k) => ` ${i3(k + 1)} ${g.type}`), 8);
    each("SST", groups.flatMap((g, k) => (g.subtype ? [` ${i3(k + 1)} ${g.subtype.padEnd(3)}`] : [])), 8);
    each("SCN", groups.flatMap((g, k) => (g.connect ? [` ${i3(k + 1)} ${g.connect.padEnd(3)}`] : [])), 8);
    each("SBT", groups.flatMap((g, k) => (g.paren ? [` ${i3(k + 1)} ${i3(1)}`] : [])), 8);
    each("SPL", groups.flatMap((g, k) => (g.parent != null ? [` ${i3(k + 1)} ${i3(g.parent + 1)}`] : [])), 8);
    each("SNC", groups.flatMap((g, k) => (g.componentNumber ? [` ${i3(k + 1)} ${i3(g.componentNumber)}`] : [])), 8);
    const expanded = groups.flatMap((g, k) => (g.expanded ? [` ${i3(k + 1)}`] : []));
    for (let k = 0; k < expanded.length; k += 15) {
      const part = expanded.slice(k, k + 15);
      lines.push(`M  SDS EXP${i3(part.length)}${part.join("")}`);
    }
    groups.forEach((g, k) => {
      const n = k + 1;
      const inside = new Set(g.atoms);
      const list = (tag: string, values: number[]) => {
        for (let j = 0; j < values.length; j += 15) {
          const part = values.slice(j, j + 15);
          lines.push(`M  ${tag} ${i3(n)}${i3(part.length)}${part.map((v) => ` ${i3(v)}`).join("")}`);
        }
      };
      list("SAL", g.atoms.map((id) => index.get(id)!).filter((v) => v != null));
      if (g.type !== "DAT") {
        list("SBL", model.bonds.filter((b) => inside.has(b.a) !== inside.has(b.b)).map((b) => rowOf.get(b)!));
      }
      if (g.patoms?.length) list("SPA", g.patoms.map((id) => index.get(id)!));
      const text = g.type === "MUL" && g.multiplier ? String(g.multiplier) : g.label;
      if (text) lines.push(`M  SMT ${i3(n)} ${text}`);
      if (BRACKETED.has(g.type)) {
        for (const br of bracketsOf(model, g, scale)) {
          lines.push(`M  SDI ${i3(n)}${i3(4)}${f10(br.x1)}${f10(br.y1)}${f10(br.x2)}${f10(br.y2)}`);
        }
      }
      if (g.type === "DAT" && g.field) {
        lines.push(`M  SDT ${i3(n)} ${g.field.name.padEnd(30).slice(0, 30)}${(g.field.type ?? "T").slice(0, 1)}${(g.field.units ?? "").padEnd(20).slice(0, 20)}`);
        for (const d of g.field.data) {
          // 69 characters a line: SCD for all but the last, SED for that
          for (let j = 0; j + 69 < d.length; j += 69) lines.push(`M  SCD ${i3(n)} ${d.slice(j, j + 69)}`);
          lines.push(`M  SED ${i3(n)} ${d.slice(Math.floor(Math.max(0, d.length - 1) / 69) * 69)}`);
        }
      }
    });
  }
  return lines;
}

/** V2000's atom block fields after the symbol: dd ccc sss hhh bbb vvv HHH rrr iii mmm nnn eee. */
function atomFields(a: WriterAtom): string {
  // a query hydrogen count is one more than the count; a valence of none, 15
  const hhh = a.hCount != null ? a.hCount + 1 : 0;
  const vvv = a.valence == null ? 0 : a.valence === 0 ? 15 : a.valence;
  // the reaction's: mapping, inversion (1) or retention (2), exact change
  const nnn = a.invRet === "invert" ? 1 : a.invRet === "retain" ? 2 : 0;
  return [0, 0, 0, hhh, 0, vvv, 0, 0, 0, a.map ?? 0, nnn, a.exactChange ? 1 : 0]
    .map((v, i) => (i === 0 ? " 0" : i3(v)))
    .join("");
}

/**
 * The enhanced stereo groups the structure's centres and stereo bonds are
 * in, as V3000 collections name them: MDLV30/STEABS, STERACn, STERELn, and
 * the bond collections STEBABS, STEBRACn, STEBRELn.
 */
function stereoCollections(model: WriterModel, index: Map<number, number>): string[] {
  const name = (g: { kind: "abs" | "and" | "or"; n?: number }, bond: boolean) =>
    `MDLV30/STE${bond ? "B" : ""}${g.kind === "abs" ? "ABS" : g.kind === "and" ? `RAC${g.n ?? 1}` : `REL${g.n ?? 1}`}`;
  const atoms = new Map<string, number[]>();
  model.atoms.forEach((a, i) => {
    if (a.stereoGroup) atoms.set(name(a.stereoGroup, false), [...(atoms.get(name(a.stereoGroup, false)) ?? []), i + 1]);
  });
  const bonds = new Map<string, number[]>();
  let row = 0;
  for (const b of model.bonds) {
    if (!index.has(b.a) || !index.has(b.b)) continue;
    row++;
    if (b.stereoGroup) bonds.set(name(b.stereoGroup, true), [...(bonds.get(name(b.stereoGroup, true)) ?? []), row]);
  }
  return [
    ...[...atoms].map(([n, list]) => `M  V30 ${n} ATOMS=(${list.length} ${list.join(" ")})`),
    ...[...bonds].map(([n, list]) => `M  V30 ${n} BONDS=(${list.length} ${list.join(" ")})`),
  ];
}

/**
 * The chiral flag: set where every stereocentre with a group is in an
 * absolute one - all V2000 can say of enhanced stereo ("CTfile Formats":
 * with no collections, the flag applies to every centre).
 */
function chiralFlag(model: WriterModel): boolean {
  const groups = [...model.atoms.map((a) => a.stereoGroup), ...model.bonds.map((b) => b.stereoGroup)].filter(Boolean);
  return groups.length > 0 && groups.every((g) => g!.kind === "abs");
}

/** The second header line: the program, no date, and that it is 2D. */
const PROGRAM_LINE = "  Meno    " + " ".repeat(10) + "2D";

function writeV2000(given: WriterModel, title: string): string {
  const { model, sups, aliases } = prepared(given);
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  const bonds = rows(model, index);
  // (a double bond's 3: cis or trans, either)
  const code = { up: 1, down: 6, wavy: 4, either: 3, none: 0 } as const;
  const lines = [
    title,
    PROGRAM_LINE,
    "",
    `${i3(model.atoms.length)}${i3(bonds.length)}  0  0${i3(chiralFlag(model) ? 1 : 0)}  0  0  0  0  0999 V2000`,
  ];
  for (const a of model.atoms) {
    lines.push(`${f10(a.x * scale)}${f10(a.y * scale)}${f10(0)} ${symbolOf(a, aliases).padEnd(3)}` + atomFields(a));
  }
  for (const b of bonds) {
    lines.push(
      `${i3(b.first)}${i3(b.second)}${i3(b.type)}${i3(code[b.stereo])}  0  0${i3(b.centre ?? 0)}`,
    );
  }
  lines.push(...propertyLines(model, sups, aliases), "M  END");
  return lines.join("\n") + "\n";
}

/**
 * A V3000 line in lines of no more than 80 characters: each but the last
 * ending "-", the next taking up after "M  V30 " ("CTfile Formats", the
 * general syntax of entries).
 */
function fitV3000(line: string): string[] {
  if (line.length <= 80 || !line.startsWith("M  V30 ")) return [line];
  const out: string[] = [];
  let rest = line.slice(7);
  while (7 + rest.length > 80) {
    out.push("M  V30 " + rest.slice(0, 72) + "-");
    rest = rest.slice(72);
  }
  out.push("M  V30 " + rest);
  return out;
}

function writeV3000(given: WriterModel, title: string): string {
  const lines = [title, PROGRAM_LINE, "", V3000_COUNTS, ...ctabV3000(given), "M  END"];
  return lines.join("\n") + "\n";
}

/** The structure as a V3000 CTAB block, BEGIN CTAB to END CTAB: a MOL file's, or one molecule's in an RXN file. */
function ctabV3000(given: WriterModel): string[] {
  const { model, sups: found, aliases } = prepared(given);
  // (V3000 has no alias: a label is an abbreviation Sgroup of its one star atom)
  const sups = [...found, ...[...aliases].map(([id, label]) => ({ label, atoms: [id] }))];
  const groups = groupsOf(model, sups);
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  const bonds = rows(model, index);
  const cfg = { up: 1, down: 3, wavy: 2, either: 2, none: 0 } as const;
  const lines = [
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${model.atoms.length} ${bonds.length} ${groups.length} 0 ${chiralFlag(model) ? 1 : 0}`,
    "M  V30 BEGIN ATOM",
  ];
  model.atoms.forEach((a, i) => {
    const props =
      (a.charge ? ` CHG=${a.charge}` : "") +
      (a.radical ? ` RAD=${RADICAL_CODE[a.radical]}` : "") +
      (a.isotope ? ` MASS=${a.isotope}` : "") +
      (a.valence != null ? ` VAL=${a.valence === 0 ? -1 : a.valence}` : "") +
      (a.hCount != null ? ` HCOUNT=${a.hCount === 0 ? -1 : a.hCount}` : "") +
      (a.rgroups?.length ? ` RGROUPS=(${a.rgroups.length} ${a.rgroups.join(" ")})` : "") +
      (a.invRet ? ` INVRET=${a.invRet === "invert" ? 1 : 2}` : "") +
      (a.exactChange ? " EXACHG=1" : "");
    // an atom list's type is the list
    const type = a.list
      ? `${a.list.not ? '"NOT ' : ""}[${a.list.symbols.join(",")}]${a.list.not ? '"' : ""}`
      : symbolOf(a, aliases);
    lines.push(`M  V30 ${i + 1} ${type} ${v30Number(a.x * scale)} ${v30Number(a.y * scale)} 0 ${a.map ?? 0}${props}`);
  });
  lines.push("M  V30 END ATOM");
  if (bonds.length > 0) {
    lines.push("M  V30 BEGIN BOND");
    bonds.forEach((b, i) => {
      const c = cfg[b.stereo];
      lines.push(
        `M  V30 ${i + 1} ${b.type} ${b.first} ${b.second}` +
          (c ? ` CFG=${c}` : "") +
          (b.coord ? " DISP=COORD" : "") +
          (b.centre ? ` RXCTR=${b.centre}` : "") +
          (b.endpoints?.length ? ` ENDPTS=(${b.endpoints.length} ${b.endpoints.join(" ")}) ATTACH=${b.attach === "any" ? "ANY" : "ALL"}` : ""),
      );
    });
    lines.push("M  V30 END BOND");
  }
  if (groups.length) {
    const rowOf = new Map(model.bonds.map((b, i) => [b, i + 1]));
    const listOf = (values: number[]) => `(${values.length} ${values.join(" ")})`;
    lines.push("M  V30 BEGIN SGROUP");
    groups.forEach((g, k) => {
      const inside = new Set(g.atoms);
      const ats = g.atoms.map((id) => index.get(id)! + 1);
      const crossing =
        g.type === "DAT" ? [] : model.bonds.filter((b) => inside.has(b.a) !== inside.has(b.b)).map((b) => rowOf.get(b)!);
      const brackets = BRACKETED.has(g.type) ? bracketsOf(model, g, scale) : [];
      lines.push(
        `M  V30 ${k + 1} ${g.type} 0 ATOMS=${listOf(ats)}` +
          (crossing.length ? ` XBONDS=${listOf(crossing)}` : "") +
          (g.patoms?.length ? ` PATOMS=${listOf(g.patoms.map((id) => index.get(id)! + 1))}` : "") +
          (g.subtype ? ` SUBTYPE=${g.subtype}` : "") +
          (g.multiplier ? ` MULT=${g.multiplier}` : "") +
          (g.connect ? ` CONNECT=${g.connect}` : "") +
          (g.parent != null ? ` PARENT=${g.parent + 1}` : "") +
          (g.componentNumber ? ` COMPNO=${g.componentNumber}` : "") +
          (g.label && g.type !== "MUL" ? ` LABEL=${v30String(g.label)}` : "") +
          brackets.map((b) => ` BRKXYZ=(9 ${v30Number(b.x1)} ${v30Number(b.y1)} 0 ${v30Number(b.x2)} ${v30Number(b.y2)} 0 0 0 0)`).join("") +
          (g.paren ? " BRKTYP=PAREN" : "") +
          (g.expanded ? " ESTATE=E" : "") +
          (g.field ? ` FIELDNAME=${v30String(g.field.name)}${g.field.data.map((d) => ` FIELDDATA=${v30String(d)}`).join("")}` : ""),
      );
    });
    lines.push("M  V30 END SGROUP");
  }
  const collections = stereoCollections(model, index);
  if (collections.length) lines.push("M  V30 BEGIN COLLECTION", ...collections, "M  V30 END COLLECTION");
  lines.push("M  V30 END CTAB");
  return lines.flatMap(fitV3000);
}

/**
 * The structure as a MOL file. V2000 wherever it can say everything - which
 * it cannot for a dative, coordination or hydrogen bond, or past 999 atoms
 * or bonds - and V3000 where it cannot, unless one is asked for.
 *
 * Coordinates are scaled so the editor's nominal bond comes out at 1.5 Å;
 * hydrogens are left implicit, as the drawing has them.
 */
export function writeMolfile(
  model: WriterModel,
  options: { title?: string; version?: "V2000" | "V3000" | "auto" } = {},
): string {
  const title = titleLine(options.title);
  const version = options.version ?? "auto";
  return version === "V3000" || (version === "auto" && needsV3000(model))
    ? writeV3000(model, title)
    : writeV2000(model, title);
}

/** A title as a header's line: one line, of no more than 80 characters. */
function titleLine(title: string | undefined): string {
  return (title ?? "").replace(/[\r\n]+/g, " ").slice(0, 80);
}

/**
 * Whether V2000 cannot say all there is to say of the structure, its
 * labels written out: what is wider than V2000's fixed fields - past 999
 * atoms, bonds or Sgroups, or mapping numbers (three columns each), or a
 * coordinate past xxxxx.xxxx ("CTfile Formats", automatic V3000 output:
 * long fields); a coordination or a hydrogen bond, and whether the one is
 * drawn as a plain line (V2000's bond types stop at 8); racemic and
 * relative stereo groups, a stereo bond's group and a haptic bond's
 * endpoints.
 */
export function needsV3000(given: WriterModel): boolean {
  // (as written: a label's atoms - a complex's coordination bonds - among them)
  const { model, sups } = prepared(given);
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  return (
    model.atoms.length > 999 ||
    model.bonds.length > 999 ||
    model.atoms.some((a) => (a.map ?? 0) > 999 || !fitsF10(a.x * scale) || !fitsF10(a.y * scale)) ||
    groupsOf(model, sups).length > 999 ||
    model.bonds.some((b) => ((b.dative || b.coordination) && b.order === 1) || b.hydrogen || b.stereoGroup || b.endpoints?.length) ||
    // (V2000 has only the chiral flag: no racemic nor relative groups)
    model.atoms.some((a) => a.stereoGroup && a.stereoGroup.kind !== "abs")
  );
}

/** A reaction to write: its molecules by role, each in the drawing's coordinates. */
export type WriterReaction = {
  reactants: WriterModel[];
  products: WriterModel[];
  reagents: WriterModel[];
};

/**
 * An RXN file's third line: the user's initials (six characters), the
 * program (nine), the date (twelve) and a registry number (seven) - here
 * the program alone ("CTfile Formats", the Rxnfile header block).
 */
const RXN_PROGRAM_LINE = " ".repeat(6) + "Meno";

/**
 * The reaction as an RXN file ("CTfile Formats", the V2000 and V3000
 * Rxnfile chapters): V2000 - $MOL blocks, each a MOL file - wherever every
 * molecule can be written V2000, and V3000 - one CTAB block for each, in
 * REACTANT, PRODUCT and REAGENT blocks - where one cannot, unless one is
 * asked for. Reactants, then products, then reagents, as the format has
 * them; the reagents' count is left out when there are none, which a
 * reader takes as none.
 */
export function writeRxnfile(
  reaction: WriterReaction,
  options: { title?: string; version?: "V2000" | "V3000" | "auto" } = {},
): string {
  const title = titleLine(options.title);
  const { reactants, products, reagents } = reaction;
  const all = [...reactants, ...products, ...reagents];
  const version = options.version ?? "auto";
  const v3000 =
    version === "V3000" ||
    (version === "auto" && (all.some(needsV3000) || Math.max(reactants.length, products.length, reagents.length) > 999));
  if (!v3000) {
    const lines = [
      "$RXN",
      title,
      RXN_PROGRAM_LINE,
      "",
      `${i3(reactants.length)}${i3(products.length)}${reagents.length ? i3(reagents.length) : ""}`,
    ];
    const blocks = all.map((m) => "$MOL\n" + writeV2000(m, ""));
    return lines.join("\n") + "\n" + blocks.join("");
  }
  const block = (name: string, mols: WriterModel[]) => [
    `M  V30 BEGIN ${name}`,
    ...mols.flatMap(ctabV3000),
    `M  V30 END ${name}`,
  ];
  const lines = [
    "$RXN V3000",
    title,
    RXN_PROGRAM_LINE,
    "",
    `M  V30 COUNTS ${reactants.length} ${products.length}${reagents.length ? ` ${reagents.length}` : ""}`,
    ...block("REACTANT", reactants),
    ...block("PRODUCT", products),
    ...(reagents.length ? block("REAGENT", reagents) : []),
    "M  END",
  ];
  return lines.join("\n") + "\n";
}

/** An atom or a bond of a molecule in 3D, as a file gives it: in ångströms, its bonds by atom index. */
export type Atom3D = { el: string; x: number; y: number; z: number; charge?: number; isotope?: number };
export type Bond3D = { a1: number; a2: number; order: number };

/** The second header line of a molfile in 3D: the program, no date, and that it is 3D. */
const PROGRAM_LINE_3D = "  Meno    " + " ".repeat(10) + "3D";

/**
 * Whether V2000 cannot hold a molecule in 3D: past 999 atoms or bonds - the
 * counts line's fields and the bond block's atom numbers are three columns
 * - a coordinate past xxxxx.xxxx or a symbol past aaa ("CTfile Formats",
 * automatic V3000 output: long fields); or a bond of a type V2000 has not,
 * its types stopping at 8: a coordination (9) or a hydrogen (10) bond.
 */
export function needsV3000In3d(atoms: readonly Atom3D[], bonds: readonly Bond3D[]): boolean {
  return (
    atoms.length > 999 ||
    bonds.length > 999 ||
    bonds.some((b) => b.order > 8) ||
    atoms.some((a) => a.el.length > 3 || !fitsF10(a.x) || !fitsF10(a.y) || !fitsF10(a.z))
  );
}

/**
 * A molecule in 3D as a molfile: its atoms where they are, in ångströms,
 * its bonds by type as given, its charges and isotopes, and a header that
 * says it is 3D ("CTfile Formats"). V2000 - charges and isotopes as M  CHG
 * and M  ISO lines - wherever V2000 holds it, and V3000 - CHG and MASS on
 * the atoms - where it cannot (`needsV3000In3d`), unless one is asked for.
 */
export function writeMolfile3d(
  atoms: Atom3D[],
  bonds: Bond3D[],
  options: { title?: string; version?: "V2000" | "V3000" | "auto" } = {},
): string {
  const version = options.version ?? "auto";
  const head = [titleLine(options.title), PROGRAM_LINE_3D, ""];
  if (version === "V3000" || (version === "auto" && needsV3000In3d(atoms, bonds))) {
    const lines = [
      ...head,
      V3000_COUNTS,
      "M  V30 BEGIN CTAB",
      `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`,
      "M  V30 BEGIN ATOM",
    ];
    atoms.forEach((a, i) =>
      lines.push(
        `M  V30 ${i + 1} ${v30String(a.el)} ${v30Number(a.x)} ${v30Number(a.y)} ${v30Number(a.z)} 0` +
          (a.charge ? ` CHG=${a.charge}` : "") +
          (a.isotope ? ` MASS=${a.isotope}` : ""),
      ),
    );
    lines.push("M  V30 END ATOM");
    if (bonds.length > 0) {
      lines.push("M  V30 BEGIN BOND");
      bonds.forEach((b, i) => lines.push(`M  V30 ${i + 1} ${b.order} ${b.a1 + 1} ${b.a2 + 1}`));
      lines.push("M  V30 END BOND");
    }
    lines.push("M  V30 END CTAB", "M  END");
    return lines.flatMap(fitV3000).join("\n") + "\n";
  }
  const lines = [...head, `${i3(atoms.length)}${i3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const a of atoms) lines.push(`${f10(a.x)}${f10(a.y)}${f10(a.z)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of bonds) lines.push(`${i3(b.a1 + 1)}${i3(b.a2 + 1)}${i3(b.order)}  0  0  0  0`);
  // (eight to a line)
  const props = (tag: string, pairs: [number, number][]) => {
    for (let i = 0; i < pairs.length; i += 8) {
      const some = pairs.slice(i, i + 8);
      lines.push(`M  ${tag}${i3(some.length)}` + some.map(([k, v]) => ` ${i3(k)} ${i3(v)}`).join(""));
    }
  };
  props("CHG", atoms.flatMap((a, i) => (a.charge ? [[i + 1, a.charge] as [number, number]] : [])));
  props("ISO", atoms.flatMap((a, i) => (a.isotope ? [[i + 1, a.isotope] as [number, number]] : [])));
  lines.push("M  END");
  return lines.join("\n") + "\n";
}

/** The structure as a one-record SD file. */
export function writeSdf(
  model: WriterModel,
  options: { title?: string; version?: "V2000" | "V3000" | "auto" } = {},
): string {
  return writeMolfile(model, options) + "$$$$\n";
}
