/**
 * A calculation's results, in the one general form every plugin gives them
 * in (docs/WORKSPACE.md, stage 3, "Where the line is"). A plugin says what
 * each result is - what it belongs to (the molecule, each frame, each atom,
 * pairs of atoms, or a list), what it is called and grouped under, and its
 * values, each as a quantity Meno knows or with its own unit. Meno places
 * them and writes them: a plugin gives data, never how it looks.
 *
 * A result belongs to the plugin that gave it: its names are that plugin's
 * own, never matched against another's - two plugins' results of the same
 * name are two results, each shown as it says (the maintainer, 2026-10-06).
 *
 * What Meno does something with besides showing it - the atoms and their
 * geometries, each frame's energy, what the calculation was - has a form of
 * its own (output.ts) and is no result.
 */

/** The quantities Meno writes itself, each in its unit: an energy in hartrees, a charge in e, a wavenumber in cm⁻¹ (an imaginary one negative), a length in ångströms, an angle in degrees, a dipole in debye, a number without one. */
export const QUANTITIES = ["energy", "charge", "wavenumber", "length", "angle", "dipole", "number"] as const;
export type Quantity = (typeof QUANTITIES)[number];

/** How a value is written: as a quantity Meno knows; or else with the unit given; and to how many decimals, where not as Meno would. */
export type Measure = { quantity?: Quantity; unit?: string; digits?: number };
/** One value: a number, a text, or none. */
export type Cell = number | string | null;

type Named = {
  /** Its plugin's name for it, unique among that plugin's results (`resultKey`, among a molecule's). */
  id: string;
  /** What it is grouped under, and called: "Partial charges", "Mulliken". */
  group: string;
  label: string;
  /** The plugin it came from, its name and version: said only where another plugin's results stand beside its own. */
  from?: string;
};
/** One value of the whole molecule; `rank`, where it is in the chip's line - lower first - or not there, unset. */
export type MoleculeResult = Named & Measure & { on: "molecule"; value: Cell; rank?: number };
/** A value of each frame, in order. */
export type FramesResult = Named & Measure & { on: "frames"; values: Cell[] };
/** A value of each atom, in order. */
export type AtomsResult = Named & Measure & { on: "atoms"; values: Cell[] };
/** Values of pairs of atoms, by their indices. */
export type PairsResult = Named & Measure & { on: "pairs"; pairs: [number, number, Cell][] };
export type Column = Measure & { label: string };
/**
 * A promise: a value not sent with the rest - too big to, or worked out
 * only when wanted - and the key its plugin is asked for it by. It can stand
 * where a row's motion or surface would.
 */
export type Ask = { ask: string };
type Vec3 = [number, number, number];
/**
 * Values on a grid in space - an orbital, a density: its origin; its three
 * axes, each the step from one point to the next along it; in ångströms, as
 * the output's geometries are; how many points along each; and the value at
 * each point, the last axis running fastest, as little-endian 32-bit floats
 * in base 64. `signed`: its values go both ways - an orbital's two phases -
 * and its surface is drawn at the value and at its negative, in two
 * colours. `iso`: the value it is drawn at, at first.
 */
export type Grid = { origin: Vec3; axes: [Vec3, Vec3, Vec3]; counts: Vec3; values: string; signed?: boolean; iso?: number };
/**
 * A surface coloured by a second grid's values where it passes (docs/NCI.md):
 * an RDG isosurface coloured by sign(λ2)ρ, say, or a density's coloured by
 * the electrostatic potential - not one for any analysis alone. `by`, the
 * grid whose values colour it, on the same points as the surface's or not;
 * `from` and `to`, the values the colour scale runs between, as the grid
 * has them; `label`, what its values are, said by the scale. Meno draws the
 * scale, blue through green to red.
 */
export type SurfaceColour = { by: Grid | Ask; from: number; to: number; label?: string };
/**
 * A list's row: its values, column by column, and what Meno can do with
 * it - the atoms it is of, marked as it is pointed at; a frame, a motion
 * (each atom's displacement, x, y, z) or a surface (a grid's) - coloured by
 * another's, where it says so - shown as it is chosen. A motion, a surface
 * or what colours one may be a promise, asked for then.
 */
export type Row = {
  cells: Cell[];
  atoms?: number[];
  frame?: number;
  move?: number[] | Ask;
  surface?: Grid | Ask;
  colour?: SurfaceColour;
};
/** A list of rows; `focus`, the row it opens on; `shown`, the row chosen as it comes - the list opened at once. */
export type ListResult = Named & {
  on: "list";
  columns: Column[];
  rows: Row[];
  focus?: number;
  shown?: number;
};
export type Result = MoleculeResult | FramesResult | AtomsResult | PairsResult | ListResult;

/** How long a name or a text value may be, in characters; a unit; how many columns and rows a list may have. */
const NAME_MOST = 80;
const TEXT_MOST = 120;
const UNIT_MOST = 24;
const COLUMNS_MOST = 12;
const ROWS_MOST = 5000;
/** How long a promise's key may be; how many points a grid may have along an axis, and in all. */
const KEY_MOST = 200;
const GRID_SIDE_MOST = 400;
const GRID_POINTS_MOST = 16_000_000;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isIndex = (v: unknown, below: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < below;
const nameOf = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() && v.trim().length <= NAME_MOST ? v.trim() : undefined;

function cellOf(v: unknown): Cell | undefined {
  if (v === null || isNum(v)) return v;
  if (typeof v === "string") return v.slice(0, TEXT_MOST);
  return undefined;
}

function cellsOf(v: unknown, count?: number): Cell[] | undefined {
  if (!Array.isArray(v) || (count != null && v.length !== count)) return undefined;
  const out = v.map(cellOf);
  return out.every((c) => c !== undefined) ? (out as Cell[]) : undefined;
}

function measureOf(v: Record<string, unknown>): Measure {
  const quantity = (QUANTITIES as readonly string[]).includes(v.quantity as string) ? (v.quantity as Quantity) : undefined;
  const unit = typeof v.unit === "string" && v.unit.trim() && v.unit.length <= UNIT_MOST ? v.unit.trim() : undefined;
  const digits = Number.isInteger(v.digits) && (v.digits as number) >= 0 && (v.digits as number) <= 10 ? (v.digits as number) : undefined;
  return {
    ...(quantity ? { quantity } : unit ? { unit } : {}),
    ...(digits != null ? { digits } : {}),
  };
}

function rowOf(v: unknown, columns: number, atoms: number, frames: number): Row | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const cells = cellsOf(r.cells, columns);
  if (!cells) return undefined;
  const row: Row = { cells };
  if (Array.isArray(r.atoms) && r.atoms.length && r.atoms.every((a) => isIndex(a, atoms))) row.atoms = [...new Set(r.atoms as number[])];
  if (isIndex(r.frame, frames)) row.frame = r.frame;
  if (Array.isArray(r.move) && r.move.length === 3 * atoms && r.move.every(isNum)) row.move = r.move as number[];
  else if (askOf(r.move)) row.move = askOf(r.move);
  const surface = askOf(r.surface) ?? readGrid(r.surface);
  if (surface) row.surface = surface;
  const colour = surface ? colourOf(r.colour) : undefined;
  if (colour) row.colour = colour;
  return row;
}

/** What colours a surface, as given: a grid or a promise, and the values its scale runs between, the first below the second; otherwise none. */
export function colourOf(v: unknown): SurfaceColour | undefined {
  if (!v || typeof v !== "object") return undefined;
  const c = v as Record<string, unknown>;
  const by = askOf(c.by) ?? readGrid(c.by);
  if (!by || !isNum(c.from) || !isNum(c.to) || !(c.from < c.to)) return undefined;
  const label = typeof c.label === "string" && c.label.trim() ? c.label.trim().slice(0, UNIT_MOST * 4) : undefined;
  return { by, from: c.from, to: c.to, ...(label ? { label } : {}) };
}

/** A promise as given; otherwise none. */
export function askOf(v: unknown): Ask | undefined {
  const key = v && typeof v === "object" ? (v as { ask?: unknown }).ask : undefined;
  return typeof key === "string" && key && key.length <= KEY_MOST ? { ask: key } : undefined;
}

/** Whether a value is a promise. */
export const isAsk = (v: unknown): v is Ask => !!askOf(v);

const vec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);

/** A grid as given - its values as many as its points - otherwise none. */
export function readGrid(v: unknown): Grid | undefined {
  if (!v || typeof v !== "object") return undefined;
  const g = v as Record<string, unknown>;
  if (!vec3(g.origin) || !Array.isArray(g.axes) || g.axes.length !== 3 || !g.axes.every(vec3) || !Array.isArray(g.counts)) return undefined;
  const counts = g.counts;
  if (counts.length !== 3 || !counts.every((c) => Number.isInteger(c) && c >= 2 && c <= GRID_SIDE_MOST)) return undefined;
  const points = counts[0] * counts[1] * counts[2];
  if (points > GRID_POINTS_MOST || typeof g.values !== "string" || g.values.length !== 4 * Math.ceil((4 * points) / 3)) return undefined;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(g.values)) return undefined;
  return {
    origin: g.origin as Vec3,
    axes: g.axes as Grid["axes"],
    counts: counts as Vec3,
    values: g.values,
    ...(g.signed === true ? { signed: true } : {}),
    ...(isNum(g.iso) && g.iso > 0 ? { iso: g.iso } : {}),
  };
}

/** Values as a grid carries them: little-endian 32-bit floats, in base 64. */
export function floatsText(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** A grid's values, read from what it carries (every machine Meno runs on is little-endian). */
export function floatsOf(text: string): Float32Array {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

/** One result as given - by a plugin, or a file - where it reads as one for `atoms` atoms and `frames` frames; otherwise none. */
function resultOf(v: unknown, atoms: number, frames: number, from?: string): Result | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const id = nameOf(r.id);
  const group = nameOf(r.group);
  const label = nameOf(r.label);
  if (!id || !group || !label) return undefined;
  const source = nameOf(r.from) ?? from;
  const named = { id, group, label, ...(source ? { from: source } : {}) };
  switch (r.on) {
    case "molecule": {
      const value = cellOf(r.value);
      if (value === undefined) return undefined;
      return {
        ...named,
        on: "molecule",
        ...measureOf(r),
        value,
        ...(isNum(r.rank) ? { rank: r.rank } : {}),
      };
    }
    case "frames":
    case "atoms": {
      const values = cellsOf(r.values, r.on === "frames" ? frames : atoms);
      if (!values?.length) return undefined;
      return { ...named, on: r.on, ...measureOf(r), values };
    }
    case "pairs": {
      if (!Array.isArray(r.pairs)) return undefined;
      const pairs = r.pairs.filter(
        (p): p is [number, number, Cell] =>
          Array.isArray(p) && p.length === 3 && isIndex(p[0], atoms) && isIndex(p[1], atoms) && p[0] !== p[1] && cellOf(p[2]) !== undefined,
      );
      if (!pairs.length) return undefined;
      return {
        ...named,
        on: "pairs",
        ...measureOf(r),
        pairs: pairs.map(([a, b, c]) => [a, b, cellOf(c)!]),
      };
    }
    case "list": {
      if (!Array.isArray(r.columns) || !r.columns.length || r.columns.length > COLUMNS_MOST || !Array.isArray(r.rows)) return undefined;
      const columns = r.columns.map((c) =>
        c && typeof c === "object"
          ? {
              label: typeof (c as { label?: unknown }).label === "string" ? (c as { label: string }).label.trim().slice(0, NAME_MOST) : "",
              ...measureOf(c as Record<string, unknown>),
            }
          : null,
      );
      if (columns.some((c) => !c)) return undefined;
      const rows = r.rows.slice(0, ROWS_MOST).map((x) => rowOf(x, columns.length, atoms, frames));
      if (!rows.length || rows.some((x) => !x)) return undefined;
      return {
        ...named,
        on: "list",
        columns: columns as Column[],
        rows: rows as Row[],
        ...(isIndex(r.focus, rows.length) ? { focus: r.focus } : {}),
        ...(isIndex(r.shown, rows.length) ? { shown: r.shown } : {}),
      };
    }
    default:
      return undefined;
  }
}

/** What a result is known by among a molecule's: the plugin that gave it, and its name with that plugin. */
export const resultKey = (r: Pick<Named, "id" | "from">): string => (r.from ? `${r.from}\u0000${r.id}` : r.id);

/**
 * A molecule's results as given - by a plugin (`from`, its name and
 * version), or a file - keeping those that read as results for `atoms`
 * atoms and `frames` frames; but one its own plugin has given already
 * under its name, not again.
 */
export function readResults(given: unknown, atoms: number, frames: number, from?: string): Result[] {
  if (!Array.isArray(given)) return [];
  const out: Result[] = [];
  const seen = new Set<string>();
  for (const v of given) {
    const r = resultOf(v, atoms, frames, from);
    if (!r || seen.has(resultKey(r))) continue;
    seen.add(resultKey(r));
    out.push(r);
  }
  return out;
}

/**
 * Results by the plugin they came from, in the order they come: one part
 * with no name where they all came from one - the plugin said only where
 * another's stand beside its own - each named by `nameOf` otherwise.
 */
export function bySource<R extends Result>(results: readonly R[], nameOf: (from: string | undefined) => string): { source?: string; results: R[] }[] {
  const froms = [...new Set(results.map((r) => r.from))];
  if (froms.length < 2) return results.length ? [{ results: [...results] }] : [];
  return froms.map((f) => ({ source: nameOf(f), results: results.filter((r) => r.from === f) }));
}

/** The units Meno writes its quantities with, and the decimals it gives them. */
const UNITS: Record<Quantity, string> = {
  energy: "Eh",
  charge: "",
  wavenumber: "cm⁻¹",
  length: "Å",
  angle: "°",
  dipole: "D",
  number: "",
};
const DIGITS: Record<Quantity, number> = {
  energy: 6,
  charge: 3,
  wavenumber: 1,
  length: 3,
  angle: 1,
  dipole: 2,
  number: 4,
};
/** Decimals at most for a value with a unit of its own, where it does not say. */
const DIGITS_MOST = 4;
const MINUS = "−";

/** A number as it is written: to `digits` decimals, or at most `DIGITS_MOST` with none left trailing; a true minus. */
function numberText(v: number, digits?: number): string {
  let t = digits != null ? v.toFixed(digits) : v.toFixed(DIGITS_MOST).replace(/\.?0+$/, "");
  if (/^-0(\.0*)?$/.test(t)) t = t.slice(1);
  return t.replace(/^-/, MINUS);
}

/**
 * A value as it is written, with its unit: "−0.412", "+0.213" for a
 * charge, "1650.2 cm⁻¹" - an imaginary wavenumber "120.5i cm⁻¹" - "2.31 D",
 * "109.5°", "90.31 cal/(mol·K)"; a text as it is; none, a dash.
 */
export function valueText(v: Cell, m: Measure): string {
  if (v == null) return "–";
  if (typeof v === "string") return v;
  const q = m.quantity;
  const digits = m.digits ?? (q ? DIGITS[q] : undefined);
  if (q === "wavenumber" && v < 0) return `${numberText(-v, digits)}i ${UNITS.wavenumber}`;
  const t = numberText(v, digits);
  const unit = q ? UNITS[q] : m.unit;
  if (q === "charge") return v > 0 && !/^0(\.0*)?$/.test(t) ? `+${t}` : t;
  if (q === "angle") return `${t}°`;
  return unit ? `${t} ${unit}` : t;
}

/** Whether a value is marked where it is written: an imaginary wavenumber. */
export function isMarked(v: Cell, m: Measure): boolean {
  return m.quantity === "wavenumber" && typeof v === "number" && v < 0;
}

/** A molecule's results that belong to `on`. */
export function resultsOn<K extends Result["on"]>(results: readonly Result[] | undefined, on: K): Extract<Result, { on: K }>[] {
  return (results ?? []).filter((r): r is Extract<Result, { on: K }> => r.on === on);
}

/** Results by their group, in the order the groups first come. */
export function grouped<R extends Result>(results: readonly R[]): { group: string; results: R[] }[] {
  const out: { group: string; results: R[] }[] = [];
  for (const r of results) {
    const g = out.find((x) => x.group === r.group);
    if (g) g.results.push(r);
    else out.push({ group: r.group, results: [r] });
  }
  return out;
}

/** A pair's value in a result of pairs, whichever way round it is given; none, undefined. */
export function pairValue(r: PairsResult, a: number, b: number): Cell | undefined {
  return r.pairs.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2];
}

/** How long the chip's line may be, in characters. */
export const LINE_MOST = 96;

/**
 * The chip's line: what it says first (what the calculation was, its
 * energy), then the molecule's results its plugin ranked, in their order,
 * as many as the line holds - each its name and value - but for one ranked
 * 0, how the run went ("Run ended with an error"), which it says however
 * long the line. The plugin is the first, of those that ranked any, in the
 * order the results come (the one chosen for the kind of output first):
 * the line has room for one's.
 */
export function chipLine(first: readonly string[], results: readonly Result[] | undefined, most = LINE_MOST): string {
  const parts = first.filter(Boolean);
  let length = parts.join(" · ").length;
  const all = resultsOn(results, "molecule").filter((r) => r.rank != null);
  const ranked = all.filter((r) => r.from === all[0]?.from).sort((a, b) => a.rank! - b.rank!);
  for (const r of ranked) {
    const part = `${r.label} ${valueText(r.value, r)}`;
    const more = (parts.length ? 3 : 0) + part.length;
    if (r.rank !== 0 && length + more > most) break;
    parts.push(part);
    length += more;
  }
  return parts.join(" · ");
}
