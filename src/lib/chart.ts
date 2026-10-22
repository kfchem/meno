/**
 * A chart, as a value (docs/WORKFLOWS-FOUNDATION.md, *Values and their
 * types*: "a table and how Meno draws it"): one column of a table against
 * another - each axis its column's name, unit and what worked it out - and
 * a point for each row with both, carrying its row and the entry it is of,
 * where the table names one. Rows without both values are counted and
 * said, never dropped unsaid.
 */
import type { At, By } from "./entry";
import { fieldsIn, type Table } from "./table";
import { isUnit, type Unit } from "./units";

/** An axis: the column it is of - its name, unit, and what worked it out and where, where known. */
export type Axis = { name: string; unit: Unit | "none"; by?: By; at?: At };

/** A point: its values, its row in the table (from 0), and the entry it is of, where the table has a column of entries. */
export type ChartPoint = { x: number; y: number; row: number; entry?: string };

export type ChartValue = { kind: "points"; x: Axis; y: Axis; points: ChartPoint[]; left: { count: number; why: string }[] };

/** An axis as its label says it: its name, its unit in brackets. */
export const axisLabel = (a: Axis) => (a.unit === "none" ? a.name : `${a.name} (${a.unit})`);

/**
 * `table` charted: column `x` against column `y`, each a column of numbers -
 * none given, its first two. Each row with a number in both is a point,
 * carrying its row and its entry (the table's first column of entries);
 * the rest counted, by what they lack. Why not, where it cannot be: a
 * column named that is not there, or is no column of numbers, or fewer than
 * two such columns where none is named.
 */
export function chartOfTable(table: Table, x?: string, y?: string): ChartValue | { why: string } {
  const numbers = table.columns.flatMap((c, j) => (c.kind === "number" ? [{ c, j }] : []));
  const pick = (name: string | undefined, fallback: number): { c: Table["columns"][number]; j: number } | string => {
    if (!name) return numbers[fallback] ?? "It takes a table with two columns of numbers";
    const j = table.columns.findIndex((c) => c.name === name);
    if (j < 0) return `It has no column "${name}"`;
    return table.columns[j].kind === "number" ? { c: table.columns[j], j } : `"${name}" is no column of numbers`;
  };
  const px = pick(x, 0);
  if (typeof px === "string") return { why: px };
  const py = pick(y, numbers[0]?.j === px.j ? 1 : 0);
  if (typeof py === "string") return { why: py };
  const axis = (c: Table["columns"][number]): Axis =>
    c.kind === "number" ? { name: c.name, unit: c.unit, ...(c.by ? { by: c.by } : {}), ...(c.at ? { at: c.at } : {}) } : { name: c.name, unit: "none" };
  const entryColumn = table.columns.findIndex((c) => c.kind === "entry");
  const points: ChartPoint[] = [];
  let noX = 0;
  let noY = 0;
  table.rows.forEach((r, row) => {
    const vx = r[px.j];
    const vy = r[py.j];
    const okX = typeof vx === "number" && Number.isFinite(vx);
    const okY = typeof vy === "number" && Number.isFinite(vy);
    if (!okX) noX++;
    else if (!okY) noY++;
    if (!okX || !okY) return;
    const entry = entryColumn >= 0 ? r[entryColumn] : null;
    points.push({ x: vx as number, y: vy as number, row, ...(typeof entry === "string" ? { entry } : {}) });
  });
  const left = [...(noX ? [{ count: noX, why: `with no ${px.c.name}` }] : []), ...(noY ? [{ count: noY, why: `with no ${py.c.name}` }] : [])];
  return { kind: "points", x: axis(px.c), y: axis(py.c), points, left };
}

/**
 * An axis's ends and ticks: "nice" steps (1, 2 or 5 times a power of ten)
 * of about `count` from below its least value to above its greatest - a
 * range of one value widened by one step each way.
 */
export function ticksOf(lo: number, hi: number, count = 5): { from: number; to: number; ticks: number[] } {
  if (!(hi > lo)) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return ticksOf(lo - pad, hi + pad, count);
  }
  const raw = (hi - lo) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw)!;
  // (to twelve significant digits: a step's multiple, without the float's last bit)
  const from = Number((Math.floor(lo / step) * step).toPrecision(12));
  const to = Number((Math.ceil(hi / step) * step).toPrecision(12));
  const ticks: number[] = [];
  for (let v = from; v <= to + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { from, to, ticks };
}

/** What a chart's step says it made: how many points, and how many rows were left, where any. */
export function chartSaid(c: ChartValue): string {
  const left = c.left.reduce((n, l) => n + l.count, 0);
  return `${c.points.length.toLocaleString("en-US")} ${c.points.length === 1 ? "point" : "points"}${left ? ` \u00b7 ${left} ${left === 1 ? "row" : "rows"} left` : ""}`;
}

/** An axis as a workspace's file keeps it, read back; none where it does not read. */
export function axisIn(v: unknown): Axis | undefined {
  const a = v as { name?: unknown; unit?: unknown; by?: unknown; at?: unknown } | null;
  if (!a || typeof a.name !== "string" || !(a.unit === "none" || (typeof a.unit === "string" && isUnit(a.unit)))) return undefined;
  const by = fieldsIn<By>(a.by);
  const at = fieldsIn<At>(a.at, ["kelvin", "atm"]);
  return { name: a.name, unit: a.unit as Unit | "none", ...(by ? { by } : {}), ...(at ? { at } : {}) };
}

/** A chart as a workspace's file keeps it, read back: its axes, its points - finite values, a row each - and what was left. A point that does not read leaves the chart none: it is not drawn short of a point unsaid. */
export function chartIn(v: unknown): ChartValue | undefined {
  const c = v as { x?: unknown; y?: unknown; points?: unknown; left?: unknown } | null;
  const x = axisIn(c?.x);
  const y = axisIn(c?.y);
  if (!c || !x || !y || !Array.isArray(c.points)) return undefined;
  const points: ChartPoint[] = [];
  for (const p of c.points as Partial<ChartPoint>[]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isInteger(p.row) || p.row! < 0) return undefined;
    points.push({ x: p.x!, y: p.y!, row: p.row!, ...(typeof p.entry === "string" ? { entry: p.entry } : {}) });
  }
  const left = Array.isArray(c.left) ? (c.left as { count?: unknown; why?: unknown }[]).flatMap((l) => (Number.isInteger(l?.count) && (l.count as number) > 0 && typeof l.why === "string" ? [{ count: l.count as number, why: l.why }] : [])) : [];
  return { kind: "points", x, y, points, left };
}
