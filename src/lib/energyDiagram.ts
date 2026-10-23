/**
 * An energy diagram, as a value (docs/WORKFLOWS-FOUNDATION.md, *Spectra and
 * charts*: "molecules with an energy, and what each connects - a chart"):
 * levels - each a species or a saddle point, by its name - at their energy
 * relative to one of them, in kcal/mol, and the lines between them. Every
 * level's energy is the same quantity worked out the same way at the same
 * conditions - one column of molecules seen as a table (lib/table
 * `moleculesAsTable`), which never holds values worked out differently - or
 * there is no diagram, and which level does not have it is said. A level
 * of several conformers stands at its lowest, and says of how many and
 * which.
 */
import { axisIn, leftIn, rowNamer, type Axis, type ChartLeft } from "./chart";
import type { Table, TableColumn } from "./table";
import { factor, isUnit, sameDimension } from "./units";
import { imaginaryWords } from "./calc/output";

/**
 * A level: its name; its energy relative to the reference, in kcal/mol; how
 * many entries it is the lowest of, and that lowest's row, entry and number
 * - and its imaginary frequencies, where known: none ([]), those its
 * calculation judged it has, or not worked out (its frequencies were not
 * computed). A level is drawn as it is either way: which should be a saddle
 * point the diagram cannot tell, so it says.
 */
export type DiagramLevel = { name: string; value: number; lowestOf: number; lowest: { row: number; entry?: string; number?: number; imaginary?: number[] | "not computed" } };

/** A level's imaginary frequencies as it says them, pointed at: "has 1 imaginary frequency, 300.0i cm-1", "no imaginary frequency", or "frequencies not computed". */
export const frequenciesSaid = (imaginary: number[] | "not computed") =>
  imaginary === "not computed" ? "frequencies not computed" : imaginary.length ? `has ${imaginaryWords(imaginary)}` : "no imaginary frequency";

/** The level a row of molecules seen as a table is of: its title, else its name, else its group (as the molecule is called); "" where it has none. */
export function levelNamer(table: Pick<Table, "columns">): (r: readonly unknown[]) => string {
  const nameAt = ["title", "name", "group"].map((name) => table.columns.findIndex((c) => c.name === name)).filter((k) => k >= 0);
  return (r) => {
    for (const k of nameAt) if (typeof r[k] === "string" && r[k]) return r[k] as string;
    return "";
  };
}

export type DiagramValue = {
  kind: "diagram";
  /** Its axis: the quantity relative to the reference ("ΔE"), in kcal/mol, with what worked it out and where. */
  axis: Axis;
  /** The level the others are relative to. */
  reference: string;
  levels: DiagramLevel[];
  /** The lines drawn, each from one level to another, by their places in `levels`. */
  links: [number, number][];
  /** What was left out, by why: each conformer with no value named by its row (as a chart names one), each line by its row of *Connects*. */
  left: ChartLeft[];
};

/**
 * A quantity's symbol, where an axis names it by one: an electronic energy
 * is E; a free energy - Gibbs's - G, and an enthalpy H, as the IUPAC Green
 * Book (3rd ed., 2007, section 2.11) writes them. The thermochemistry's
 * corrections (zero-point energy, the free energy's correction) have none:
 * named as they are.
 */
const SYMBOLS: Record<string, string> = { energy: "E", "thermo.free-energy": "G", "thermo.enthalpy": "H" };
/** A quantity's name as an axis says it, relative to the reference: "ΔE", "ΔG". */
export const deltaOf = (quantity: string) => `\u0394${SYMBOLS[quantity] ?? quantity}`;

/** The name a column of molecules seen as a table has before what tells its ways apart: "energy · A" is "energy". */
const baseOf = (name: string) => name.split(" \u00b7 ")[0];

const said = (names: readonly string[]) => names.map((n) => `"${n}"`).join(", ");

/**
 * `table` - molecules seen as one - as an energy diagram: its column
 * `quantity` (an energy), each level the rows of one name (its `title`,
 * else `name`, else `group` column), standing at its lowest, relative to the
 * level `reference` (none named: the first); joined as `connects` says -
 * a table with columns *from* and *to*, naming levels - or, with none, each
 * to the next. Why not, where it cannot be: no such column, or not an
 * energy; a level without it - the other ways it has it said; no such
 * reference; fewer than two levels.
 */
export function diagramOf(table: Table, options: { quantity?: string; reference?: string } = {}, connects?: Table): DiagramValue | { why: string } {
  const quantity = options.quantity?.trim() || "energy";
  const at = (name: string) => table.columns.findIndex((c) => c.name === name);
  const j = at(quantity);
  // (the level each row is of: its title, its name, or its group, as the molecule is called)
  const levelOf = levelNamer(table);
  if (j < 0) {
    // (worked out in more than one way: each way a column of its own, and which levels have which)
    const ways = table.columns.flatMap((c, k) => (baseOf(c.name) === quantity && c.kind === "number" ? [{ c, k }] : []));
    if (!ways.length) return { why: `It has no column "${quantity}"` };
    const whose = ways.map(({ c, k }) => `${said([c.name])} for ${[...new Set(table.rows.filter((r) => r[k] != null).map(levelOf))].join(", ") || "none"}`);
    return { why: `Its levels' ${quantity} was not worked out one way: ${whose.join("; ")}` };
  }
  const column = table.columns[j] as TableColumn;
  if (column.kind !== "number" || column.unit === "none" || !isUnit(column.unit) || !sameDimension(column.unit, "kcal/mol")) return { why: `"${quantity}" is no energy` };
  const toKcal = factor(column.unit, "kcal/mol");
  const entryAt = table.columns.findIndex((c) => c.kind === "entry");
  const numberAt = at("number");

  // (each level: its rows with a value, its lowest - in the order the levels first come)
  type Gathered = { name: string; values: { v: number; row: number }[]; without: string[] };
  const gathered = new Map<string, Gathered>();
  const named = rowNamer(table);
  table.rows.forEach((r, row) => {
    const name = levelOf(r);
    const g = gathered.get(name) ?? { name, values: [], without: [] };
    const v = r[j];
    if (typeof v === "number" && Number.isFinite(v)) g.values.push({ v, row });
    else g.without.push(named(row));
    gathered.set(name, g);
  });
  const levels = [...gathered.values()];
  // (a level with no value at all: no diagram - which level, and the other ways it has one, said)
  const none = levels.filter((g) => !g.values.length);
  if (none.length) {
    const others = (g: Gathered) =>
      table.columns.flatMap((c, k) => (k !== j && baseOf(c.name) === baseOf(quantity) && table.rows.some((r) => levelOf(r) === g.name && r[k] != null) ? [c.name] : []));
    return { why: none.map((g) => `${g.name ? `"${g.name}"` : "A level"} has no ${quantity}${others(g).length ? ` - it has ${said(others(g))}` : ""}`).join("; ") };
  }
  if (levels.length < 2) return { why: "It takes two levels at least" };
  const reference = options.reference?.trim() || levels[0].name;
  const ref = levels.find((g) => g.name === reference);
  if (!ref) return { why: `There is no level "${reference}"` };
  const lowest = (g: Gathered) => g.values.reduce((a, b) => (b.v < a.v ? b : a));
  const zero = lowest(ref).v;
  const out: DiagramLevel[] = levels.map((g) => {
    const low = lowest(g);
    const entry = entryAt >= 0 ? table.rows[low.row][entryAt] : null;
    const number = numberAt >= 0 ? table.rows[low.row][numberAt] : null;
    return {
      name: g.name,
      value: (low.v - zero) * toKcal,
      lowestOf: g.values.length,
      lowest: { row: low.row, ...(typeof entry === "string" ? { entry } : {}), ...(typeof number === "number" ? { number } : {}) },
    };
  });
  // (a conformer of a level with no value, where others have one: counted)
  const left: ChartLeft[] = levels.flatMap((g) => (g.without.length ? [{ count: g.without.length, why: `of ${g.name ? `"${g.name}"` : "a level"} with no ${quantity}`, rows: g.without }] : []));

  // (the lines: as the table of what connects says, each row naming two levels; with none, each level to the next)
  const links: [number, number][] = [];
  if (connects) {
    const from = connects.columns.findIndex((c) => c.name === "from");
    const to = connects.columns.findIndex((c) => c.name === "to");
    if (from < 0 || to < 0) return { why: 'Connects takes a table with columns "from" and "to"' };
    const index = new Map(out.map((l, k) => [l.name, k]));
    const unnamed = new Set<string>();
    const missed: string[] = [];
    for (const [k, r] of connects.rows.entries()) {
      const a = index.get(String(r[from] ?? ""));
      const b = index.get(String(r[to] ?? ""));
      if (a == null || b == null || a === b) {
        missed.push(`Connects, row ${k + 1}`);
        for (const x of [r[from], r[to]]) if (!index.has(String(x ?? ""))) unnamed.add(String(x ?? ""));
        continue;
      }
      links.push([a, b]);
    }
    if (missed.length) left.push({ count: missed.length, why: `line${missed.length === 1 ? "" : "s"} naming no other level${unnamed.size ? ` (${[...unnamed].join(", ")})` : ""}`, rows: missed });
  } else for (let k = 1; k < out.length; k++) links.push([k - 1, k]);

  const axis: Axis = { name: deltaOf(quantity), unit: "kcal/mol", ...(column.by ? { by: column.by } : {}), ...(column.at ? { at: column.at } : {}) };
  return { kind: "diagram", axis, reference, levels: out, links, left };
}

/** What an energy diagram's step says it made: how many levels, relative to which; and what was left, where anything was. */
export function diagramSaid(d: DiagramValue): string {
  const left = d.left.reduce((n, l) => n + l.count, 0);
  return `${d.levels.length} levels \u00b7 relative to ${d.reference}${left ? ` \u00b7 ${left} left` : ""}`;
}

/** An energy diagram as a workspace's file keeps it, read back: its axis, levels - each a finite value, a count of one at least - lines between levels it has, and what was left; none where any of that does not read. */
export function diagramIn(v: unknown): DiagramValue | undefined {
  const d = v as { kind?: unknown; axis?: unknown; reference?: unknown; levels?: unknown; links?: unknown; left?: unknown } | null;
  const axis = axisIn(d?.axis);
  if (!d || d.kind !== "diagram" || !axis || typeof d.reference !== "string" || !Array.isArray(d.levels) || !Array.isArray(d.links)) return undefined;
  const levels: DiagramLevel[] = [];
  for (const l of d.levels as Partial<DiagramLevel>[]) {
    const low = l?.lowest as Partial<DiagramLevel["lowest"]> | undefined;
    if (typeof l?.name !== "string" || !Number.isFinite(l.value) || !Number.isInteger(l.lowestOf) || l.lowestOf! < 1 || !low || !Number.isInteger(low.row)) return undefined;
    levels.push({
      name: l.name,
      value: l.value!,
      lowestOf: l.lowestOf!,
      lowest: {
        row: low.row!,
        ...(typeof low.entry === "string" ? { entry: low.entry } : {}),
        ...(Number.isFinite(low.number) ? { number: low.number } : {}),
        ...(low.imaginary === "not computed" || (Array.isArray(low.imaginary) && low.imaginary.every(Number.isFinite)) ? { imaginary: low.imaginary } : {}),
      },
    });
  }
  const links: [number, number][] = [];
  for (const k of d.links as unknown[]) {
    if (!Array.isArray(k) || k.length !== 2 || !k.every((i) => Number.isInteger(i) && i >= 0 && i < levels.length)) return undefined;
    links.push([k[0], k[1]]);
  }
  return { kind: "diagram", axis, reference: d.reference, levels, links, left: leftIn(d.left) };
}
