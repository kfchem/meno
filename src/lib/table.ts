/**
 * A table, as a value (docs/WORKFLOWS-FOUNDATION.md, *Values and their
 * types*): rows and typed columns - numbers with their unit from Meno's
 * units table, text, true or false, an entry's id - each number column
 * saying what worked it out and where, where that is known. Read from a
 * file (CSV or TSV, a header of names with their units in brackets), or
 * seen in molecules (one row per entry, its id, its constitution and
 * configuration, and its properties as columns). What does not read is
 * counted and said, cell by cell - never left out unsaid.
 */
import { stereoIdentity, type At, type By, type Entry, type Property } from "./entry";
import { identityKey } from "./chem/identity";
import { isUnit, type Unit } from "./units";

/** A column: a number's, with its unit ("none": a count, a share) and what worked it out and where, where known; a text's; true or false; or an entry's id. */
export type TableColumn =
  | { name: string; kind: "number"; unit: Unit | "none"; by?: By; at?: At }
  | { name: string; kind: "text" }
  | { name: string; kind: "bool" }
  | { name: string; kind: "entry" };

/** A cell: as its column's kind is - or none, where it has no value. */
export type Cell = number | string | boolean | null;

/** A cell that did not read: its row (from 1, the header's after), its column, what it said, and why. */
export type Unread = { row: number; column: string; text: string; why: string };

export type Table = {
  columns: TableColumn[];
  rows: Cell[][];
  /** What did not read, cell by cell or row by row: counted and said. */
  unread: Unread[];
  /** What was not made a column, and why: a property that is no number, text or true or false (a list, a table, a vector). */
  left: { column: string; why: string }[];
};

// ---- read from a file ----

/**
 * A delimited text's records: RFC 4180 - fields by `delimiter`, a field in
 * double quotes holding delimiters, line breaks and doubled quotes; lines
 * ended by LF or CRLF; blank lines skipped.
 */
export function records(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let any = false;
  const end = () => {
    row.push(field);
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      any = true;
    } else if (c === delimiter) {
      end();
      any = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (any || field) {
        end();
        out.push(row);
      }
      row = [];
      field = "";
      any = false;
    } else {
      field += c;
      any = true;
    }
  }
  if (any || field) {
    end();
    out.push(row);
  }
  return out;
}

/** A header's name and its unit, where it gives one in brackets: "energy (kcal/mol)" - a unit Meno's units table does not know, said. */
export function headerOf(text: string): { name: string; unit?: Unit | "none"; unknown?: string } {
  const m = /^(.*?)\s*[([]\s*([^)\]]*?)\s*[)\]]\s*$/.exec(text.trim());
  if (!m) return { name: text.trim() };
  const name = m[1].trim() || text.trim();
  const u = m[2];
  if (u === "" || u.toLowerCase() === "none") return { name, unit: "none" };
  return isUnit(u) ? { name, unit: u } : { name, unknown: u };
}

/** A number as a table's cell writes it: digits with a point, a sign (a minus sign too) and an exponent - nothing else (no thousands' separators: a comma means one thing or another). */
export function numberOf(text: string): number | null {
  const t = text.trim().replace(/^\u2212/, "-");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const TRUE = new Set(["true", "yes"]);
const FALSE = new Set(["false", "no"]);

/**
 * A table read from a file's text: CSV, or TSV where its first line has a
 * tab. Its first record names the columns, each with its unit in brackets
 * where it has one. A column is of numbers where its header gives a unit,
 * or where every cell it has reads as one; of true or false where every one
 * says so; else of text. A cell of a number column that is no number - or a
 * row with more or fewer cells than there are columns - is counted and
 * said, and left with no value; an empty cell is no value, as written.
 */
export function readTable(text: string): Table {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const all = records(text, first.includes("\t") ? "\t" : ",");
  const unread: Unread[] = [];
  if (!all.length) return { columns: [], rows: [], unread, left: [] };
  const heads = all[0].map(headerOf);
  const body: string[][] = [];
  all.slice(1).forEach((r, k) => {
    if (r.length === heads.length) body.push(r);
    else unread.push({ row: k + 1, column: "", text: r.join(", "), why: `${r.length} cells for ${heads.length} columns` });
  });
  // (each column's kind: from its unit, else from what its cells say)
  const columns: TableColumn[] = heads.map((h, j) => {
    if (h.unknown != null) unread.push({ row: 0, column: h.name, text: h.unknown, why: "a unit Meno's units table does not know: read as text" });
    if (h.unit) return { name: h.name, kind: "number", unit: h.unit };
    const cells = body.map((r) => r[j].trim()).filter(Boolean);
    if (h.unknown == null && cells.length && cells.every((c) => numberOf(c) != null)) return { name: h.name, kind: "number", unit: "none" };
    if (cells.length && cells.every((c) => TRUE.has(c.toLowerCase()) || FALSE.has(c.toLowerCase()))) return { name: h.name, kind: "bool" };
    return { name: h.name, kind: "text" };
  });
  const rows = body.map((r, k) =>
    columns.map((col, j): Cell => {
      const t = r[j].trim();
      if (!t) return null;
      if (col.kind === "number") {
        const v = numberOf(t);
        if (v == null) unread.push({ row: k + 1, column: col.name, text: t, why: "not a number" });
        return v;
      }
      if (col.kind === "bool") return TRUE.has(t.toLowerCase());
      return t;
    }),
  );
  return { columns, rows, unread, left: [] };
}

// ---- molecules seen as a table ----

/** A column's key: a property's name, with its unit, what worked it out and where - so that values worked out differently are never one column. */
const variantOf = (p: Property) => JSON.stringify([p.unit, p.by ?? null, p.at ?? null]);

/** What worked a column's numbers out, and where, in a few words - told apart where one property's values were worked out more ways than one. */
export function workedOut(by: By | undefined, at: At | undefined): string {
  const how = by ? [by.program ?? by.model ?? by.plugin, by.version, by.method, by.basis, by.treatment].filter(Boolean).join(" ") : "";
  const where = at ? [at.kelvin != null ? `${at.kelvin} K` : "", at.atm != null ? `${at.atm} atm` : "", at.solvent ?? ""].filter(Boolean).join(", ") : "";
  return [how, where].filter(Boolean).join(" \u00b7 ") || "not stated";
}

/**
 * Molecules seen as a table (FOUNDATION: "molecules into a port that takes
 * a table, as a view"): one row per entry, in order - its id; its
 * constitution (`identityKey` of its atoms, charges and bonds; isotopes
 * are not part of it); its configuration (`stereoIdentity`; "not known"
 * where not perceived, or an element left unspecified); and each property
 * a column. A property whose values were worked out in more than one way -
 * another method, temperature or solvent - is a column for each, named for
 * how. One that is no number, text or true or false is left, and said; a
 * property an entry has not computed is no value in its row.
 */
export function moleculesAsTable(entries: readonly Entry[]): Table {
  const columns: TableColumn[] = [
    { name: "id", kind: "entry" },
    { name: "constitution", kind: "text" },
    { name: "configuration", kind: "text" },
  ];
  // (each property's ways it was worked out, in the order first met)
  const ways = new Map<string, Map<string, Property>>();
  const left = new Map<string, string>();
  for (const e of entries) {
    for (const [name, p] of Object.entries(e.properties)) {
      const v = p.value;
      if (typeof v === "object" && !("entry" in v)) {
        left.set(name, `${"list" in v ? "a list" : "table" in v ? "a table" : "vector" in v ? "a vector" : "modes" in v ? "modes" : "restraints"}, not a column`);
        continue;
      }
      const of = ways.get(name) ?? new Map<string, Property>();
      if (!of.has(variantOf(p))) of.set(variantOf(p), p);
      ways.set(name, of);
    }
  }
  const keys: { name: string; variant: string }[] = [];
  for (const [name, of] of ways) {
    for (const [variant, p] of of) {
      const label = of.size > 1 ? `${name} \u00b7 ${workedOut(p.by, p.at)}${p.unit !== "none" ? ` (${p.unit})` : ""}` : name;
      const v = p.value;
      columns.push(
        typeof v === "number"
          ? { name: label, kind: "number", unit: p.unit, ...(p.by ? { by: p.by } : {}), ...(p.at ? { at: p.at } : {}) }
          : typeof v === "boolean"
            ? { name: label, kind: "bool" }
            : typeof v === "object"
              ? { name: label, kind: "entry" }
              : { name: label, kind: "text" },
      );
      keys.push({ name, variant });
    }
  }
  const rows = entries.map((e): Cell[] => [
    e.id,
    identityKey({ atoms: e.structure.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), bonds: e.structure.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) }),
    stereoIdentity(e.stereo) ?? "not known",
    ...keys.map(({ name, variant }) => {
      const p = e.properties[name];
      if (!p || p.status !== "computed" || variantOf(p) !== variant) return null;
      const v = p.value;
      return typeof v === "object" ? ("entry" in v ? v.entry : null) : v;
    }),
  ]);
  return { columns, rows, unread: [], left: [...left].map(([column, why]) => ({ column, why })) };
}
