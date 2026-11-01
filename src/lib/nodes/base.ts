/**
 * What Meno's own nodes for sets and numbers share (docs/WORKFLOWS-FOUNDATION.md,
 * *Meno's own nodes*, PR 7): how a node says what it did - each exit's
 * entries, every entry it did not pass on given the reason on its status,
 * and the counts said, adding up to what came in - and how a property is
 * read: a number in a unit of its dimension, or the reason it cannot be.
 *
 * Nothing a node keeps, drops, merges or filters is silent: an entry that
 * does not go on goes out of another exit, counted, saying why.
 */
import type { Entry, Property, PropertyPart } from "../entry";
import { convert, sameDimension, UNITS, type Unit } from "../units";

/**
 * What a node did: the entries out of each of its exits, in the order the
 * node gives them; and what it says of it, a line, with its counts. Or, where
 * it could not run at all (an option out of range, nothing come in), why.
 */
export type NodeOutcome<X extends string = string> =
  | { ok: true; exits: Record<X, Entry[]>; said: string }
  | { ok: false; said: string };

/** An entry set aside, saying why (its status): what goes out of a *rest* exit. */
export const setAside = (e: Entry, why: string): Entry => ({ ...e, status: { aside: why } });

/** An entry that could not be done, saying why (its status): what goes out of a *failed* exit. */
export const failedWith = (e: Entry, why: string): Entry => ({ ...e, status: { failed: why } });

/** "1 entry", "3 entries". */
export const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

/** "1 group", "3 groups". */
export const groups = (n: number) => `${n} ${n === 1 ? "group" : "groups"}`;

/** A property of an entry as a number in `unit`, or why it cannot be read as one: it is not there, it was not worked out, it is no number - or none finite - or its unit is of another dimension. */
export function numberIn(e: Entry, name: string, unit: Unit | "none"): { value: number } | { why: string } {
  const p = e.properties[name];
  const why = unreadable(p, name);
  if (why) return { why };
  if (typeof p!.value !== "number") return { why: `its ${name} is not a number` };
  // (not a number to compare or add: NaN, or an infinity, as a plugin may write one)
  if (!Number.isFinite(p!.value)) return { why: `its ${name} is not a finite number` };
  if (p!.unit === "none" || unit === "none") {
    if (p!.unit !== unit) return { why: `its ${name} is in ${unitLabel(p!.unit)}, not ${unitLabel(unit)}` };
    return { value: p!.value };
  }
  if (!sameDimension(p!.unit, unit)) return { why: `its ${name} is in ${unitLabel(p!.unit)}, which does not convert to ${unitLabel(unit)}` };
  return { value: convert(p!.value, p!.unit, unit) };
}

/** Why a property cannot be read at all - not there, or not worked out - else nothing. */
export function unreadable(p: Property | undefined, name: string): string | null {
  if (!p) return `it has no ${name}`;
  if (p.status !== "computed") return "failed" in p.status ? `its ${name} failed: ${p.status.failed}` : `its ${name} does not apply: ${p.status.notApplicable}`;
  return null;
}

/** A unit as a chemist reads it; "no unit" for a count or a share. */
export const unitLabel = (u: Unit | "none") => (u === "none" ? "no unit" : UNITS[u].label);

/** The group an entry is in - its `group` property, as a text - or nothing where it has none. */
export function groupOf(e: Entry): string | null {
  const p = e.properties[PROPERTY.group];
  if (!p || p.status !== "computed") return null;
  return typeof p.value === "string" || typeof p.value === "number" ? String(p.value) : null;
}

/**
 * Entries in their groups (`groupOf`), each group in the order its first
 * entry came, its entries in the order they came; with those that have no
 * group apart.
 */
export function inGroups(es: readonly Entry[]): { groups: Entry[][]; ungrouped: Entry[] } {
  const by = new Map<string, Entry[]>();
  const ungrouped: Entry[] = [];
  for (const e of es) {
    const g = groupOf(e);
    if (g == null) ungrouped.push(e);
    else {
      const list = by.get(g);
      if (list) list.push(e);
      else by.set(g, [e]);
    }
  }
  return { groups: [...by.values()], ungrouped };
}

/** Whether a count typed on a node is one: a whole number, one or more. */
export const isPositiveInteger = (n: number) => Number.isInteger(n) && n > 0;

/**
 * The names of the properties the nodes read and write - one name for each
 * quantity, the same as a reading on hover and as an entry's property (the
 * plugins' `thermo.*` readings):
 * - `energy`: the electronic energy at the entry's geometry;
 * - `thermo.free-energy`: the total free energy G, at the temperature (and,
 *   where the program states it, the pressure) the program used;
 * - `degeneracy`: how many forms of it a conformer search found alike;
 * - `group`: the group an entry is in, which the nodes that work in each
 *   group read;
 * - `population`: its share within its group.
 */
export const PROPERTY = {
  energy: "energy",
  freeEnergy: "thermo.free-energy",
  degeneracy: "degeneracy",
  /** How many imaginary frequencies its calculation judged it has: one that has any is no minimum. */
  imaginary: "imaginary",
  group: "group",
  population: "population",
} as const;

/** The reason on an entry's status: why it was set aside or failed; nothing for one done. */
export function reasonOf(e: Entry): string | null {
  if (e.status === "done") return null;
  return "aside" in e.status ? e.status.aside : e.status.failed;
}

/** Entries set aside or failed, counted by their reasons - most first, then in the order first met: "2: its energy is above 3 kcal/mol; 1: it has no energy". */
export function tally(es: readonly Entry[]): string {
  const counts = new Map<string, number>();
  for (const e of es) {
    const why = reasonOf(e) ?? "done";
    counts.set(why, (counts.get(why) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([why, n], i) => ({ why, n, i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ why, n }) => `${n}: ${why}`)
    .join("; ");
}

/**
 * How a property was worked out, part by part, as the chemist reads each:
 * the conditions (temperature, pressure, solvent) and what worked it out
 * (program, method, basis, thermal treatment). Two values are compared, or
 * put in one sum, only where these are all the same.
 */
export function workedOutAs(p: Property): [string, string][] {
  const by = p.by ?? {};
  return [
    ["temperature", p.at?.kelvin != null ? `${p.at.kelvin} K` : "not stated"],
    ["pressure", p.at?.atm != null ? `${p.at.atm} atm` : "not stated"],
    // (the solvent as the program named it with its model, and its reference state where it printed one - "ALPB(acetone)", or "ALPB(water), reference state gsolv [1 M gas/solution]" - compared whole; "none", the output says no solvation model, the gas phase; absent, not stated - which never matches a stated one)
    ["solvent", p.at?.solvent == null ? "not stated" : p.at.solvent === "none" ? "none (gas phase)" : p.at.solvent],
    ["program", by.program ?? "not stated"],
    ["method", by.method ?? "not stated"],
    ["basis", by.basis ?? "not stated"],
    ["thermal treatment", by.treatment ?? "unknown"],
  ];
}

/**
 * Whether two values of one part of how a value was worked out
 * (`workedOutAs`) are the same. A method and a basis are the same whatever
 * their case: inputs name them in either ("B3LYP", "b3lyp"), and a program
 * prints each as its input named it. Each is shown as read. Nothing else is
 * taken as the same: "6-31G*" and "6-31G(d)" are two names.
 */
export function alikeIn(part: string, a: string, b: string): boolean {
  return part === "method" || part === "basis" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** A sum's part as a value of its own, so that how it was worked out reads as a value's does (`workedOutAs`). */
export const partValue = (p: PropertyPart): Property => ({ value: p.value, unit: p.unit, ...(p.at ? { at: p.at } : {}), ...(p.by ? { by: p.by } : {}), status: "computed" });

/**
 * Where two values were not worked out alike (`workedOutAs`, `alikeIn`), the
 * first part they differ in, with each one's - else nothing. Two sums are
 * alike in treatment where they are of the same parts, each worked out alike:
 * their treatments, which say their parts, then differ in case at most.
 */
export function workedOutDiffer(a: Property, b: Property): [part: string, a: string, b: string] | null {
  const x = workedOutAs(a);
  const y = workedOutAs(b);
  const sums = (u: string, v: string) =>
    !!a.parts && !!b.parts && a.parts.length === b.parts.length && u.toLowerCase() === v.toLowerCase() &&
    a.parts.every((q, i) => q.property === b.parts![i].property && !workedOutDiffer(partValue(q), partValue(b.parts![i])));
  const k = x.findIndex(([part, u], i) => !alikeIn(part, u, y[i][1]) && !(part === "thermal treatment" && sums(u, y[i][1])));
  return k < 0 ? null : [x[k][0], x[k][1], y[k][1]];
}

/** Where entries' `name` were not all worked out the same way (`workedOutDiffer`), how two differ - "differ in method: M (a) and N (b)" - else nothing. Entries without it are passed over. */
export function workedOutUnlike(es: readonly Entry[], name: string): string | null {
  const having = es.filter((e) => e.properties[name]);
  if (having.length < 2) return null;
  for (const e of having.slice(1)) {
    const d = workedOutDiffer(having[0].properties[name], e.properties[name]);
    if (d) return `differ in ${d[0]}: ${d[1]} (${having[0].id}) and ${d[2]} (${e.id})`;
  }
  return null;
}

/** A group's letter, by its place among a set's: a to z, then aa, ab... - as a compound's in a conformer set is written. */
export function groupLetter(i: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz";
  return i < 26 ? a[i] : groupLetter(Math.floor(i / 26) - 1) + a[i % 26];
}
