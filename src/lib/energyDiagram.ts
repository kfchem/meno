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
import { axisIn, howOf, leftIn, rowNamer, type Axis, type ChartLeft } from "./chart";
import type { Table, TableColumn } from "./table";
import { factor, isUnit, sameDimension } from "./units";
import { imaginaryWords, multiplicityName } from "./calc/output";
import { formulaOf } from "./io/coordinates";

/**
 * A level: its name; its energy relative to the reference, in kcal/mol; how
 * many entries it is the lowest of, and that lowest's row, entry and number
 * - and its imaginary frequencies, where known: none ([]), those its
 * calculation judged it has, or not worked out (its frequencies were not
 * computed). A level is drawn as it is either way: which should be a saddle
 * point the diagram cannot tell, so it says.
 */
export type DiagramLevel = {
  name: string;
  /** The name it came in by, where *Levels* gave it another. */
  of?: string;
  value: number;
  lowestOf: number;
  lowest: { row: number; entry?: string; number?: number; imaginary?: number[] | "not computed" };
  /** Where it holds several compounds - a reactant and a nucleophile apart - each, its energy the sum of theirs: its formula, and its own lowest (the level's `lowest` the first's). */
  sums?: { formula: string; lowestOf: number; lowest: { row: number; entry?: string; number?: number } }[];
};

/** What a row of molecules seen as a table is, as a level sums it: its compound - its constitution, charge and spin, as one key - its atoms' elements, its charge, and its multiplicity where known. */
export type RowCompound = { key: string; elements: readonly string[]; charge: number; multiplicity?: number };

/** A formula with its charge after it, as a chemist writes an ion's: "HO−", "SO42−", "Na+". */
export const formulaWithCharge = (elements: readonly string[], charge: number) =>
  `${formulaOf(elements.map((el) => ({ el })))}${charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "\u2212"}` : ""}`;

/** A level's imaginary frequencies as it says them, pointed at: "has 1 imaginary frequency, 300.0i cm⁻¹", "no imaginary frequency", or "frequencies not computed". */
export const frequenciesSaid = (imaginary: number[] | "not computed") =>
  imaginary === "not computed" ? "frequencies not computed" : imaginary.length ? `has ${imaginaryWords(imaginary)}` : "no imaginary frequency";

/** A file's name without its extension - letters first, as a kind of file's are - as a level is named by default by the file its molecule came from: "R.out" is "R"; "TS 1.2" stays. */
export const withoutExtension = (name: string) => name.replace(/\.[A-Za-z][A-Za-z0-9]{0,7}$/, "") || name;

/** The level a row of molecules seen as a table is of: its title, else its name - the file it came from, without its extension - else its group (as the molecule is called); "" where it has none. */
export function levelNamer(table: Pick<Table, "columns">): (r: readonly unknown[]) => string {
  const nameAt = ["title", "name", "group"].map((name) => table.columns.findIndex((c) => c.name === name)).filter((k) => k >= 0);
  return (r) => {
    for (const k of nameAt) if (typeof r[k] === "string" && r[k]) return table.columns[k].name === "name" ? withoutExtension(r[k] as string) : (r[k] as string);
    return "";
  };
}

/** A line of an energy diagram's *Levels*: the level it names, by the name it comes in by, and the one it is shown by, where it gives one - "R = HCN". */
export type LevelLine = { of: string; as?: string };

/** *Levels* as typed: a line for each level, in the order it is drawn - its name, and "= " a name to show it by - each blank line none. */
export function levelsTyped(text: string): (LevelLine | null)[] {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return null;
    const k = t.indexOf("=");
    if (k < 0) return { of: t };
    const as = t.slice(k + 1).trim();
    return { of: t.slice(0, k).trim(), ...(as ? { as } : {}) };
  });
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
  /** The names lines of *Levels* give that no level that comes in has - each once: left out, as `left` counts them. */
  unlisted?: string[];
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
/** A quantity as a line says it: by its symbol, where it has one - "G" - else by its name, in quotes. */
const quantitySaid = (quantity: string) => SYMBOLS[quantity] ?? `"${quantity}"`;
/** Each quantity with a symbol, in words. */
const WORDS: Record<string, string> = { energy: "electronic energy", "thermo.free-energy": "Gibbs free energy", "thermo.enthalpy": "enthalpy" };
/** The thermochemistry's corrections, which are no level's energy: never offered as one (lib/calc thermo, workflow/entries `THERMO_PROPERTIES`). */
const CORRECTIONS: ReadonlySet<string> = new Set(["thermo.zpve", "thermo.g-correction"]);

/** `text` with each number and its unit - "298.15 K", "1 atm" - kept on one line, wherever it is wrapped. */
const unbroken = (text: string) => text.replace(/(\d) (K|atm)\b/g, "$1\u00a0$2");

/** What worked an energy diagram's levels out and where, as the line under it says it - the axis says the quantity and unit alone: "ORCA · r2SCAN-3c · 298.15 K · 1 atm". */
export const diagramHow = (axis: Axis) => unbroken(howOf(axis));

/** The name a column of molecules seen as a table has before what tells its ways apart: "energy · A" is "energy". */
const baseOf = (name: string) => name.split(" \u00b7 ")[0];

/**
 * The energies the levels of `table` carry, each a column to draw them by -
 * its name - and how a list says it: its symbol relative to the reference,
 * in words, and what worked it out and where ("ΔG · Gibbs free energy ·
 * ORCA · r2SCAN-3c · 298.15 K"); in the table's order. Not the
 * thermochemistry's corrections, which are no level's energy.
 */
export function diagramQuantities(table: Pick<Table, "columns">): { value: string; label: string }[] {
  return table.columns.flatMap((c) => {
    if (c.kind !== "number" || c.unit === "none" || !isUnit(c.unit) || !sameDimension(c.unit, "kcal/mol")) return [];
    const base = baseOf(c.name);
    if (CORRECTIONS.has(base)) return [];
    // (a way of several, named for how in its column's name; one way alone, by what its column says)
    const how = c.name === base ? howOf(c) : c.name.slice(base.length + 3);
    return [{ value: c.name, label: unbroken([deltaOf(base), WORDS[base], how].filter(Boolean).join(" \u00b7 ")) }];
  });
}

const said = (names: readonly string[]) => names.map((n) => `"${n}"`).join(", ");

/**
 * `table` - molecules seen as one - as an energy diagram: its column
 * `quantity` (an energy), each level the rows of one name (`levelNamer`),
 * standing at its lowest; in the order `levels` lists them, each by the name
 * it gives (`levelsTyped`), those it does not list after them as they come -
 * none left out; relative to the level `reference` (by either name; none
 * named: the first); joined as `connects` says - a table with columns
 * *from* and *to*, naming levels - or, with none, each to the next. Why not,
 * where it cannot be: no such column, or not an energy; a level without it -
 * the other ways it has it said; two levels shown by one name; no such
 * reference; fewer than two levels. Quantities with a symbol are said by it.
 */
export function diagramOf(
  table: Table,
  options: { quantity?: string; reference?: string; levels?: string } = {},
  connects?: Table,
  compounds?: readonly RowCompound[],
): DiagramValue | { why: string } {
  const quantity = options.quantity?.trim() || "energy";
  const what = quantitySaid(quantity);
  const at = (name: string) => table.columns.findIndex((c) => c.name === name);
  const j = at(quantity);
  // (the level each row is of: its title, its name, or its group, as the molecule is called)
  const levelOf = levelNamer(table);
  if (j < 0) {
    // (worked out in more than one way: each way a column of its own, and which levels have which)
    const ways = table.columns.flatMap((c, k) => (baseOf(c.name) === quantity && c.kind === "number" ? [{ c, k }] : []));
    if (!ways.length) return { why: `It has no ${what}` };
    const whose = ways.map(({ c, k }) => `${said([c.name])} for ${[...new Set(table.rows.filter((r) => r[k] != null).map(levelOf))].join(", ") || "none"}`);
    return { why: `Its levels' ${what} was not worked out one way: ${whose.join("; ")}` };
  }
  const column = table.columns[j] as TableColumn;
  if (column.kind !== "number" || column.unit === "none" || !isUnit(column.unit) || !sameDimension(column.unit, "kcal/mol")) return { why: `"${quantity}" is no energy` };
  const toKcal = factor(column.unit, "kcal/mol");
  const entryAt = table.columns.findIndex((c) => c.kind === "entry");
  const numberAt = at("number");

  // (each level: its compounds - each its rows with a value, its lowest - in the order the levels, and their compounds, first come;
  //  without what each row is, each level one compound, its rows its conformers)
  type Part = { key: string; elements: readonly string[]; charge: number; multiplicity?: number; values: { v: number; row: number }[]; without: string[] };
  type Gathered = { name: string; parts: Part[] };
  const gathered = new Map<string, Gathered>();
  const named = rowNamer(table);
  table.rows.forEach((r, row) => {
    const name = levelOf(r);
    const g = gathered.get(name) ?? { name, parts: [] };
    const c = compounds?.[row] ?? { key: "", elements: [], charge: 0 };
    let part = g.parts.find((p) => p.key === c.key);
    if (!part) g.parts.push((part = { key: c.key, elements: c.elements, charge: c.charge, ...(c.multiplicity != null ? { multiplicity: c.multiplicity } : {}), values: [], without: [] }));
    const v = r[j];
    if (typeof v === "number" && Number.isFinite(v)) part.values.push({ v, row });
    else part.without.push(named(row));
    gathered.set(name, g);
  });
  // (in the order Levels lists them, each by the name it gives; the rest after, as they came - a line naming no level, or one listed already, counted)
  const listed = arranged([...gathered.values()], options.levels ?? "");
  if ("why" in listed) return listed;
  const levels = listed.levels;
  const shown = (g: (typeof levels)[number]) => (g.shown ? `"${g.shown}"` : "A level");
  const formula = (p: Part) => formulaWithCharge(p.elements, p.charge);
  // (a part of a level - which, where it holds several - and the level itself)
  const shownPart = (g: (typeof levels)[number], p: Part) => `${shown(g)}${g.parts.length > 1 ? ` (${formula(p)})` : ""}`;
  // (a level, or a compound of one, with no value at all: no diagram - which, and the other ways it has one, said)
  const none = levels.flatMap((g) => g.parts.filter((p) => !p.values.length).map((p) => ({ g, p })));
  if (none.length) {
    const others = ({ g, p }: (typeof none)[number]) =>
      table.columns.flatMap((c, k) =>
        k !== j && baseOf(c.name) === baseOf(quantity) && table.rows.some((r, row) => levelOf(r) === g.name && (compounds?.[row]?.key ?? "") === p.key && r[k] != null) ? [c.name] : [],
      );
    return { why: none.map((n) => `${shownPart(n.g, n.p)} has no ${what}${others(n).length ? ` - it has ${said(others(n))}` : ""}`).join("; ") };
  }
  if (levels.length < 2) return { why: "It takes two levels at least" };
  // (every level the same atoms and charge, as a reaction's are - else no diagram: each set of them said, and whose)
  if (compounds) {
    const whole = (g: (typeof levels)[number]) => formulaWithCharge(g.parts.flatMap((p) => p.elements), g.parts.reduce((n, p) => n + p.charge, 0));
    const holding = new Map<string, string[]>();
    for (const g of levels) holding.set(whole(g), [...(holding.get(whole(g)) ?? []), g.shown]);
    // (and what each level of several compounds sums - a keto and an enol, a singlet and a triplet, held as two - so that the sum is no puzzle)
    const summed = levels.filter((g) => g.parts.length > 1).map((g) => `${g.shown} sums ${countWord(g.parts.length)} compounds: ${partsSaid(g.parts).join(", ")}`);
    if (holding.size > 1)
      return {
        why: `Its levels do not hold the same atoms and charge: ${[...holding].map(([f, names]) => `${names.join(", ")} ${names.length > 1 ? "have" : "has"} ${f}`).join("; ")}${summed.length ? ` - ${summed.join("; ")}` : ""}`,
      };
  }
  const reference = options.reference?.trim();
  const ref = reference ? levels.find((g) => g.shown === reference) ?? levels.find((g) => g.name === reference) : levels[0];
  if (!ref) return { why: noLevel(reference!) };
  // (each compound at its lowest; a level, the sum of its compounds')
  const lowest = (p: Part) => p.values.reduce((a, b) => (b.v < a.v ? b : a));
  const sum = (g: Gathered) => g.parts.reduce((n, p) => n + lowest(p).v, 0);
  const zero = sum(ref);
  const where = (row: number) => {
    const entry = entryAt >= 0 ? table.rows[row][entryAt] : null;
    const number = numberAt >= 0 ? table.rows[row][numberAt] : null;
    return { row, ...(typeof entry === "string" ? { entry } : {}), ...(typeof number === "number" ? { number } : {}) };
  };
  const out: DiagramLevel[] = levels.map((g) => ({
    name: g.shown,
    ...(g.shown !== g.name ? { of: g.name } : {}),
    value: (sum(g) - zero) * toKcal,
    lowestOf: g.parts[0].values.length,
    lowest: where(lowest(g.parts[0]).row),
    ...(g.parts.length > 1 ? { sums: g.parts.map((p) => ({ formula: formula(p), lowestOf: p.values.length, lowest: where(lowest(p).row) })) } : {}),
  }));
  // (a conformer of a level - of one of its compounds - with no value, where others have one: counted)
  const left: ChartLeft[] = [
    ...listed.left,
    ...levels.flatMap((g) => g.parts.flatMap((p) => (p.without.length ? [{ count: p.without.length, why: `of ${shownPart(g, p)} with no ${what}`, rows: p.without }] : []))),
  ];

  // (the lines: as the table of what connects says, each row naming two levels - by either name; with none, each level to the next)
  const links: [number, number][] = [];
  if (connects) {
    const from = connects.columns.findIndex((c) => c.name === "from");
    const to = connects.columns.findIndex((c) => c.name === "to");
    if (from < 0 || to < 0) return { why: 'Connects takes a table with columns "from" and "to"' };
    const index = new Map(levels.flatMap((g, k) => [[g.name, k] as const, [g.shown, k] as const]));
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
  return { kind: "diagram", axis, reference: ref.shown, levels: out, links, left, ...(listed.unlisted.length ? { unlisted: listed.unlisted } : {}) };
}

/** What a reference naming no level says. */
const noLevel = (reference: string) => `No level is called "${reference}"`;

/**
 * Why an energy diagram cannot be relative to `reference`, its levels those
 * named `names` as they come in, shown as *Levels* `text` gives them: it is
 * neither name of any (as `diagramOf` takes it). None, where it names one,
 * is blank - the first - or where the levels themselves cannot be shown, which
 * `diagramOf` says.
 */
export function referenceNeed(names: readonly string[], text: string, reference: string | undefined): string | undefined {
  const r = reference?.trim();
  if (!r) return undefined;
  const listed = arranged(
    [...new Set(names)].map((name) => ({ name })),
    text,
  );
  if ("why" in listed || listed.levels.some((g) => g.shown === r || g.name === r)) return undefined;
  return noLevel(r);
}

/** A count as a line says it: in words up to ten, else in figures. */
const countWord = (n: number) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);

/** A level's compounds, each by its formula with its charge - and, where two of them have one formula, its spin too, where known ("CH2 (singlet)", "CH2 (triplet)"). */
function partsSaid(parts: readonly { elements: readonly string[]; charge: number; multiplicity?: number }[]): string[] {
  const formulas = parts.map((p) => formulaWithCharge(p.elements, p.charge));
  return formulas.map((f, k) => {
    const m = parts[k].multiplicity;
    const twin = formulas.some((g, j) => j !== k && g === f && parts[j].multiplicity !== m);
    return twin && m != null ? `${f} (${multiplicityName(m)})` : f;
  });
}

/** What lines of Levels naming no level that comes in are, left out. */
const NAMING_NONE = "of Levels naming no level that comes in";

/**
 * `levels` in the order the lines of `text` list them (`levelsTyped`), each
 * by the name its line gives - or its own - and those no line names after
 * them, as they came: none left out. A line naming no level that comes in,
 * or one listed already, counted. Why not, where two levels would be shown
 * by one name.
 */
function arranged<G extends { name: string }>(levels: readonly G[], text: string): { levels: (G & { shown: string })[]; left: ChartLeft[]; unlisted: string[] } | { why: string } {
  const byName = new Map(levels.map((g) => [g.name, g]));
  const out: (G & { shown: string })[] = [];
  const unknown: { line: string; name: string }[] = [];
  const twice: string[] = [];
  levelsTyped(text).forEach((l, k) => {
    if (!l) return;
    const g = byName.get(l.of);
    if (!g) unknown.push({ line: `Levels, line ${k + 1}`, name: l.of });
    else if (out.some((x) => x.name === l.of)) twice.push(`Levels, line ${k + 1}`);
    else out.push({ ...g, shown: l.as ?? g.name });
  });
  for (const g of levels) if (!out.some((x) => x.name === g.name)) out.push({ ...g, shown: g.name });
  const shownTwice = out.find((g, k) => out.findIndex((x) => x.shown === g.shown) !== k);
  if (shownTwice) return { why: `Two levels are named "${shownTwice.shown}"` };
  const left: ChartLeft[] = [];
  const unlisted = [...new Set(unknown.map((u) => u.name))];
  if (unknown.length) left.push({ count: unknown.length, why: `line${unknown.length === 1 ? "" : "s"} ${NAMING_NONE} (${unlisted.join(", ")})`, rows: unknown.map((u) => u.line) });
  if (twice.length) left.push({ count: twice.length, why: `line${twice.length === 1 ? "" : "s"} of Levels naming a level listed already`, rows: twice });
  return { levels: out, left, unlisted };
}

/** What an energy diagram's step says it made: how many levels, relative to which; and what was left, where anything was - each name a line of Levels gives that no level has, named ("1 left: Foo"). */
export function diagramSaid(d: DiagramValue): string {
  const left = d.left.reduce((n, l) => n + l.count, 0);
  // (the lines of Levels naming no level: theirs all that was left, or among it)
  const lines = d.left.filter((l) => l.why.includes(NAMING_NONE)).reduce((n, l) => n + l.count, 0);
  const names = left && d.unlisted?.length ? (lines === left ? `: ${d.unlisted.join(", ")}` : `, ${d.unlisted.join(", ")} among them`) : "";
  // (those that sum several compounds, each said)
  const sums = d.levels.flatMap((l) => (l.sums ? [`${l.name} sums ${l.sums.map((p) => p.formula).join(" + ")}`] : []));
  return `${d.levels.length} levels \u00b7 relative to ${d.reference}${sums.length ? ` \u00b7 ${sums.join("; ")}` : ""}${left ? ` \u00b7 ${left} left${names}` : ""}`;
}

/** A level's compounds as a workspace's file keeps them, read back: each a formula, a count of one at least and its lowest's row; none where any does not read, or there are fewer than two. */
function sumsIn(v: unknown): DiagramLevel["sums"] | undefined {
  if (!Array.isArray(v) || v.length < 2) return undefined;
  const out: NonNullable<DiagramLevel["sums"]> = [];
  for (const p of v as Partial<NonNullable<DiagramLevel["sums"]>[number]>[]) {
    const low = p?.lowest as Partial<DiagramLevel["lowest"]> | undefined;
    if (typeof p?.formula !== "string" || !Number.isInteger(p.lowestOf) || p.lowestOf! < 1 || !low || !Number.isInteger(low.row)) return undefined;
    out.push({ formula: p.formula, lowestOf: p.lowestOf!, lowest: { row: low.row!, ...(typeof low.entry === "string" ? { entry: low.entry } : {}), ...(Number.isFinite(low.number) ? { number: low.number } : {}) } });
  }
  return out;
}

/** An energy diagram as a workspace's file keeps it, read back: its axis, levels - each a finite value, a count of one at least - lines between levels it has, and what was left; none where any of that does not read. */
export function diagramIn(v: unknown): DiagramValue | undefined {
  const d = v as { kind?: unknown; axis?: unknown; reference?: unknown; levels?: unknown; links?: unknown; left?: unknown; unlisted?: unknown } | null;
  const axis = axisIn(d?.axis);
  if (!d || d.kind !== "diagram" || !axis || typeof d.reference !== "string" || !Array.isArray(d.levels) || !Array.isArray(d.links)) return undefined;
  const levels: DiagramLevel[] = [];
  for (const l of d.levels as Partial<DiagramLevel>[]) {
    const low = l?.lowest as Partial<DiagramLevel["lowest"]> | undefined;
    if (typeof l?.name !== "string" || !Number.isFinite(l.value) || !Number.isInteger(l.lowestOf) || l.lowestOf! < 1 || !low || !Number.isInteger(low.row)) return undefined;
    levels.push({
      name: l.name,
      ...(typeof l.of === "string" && l.of ? { of: l.of } : {}),
      value: l.value!,
      lowestOf: l.lowestOf!,
      lowest: {
        row: low.row!,
        ...(typeof low.entry === "string" ? { entry: low.entry } : {}),
        ...(Number.isFinite(low.number) ? { number: low.number } : {}),
        ...(low.imaginary === "not computed" || (Array.isArray(low.imaginary) && low.imaginary.every(Number.isFinite)) ? { imaginary: low.imaginary } : {}),
      },
      ...(sumsIn(l.sums) ? { sums: sumsIn(l.sums) } : {}),
    });
  }
  const links: [number, number][] = [];
  for (const k of d.links as unknown[]) {
    if (!Array.isArray(k) || k.length !== 2 || !k.every((i) => Number.isInteger(i) && i >= 0 && i < levels.length)) return undefined;
    links.push([k[0], k[1]]);
  }
  const unlisted = Array.isArray(d.unlisted) && d.unlisted.length && d.unlisted.every((n: unknown) => typeof n === "string") ? { unlisted: d.unlisted as string[] } : {};
  return { kind: "diagram", axis, reference: d.reference, levels, links, left: leftIn(d.left), ...unlisted };
}
