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
import { geometryKey, stereoIdentity, type At, type By, type Entry, type Property } from "./entry";
import { identityKey } from "./chem/identity";
import { isUnit, type Unit } from "./units";

/**
 * A column: a number's, with its unit ("none": a count, a share) and what
 * worked it out and where, where known - and, where its numbers are atoms
 * of an entry, how they are counted (`atoms`: from 1, as a card and the 3D
 * view count them), said on the column so that no step that takes atoms
 * from it assumes it (`atomsOfRows`); a text's; true or false; or an
 * entry's id.
 */
export type TableColumn = (
  | { name: string; kind: "number"; unit: Unit | "none"; by?: By; at?: At; atoms?: typeof ATOMS_FROM_1 }
  | { name: string; kind: "text" }
  | { name: string; kind: "bool" }
  | { name: string; kind: "entry" }
) & {
  /**
   * What its head says, where that is other than its name ("Product" for
   * "map.entry"): its name stays its key - what rows are matched
   * on, what a condition names - and is never changed for its look.
   */
  label?: string;
};

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
 * The delimiter a file's first lines show: a tab; else a semicolon where
 * the first line has semicolons and no commas and the second has
 * semicolons too (as spreadsheets write CSV where a comma is the decimal
 * mark) - a single column's name may hold a semicolon; else a comma.
 */
export function delimiterOf(first: string, second?: string): "\t" | ";" | "," {
  if (first.includes("\t")) return "\t";
  return first.includes(";") && !first.includes(",") && (second == null || second.includes(";")) ? ";" : ",";
}

/**
 * A table read from a file's text: CSV, or TSV where its first line has a
 * tab, or values separated by semicolons where it has those and no commas;
 * a byte-order mark before it, as some programs write one, left out. Its first record names the columns, each with its unit in brackets
 * where it has one. A column is of numbers where its header gives a unit,
 * or where every cell it has reads as one; of true or false where every one
 * says so; else of text. A cell of a number column that is no number - or a
 * row with more or fewer cells than there are columns - is counted and
 * said, and left with no value; an empty cell is no value, as written.
 */
export function readTable(given: string): Table {
  const text = given.replace(/^\uFEFF/, "");
  const [first = "", second] = text.split(/\r?\n/, 2);
  const all = records(text, delimiterOf(first, second));
  const unread: Unread[] = [];
  if (!all.length) return { columns: [], rows: [], unread, left: [] };
  // (a name given twice: the second "name (2)", and said)
  const seen = new Map<string, number>();
  const heads = all[0].map((h) => {
    const head = headerOf(h);
    const k = (seen.get(head.name) ?? 0) + 1;
    seen.set(head.name, k);
    if (k === 1) return head;
    const name = `${head.name} (${k})`;
    unread.push({ row: 0, column: name, text: head.name, why: `a second column named "${head.name}": named "${name}"` });
    return { ...head, name };
  });
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
    const numbers = cells.filter((c) => numberOf(c) != null).length;
    if (h.unknown == null && cells.length && numbers === cells.length) return { name: h.name, kind: "number", unit: "none" };
    if (cells.length && cells.every((c) => TRUE.has(c.toLowerCase()) || FALSE.has(c.toLowerCase()))) return { name: h.name, kind: "bool" };
    // (numbers but for some: read as text, and said why - with the first cell that is no number)
    if (h.unknown == null && numbers) {
      const k = body.findIndex((r) => r[j].trim() && numberOf(r[j].trim()) == null);
      unread.push({ row: k + 1, column: h.name, text: body[k][j].trim(), why: `read as text: ${cells.length - numbers} of ${cells.length} cells are no number` });
    }
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

/**
 * Where a property of molecules seen as a table was worked out, as its
 * column tells it apart: at its entry's own geometry - each row its own,
 * one column for all ("energy") - or at another than its entry's ("energy
 * · at another geometry"), never a column for each geometry. The column at
 * another geometry mixes geometries - each row's value may be at a
 * different one - and its name always says so, even where it is the
 * property's only column. An entry whose geometry is frames, a drawing or
 * none has no own geometry: a property of it at any geometry is at
 * another.
 */
export const OWN_GEOMETRY = "own";
export const ANOTHER_GEOMETRY = "another";
const ANOTHER_SAID = "at another geometry";
function asSeen(p: Property, own: string | undefined): Property {
  if (!p.at) return p;
  return { ...p, at: { ...p.at, geometry: p.at.geometry === own ? OWN_GEOMETRY : ANOTHER_GEOMETRY } };
}
/** An entry's own geometry's key: its one geometry in 3D's; none for frames, a drawing or none, which no property's geometry is. */
const ownKey = (e: Entry) => (e.geometry.kind === "3d" ? geometryKey(e.geometry.xyz) : undefined);

/** What tells a property's ways of being worked out apart, field by field, as a column's name says it: what worked it out, where, and its unit. */
const FIELDS: { what: string; of: (p: Property) => string | number | undefined; say: (v: string | number) => string }[] = [
  { what: "program", of: (p) => p.by?.program, say: (v) => `${v}` },
  { what: "model", of: (p) => p.by?.model, say: (v) => `model ${v}` },
  { what: "version", of: (p) => p.by?.version, say: (v) => `version ${v}` },
  { what: "method", of: (p) => p.by?.method, say: (v) => `${v}` },
  { what: "basis", of: (p) => p.by?.basis, say: (v) => `${v}` },
  { what: "treatment", of: (p) => p.by?.treatment, say: (v) => `${v}` },
  { what: "plugin", of: (p) => p.by?.plugin, say: (v) => `plugin ${v}` },
  { what: "step", of: (p) => p.by?.step, say: (v) => `step ${v}` },
  { what: "run", of: (p) => p.by?.run, say: (v) => `run ${v}` },
  { what: "temperature", of: (p) => p.at?.kelvin, say: (v) => `${v} K` },
  { what: "pressure", of: (p) => p.at?.atm, say: (v) => `${v} atm` },
  { what: "solvent", of: (p) => p.at?.solvent, say: (v) => `${v}` },
  { what: "geometry", of: (p) => p.at?.geometry, say: (v) => (v === OWN_GEOMETRY ? "at its geometry" : v === ANOTHER_GEOMETRY ? ANOTHER_SAID : `geometry ${v}`) },
  { what: "unit", of: (p) => (p.unit === "none" ? undefined : p.unit), say: (v) => `(${v})` },
];

/**
 * Each way a property was worked out, named as its column: its name alone
 * where there is one way; else its name with what tells that way apart from
 * the others - the fields that differ among them, each said ("energy · B",
 * "energy · 298.15 K", "energy · step 4", "energy · geometry 1a2b3c4d") -
 * numbered only where that still leaves two alike.
 */
export function variantNames(name: string, ways: readonly Property[]): string[] {
  if (ways.length < 2) return ways.map(() => name);
  const differ = FIELDS.filter((f) => new Set(ways.map((p) => String(f.of(p) ?? ""))).size > 1);
  const names = ways.map((p) => {
    const said = differ.flatMap((f) => {
      const v = f.of(p);
      return v == null || v === "" ? [`${f.what} not stated`] : [f.say(v)];
    });
    return said.length ? `${name} \u00b7 ${said.join(" ")}` : name;
  });
  // (still alike: numbered, the last resort)
  const count = new Map<string, number>();
  return names.map((n) => {
    if (names.filter((x) => x === n).length < 2) return n;
    const k = (count.get(n) ?? 0) + 1;
    count.set(n, k);
    return `${n} (${k})`;
  });
}

/**
 * Molecules seen as a table (FOUNDATION: "molecules into a port that takes
 * a table, as a view"): one row per entry, in order - its id; its
 * constitution (`identityKey` of its atoms, charges and bonds; isotopes
 * are not part of it); its configuration (`stereoIdentity`; "not known"
 * where not perceived, or an element left unspecified); and each property
 * a column. A property whose values were worked out in more than one way -
 * another method, temperature or solvent - is a column for each, named for
 * how - where, as at the entry's own geometry or at another (`asSeen`). One
 * that is no number, text or true or false is left, and said; one with no
 * value, or not worked out, is missing in its row, and counted.
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
  const missing = new Map<string, number>();
  const failed = new Map<string, number>();
  for (const e of entries) {
    const own = ownKey(e);
    for (const [name, given] of Object.entries(e.properties)) {
      const p = asSeen(given, own);
      const v = p.value as Property["value"] | null | undefined;
      // (a property with no value, or not worked out - failed, or still to be: missing in its row, and counted)
      if (v == null) {
        missing.set(name, (missing.get(name) ?? 0) + 1);
        continue;
      }
      if (p.status !== "computed") {
        failed.set(name, (failed.get(name) ?? 0) + 1);
        continue;
      }
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
    const given = [...of.values()];
    // (one at another geometry than its entry's says so in its name, whether or not another way tells it apart: its values are of geometries other than their rows')
    const labels = variantNames(name, given).map((label, k) =>
      given[k].at?.geometry !== ANOTHER_GEOMETRY || label.includes(ANOTHER_SAID) ? label : `${label}${label === name ? " \u00b7 " : " "}${ANOTHER_SAID}`,
    );
    [...of].forEach(([variant, p], k) => {
      const label = labels[k];
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
    });
  }
  const rows = entries.map((e): Cell[] => [
    e.id,
    identityKey({ atoms: e.structure.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), bonds: e.structure.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })) }),
    stereoIdentity(e.stereo) ?? "not known",
    ...keys.map(({ name, variant }) => {
      const given = e.properties[name];
      const p = given && asSeen(given, ownKey(e));
      if (!p || p.value == null || p.status !== "computed" || variantOf(p) !== variant) return null;
      const v = p.value;
      return typeof v === "object" ? ("entry" in v ? v.entry : null) : v;
    }),
  ]);
  return {
    columns,
    rows,
    unread: [],
    left: [...[...left].map(([column, why]) => ({ column, why })), ...[...missing].map(([column, k]) => ({ column, why: `${k} with no value, missing in ${k === 1 ? "its row" : "their rows"}` })),
      ...[...failed].map(([column, k]) => ({ column, why: `${k} not worked out, missing in ${k === 1 ? "its row" : "their rows"}` })),
    ],
  };
}

/** The name of a column of text saying what each row is, where a table has one (molecules seen as a table: "conformer 2 of 7", "frame 3 of 12", "molecule"): a chart's point and a row it leaves say it. */
export const WHAT_COLUMN = "what";

// ---- kept in a file ----

/** A number, as a value: with its unit (or none), and what worked it out and where, where known. */
export type NumberValue = { value: number; unit: Unit | "none"; by?: By; at?: At; /** The temperature it is of, where it is of one and of no geometry: a standard-state term's. */ kelvin?: number };

const isText = (v: unknown): v is string => typeof v === "string";

/** What a file kept that does not read, as reading it counts it: a whole table or number; a table's column, row or cell; a field of what worked a value out or where. */
export type Unreadable = "table" | "tableColumn" | "tableRow" | "tableCell" | "number" | "valueField";
/** Told of each thing that does not read, and how many (`Unreadable`): a caller counts them, as a workspace's file says what it left out. */
export type Lost = (what: Unreadable, n?: number) => void;
const NO_COUNT: Lost = () => {};

/** What a file kept of what worked a number out, or where: its text fields as they are - and the numbers `numbers` names - none where nothing reads; each field that does not read told `lost`. */
export function fieldsIn<T extends object>(v: unknown, numbers: readonly string[] = [], lost: Lost = NO_COUNT): T | undefined {
  if (v == null) return undefined;
  if (typeof v !== "object") {
    lost("valueField");
    return undefined;
  }
  const out: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v)) {
    if (isText(x) || (numbers.includes(k) && typeof x === "number" && Number.isFinite(x))) out[k] = x;
    else lost("valueField");
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/** A column as a file keeps it, read back; none where its name, kind or unit does not read. */
function columnIn(c: { name?: unknown; kind?: unknown; unit?: unknown; by?: unknown; at?: unknown; atoms?: unknown; label?: unknown } | null, lost: Lost): TableColumn | undefined {
  if (!c || !isText(c.name)) return undefined;
  // (its head's words, where given: a label that does not read is left, the column kept under its name)
  if (c.label != null && !(isText(c.label) && c.label)) lost("valueField");
  const label = isText(c.label) && c.label ? { label: c.label } : {};
  if (c.kind === "number") {
    if (!(c.unit === "none" || (isText(c.unit) && isUnit(c.unit)))) return undefined;
    const by = fieldsIn<By>(c.by, [], lost);
    const at = fieldsIn<At>(c.at, ["kelvin", "atm"], lost);
    return { name: c.name, kind: "number", unit: c.unit as Unit | "none", ...(by ? { by } : {}), ...(at ? { at } : {}), ...(c.atoms === ATOMS_FROM_1 ? { atoms: ATOMS_FROM_1 } : {}), ...label };
  }
  return c.kind === "text" || c.kind === "bool" || c.kind === "entry" ? { name: c.name, kind: c.kind, ...label } : undefined;
}

/**
 * A table as a workspace's file keeps it, read back: its columns - a
 * number's unit read against Meno's units table - and its rows, each as
 * many cells as there were columns, each of its column's kind or none; what
 * was not read when it was made, and what was left, as they were. What does
 * not read is left out alone and told `lost`, never the table with it: a
 * column (its cells with it), a row not of the table's width, a cell not of
 * its column's kind - none in its row, and named among what was not read.
 * None where it is no table, or no column reads.
 */
export function tableIn(v: unknown, lost: Lost = NO_COUNT): Table | undefined {
  const t = v as { columns?: unknown; rows?: unknown; unread?: unknown; left?: unknown } | null;
  if (!t || typeof t !== "object" || !Array.isArray(t.columns) || !Array.isArray(t.rows)) {
    lost("table");
    return undefined;
  }
  const read = (t.columns as unknown[]).map((c) => columnIn(c as Parameters<typeof columnIn>[0], lost));
  const kept = read.flatMap((c, j) => (c ? [j] : []));
  if (kept.length < read.length) lost("tableColumn", read.length - kept.length);
  if (!kept.length) {
    lost("table");
    return undefined;
  }
  const columns = kept.map((j) => read[j]!);
  const fits = (c: unknown, col: TableColumn) => c === null || (col.kind === "number" ? typeof c === "number" && Number.isFinite(c) : col.kind === "bool" ? typeof c === "boolean" : typeof c === "string");
  const rows: Cell[][] = [];
  const badCells: Unread[] = [];
  for (const r of t.rows as unknown[]) {
    if (!Array.isArray(r) || r.length !== read.length) {
      lost("tableRow");
      continue;
    }
    const row = rows.length;
    rows.push(
      kept.map((j, k) => {
        if (fits(r[j], columns[k])) return r[j] as Cell;
        badCells.push({ row, column: columns[k].name, text: String(r[j]), why: "did not read from the file" });
        return null;
      }),
    );
  }
  if (badCells.length) lost("tableCell", badCells.length);
  const unread = Array.isArray(t.unread)
    ? (t.unread as Partial<Unread>[]).flatMap((u) => (Number.isInteger(u?.row) && isText(u?.column) && isText(u?.text) && isText(u?.why) ? [{ row: u.row!, column: u.column!, text: u.text!, why: u.why! }] : []))
    : [];
  const left = Array.isArray(t.left) ? (t.left as { column?: unknown; why?: unknown }[]).flatMap((l) => (isText(l?.column) && isText(l?.why) ? [{ column: l.column, why: l.why }] : [])) : [];
  return { columns, rows, unread: [...unread, ...badCells], left };
}

/** A number as a workspace's file keeps it, read back: a finite value, its unit from Meno's units table or none; none where it does not read - told `lost`, with each field of what worked it out that does not. */
export function numberIn(v: unknown, lost: Lost = NO_COUNT): NumberValue | undefined {
  const n = v as { value?: unknown; unit?: unknown; by?: unknown; at?: unknown } | null;
  if (!n || typeof n.value !== "number" || !Number.isFinite(n.value) || !(n.unit === "none" || (isText(n.unit) && isUnit(n.unit)))) {
    lost("number");
    return undefined;
  }
  const by = fieldsIn<By>(n.by, [], lost);
  const at = fieldsIn<At>(n.at, ["kelvin", "atm"], lost);
  const kelvin = (v as { kelvin?: unknown }).kelvin;
  if (kelvin != null && !(typeof kelvin === "number" && Number.isFinite(kelvin) && kelvin > 0)) lost("valueField");
  return { value: n.value, unit: n.unit as Unit | "none", ...(by ? { by } : {}), ...(at ? { at } : {}), ...(typeof kelvin === "number" && Number.isFinite(kelvin) && kelvin > 0 ? { kelvin } : {}) };
}

/**
 * A text read as a table, where it is one: a file named .csv or .tsv that
 * reads to a column at least; or another text that reads to two columns or
 * more, every row of them - none where it does not, so that prose is not
 * offered as a table.
 */
export function tableOfText(name: string, text: string): Table | null {
  const t = readTable(text);
  if (!t.columns.length || !t.rows.length) return null;
  if (/\.(csv|tsv)$/i.test(name)) return t;
  return t.columns.length >= 2 && !t.unread.some((u) => u.why.endsWith("columns")) ? t : null;
}

// ---- atoms a table names ----

/** How a column of atoms counts them (`TableColumn.atoms`): from 1, as a card and the 3D view count an entry's atoms. */
export const ATOMS_FROM_1 = "from 1";

/**
 * The atoms each row of `table` names, as an entry numbers them (from 0):
 * the cells of its columns that say they are atoms, in the columns' order -
 * each counted as its column says. Why not, where no column says it holds
 * atoms (a table read from a file never does: how it counts them is not
 * known), or a row's cell is not a whole number from 1 - never guessed.
 */
export function atomsOfRows(table: Table): { columns: string[]; rows: number[][] } | { why: string } {
  const at = table.columns.flatMap((c, k) => (c.kind === "number" && c.atoms === ATOMS_FROM_1 ? [k] : []));
  if (!at.length) return { why: "No column of the table says it holds atoms, and how it counts them" };
  const rows: number[][] = [];
  for (const [r, row] of table.rows.entries()) {
    const atoms: number[] = [];
    for (const k of at) {
      const v = row[k];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1) return { why: `Row ${r + 1}'s ${table.columns[k].name} is not an atom counted from 1` };
      atoms.push(v - 1);
    }
    rows.push(atoms);
  }
  return { columns: at.map((k) => table.columns[k].name), rows };
}
