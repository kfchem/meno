/**
 * *Filter* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): entries kept
 * by conditions on their properties - each a property, a comparison and a
 * value with its unit; all of them met, or any - the rest set aside, each
 * saying which conditions it did not meet, or which property it had no
 * value for. An entry with no value for a condition does not meet it.
 *
 * Numbers are compared in the condition's unit, converted only within a
 * dimension; a number of another dimension, or of none where the condition
 * has one, meets nothing and says so. Two numbers are equal within a part in
 * 10¹² of the larger, so that a value converted between units (1 kcal/mol
 * as 4.184 kJ/mol) is the value typed.
 */
import type { Entry } from "../entry";
import { isUnit, UNITS, type Unit } from "../units";
import { entries as count, numberIn, setAside, tally, unitLabel, unreadable, type NodeOutcome } from "./base";

/** A comparison: less than, at most, more than, at least, equal to, other than. Text and true/false compare by = and ≠ alone. */
export type Comparison = "<" | "≤" | ">" | "≥" | "=" | "≠";

/** A condition: a property, a comparison, and a value - a number with its unit, a text, or true or false. */
export type Condition = { property: string; compare: Comparison; value: number | string | boolean; unit?: Unit | "none" };

/**
 * What Filter asks, and whether all or any; and, where given, why an
 * entry's properties cannot be read at all (a structure drawn edited since
 * they were given): such an entry goes to *rest* saying so, its conditions
 * not asked.
 */
export type FilterOptions = { conditions: Condition[]; match: "all" | "any"; unread?: (e: Entry) => string | null };

/** Two numbers equal within a part in 10¹² of the larger. */
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);

/** Whether `a` compares to `b` as asked. */
function compares(a: number | string | boolean, c: Comparison, b: number | string | boolean): boolean {
  if (typeof a === "number" && typeof b === "number") {
    const eq = near(a, b);
    switch (c) {
      case "<":
        return a < b && !eq;
      case "≤":
        return a < b || eq;
      case ">":
        return a > b && !eq;
      case "≥":
        return a > b || eq;
      case "=":
        return eq;
      case "≠":
        return !eq;
    }
  }
  return c === "=" ? a === b : c === "≠" ? a !== b : false;
}

/** A condition written as a chemist reads it: "relative energy ≤ 3 kcal/mol". */
export function conditionText(c: Condition): string {
  const unit = typeof c.value === "number" && c.unit && c.unit !== "none" ? ` ${unitLabel(c.unit)}` : "";
  return `${c.property} ${c.compare} ${c.value}${unit}`;
}

/** Why a condition cannot be asked at all - a text compared as a number - else nothing. */
function badCondition(c: Condition): string | null {
  if (!c.property) return "A condition names no property";
  if (typeof c.value !== "number" && c.compare !== "=" && c.compare !== "≠") return `${conditionText(c)}: a text or true/false is compared by = or ≠ alone`;
  if (typeof c.value === "number" && !Number.isFinite(c.value)) return `${conditionText(c)}: the value is no number`;
  return null;
}

/** Whether an entry meets a condition; or why it does not - its value compared and found not to (`asked`), or none it could be compared by: not there, not worked out, not finite, of another unit or kind. */
type Met = true | { why: string; asked: boolean };
function meets(e: Entry, c: Condition): Met {
  if (typeof c.value === "number") {
    const v = numberIn(e, c.property, c.unit ?? "none");
    if ("why" in v) return { why: v.why, asked: false };
    return compares(v.value, c.compare, c.value) || { why: `not ${conditionText(c)} (${trim(v.value)}${c.unit && c.unit !== "none" ? ` ${unitLabel(c.unit)}` : ""})`, asked: true };
  }
  const p = e.properties[c.property];
  const why = unreadable(p, c.property);
  if (why) return { why, asked: false };
  if (typeof p!.value !== typeof c.value) return { why: `its ${c.property} is not ${typeof c.value === "string" ? "a text" : "true or false"}`, asked: false };
  // (said with what it is, as a number's is: "not state = finished (not converged)")
  return compares(p!.value as string | boolean, c.compare, c.value) || { why: `not ${conditionText(c)} (${String(p!.value)})`, asked: true };
}

/** Reasons counted - most first, then in the order first met: "2: it has no nll; 1: ...". */
function counted(whys: readonly string[]): string {
  const n = new Map<string, number>();
  for (const w of whys) n.set(w, (n.get(w) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([w, k]) => `${k}: ${w}`).join("; ");
}

/** A number as it is said back: to as many places as it needs, at most 6 after the point. */
const trim = (v: number) => String(Number(v.toFixed(6)));

/** *Filter* on `entries`: *kept*, those that meet the conditions, in the order they came; *rest*, the others, each saying why. */
export function filter(entries: readonly Entry[], options: FilterOptions): NodeOutcome<"kept" | "rest"> {
  if (!options.conditions.length) return { ok: false, said: "No condition to filter by" };
  for (const c of options.conditions) {
    const bad = badCondition(c);
    if (bad) return { ok: false, said: bad };
  }
  const kept: Entry[] = [];
  const rest: Entry[] = [];
  // (kept where any is met, another not asked of it - no value, of another unit or kind: said, never passed over)
  const notAsked: string[] = [];
  let keptNotAsked = 0;
  for (const e of entries) {
    const no = options.unread?.(e);
    if (no) {
      rest.push(setAside(e, no));
      continue;
    }
    const results = options.conditions.map((c) => meets(e, c));
    const unmet = results.filter((r): r is Exclude<Met, true> => r !== true);
    const ok = options.match === "all" ? unmet.length === 0 : unmet.length < results.length;
    if (ok) {
      kept.push(e);
      const not = unmet.filter((r) => !r.asked);
      if (not.length) keptNotAsked++;
      notAsked.push(...not.map((r) => r.why));
    } else rest.push(setAside(e, unmet.map((r) => r.why).join("; ")));
  }
  const said =
    `${kept.length} of ${count(entries.length)} kept` +
    (keptNotAsked ? ` · ${keptNotAsked} of them with a condition not asked (${counted(notAsked)})` : "") +
    (rest.length ? ` · rest ${rest.length} (${tally(rest)})` : "");
  return { ok: true, exits: { kept, rest }, said };
}

/** The comparisons as they may be typed, each with the one it is: ≤ as <=, ≥ as >=, ≠ as !=. */
const TYPED: Readonly<Record<string, Comparison>> = { "<": "<", "≤": "≤", "<=": "≤", ">": ">", "≥": "≥", ">=": "≥", "=": "=", "==": "=", "≠": "≠", "!=": "≠" };
/** What a comparison is typed with: a run of these, read whole - so that =< or ≥≥ is no comparison, not one and a value. */
const COMPARING = /[<>=!≤≥≠]+/;

/** Text split at each semicolon or line not inside double quotes; null where a quote is opened and not closed. */
function linesOf(text: string): string[] | null {
  const out: string[] = [];
  let line = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === ";" || ch === "\n")) {
      out.push(line);
      line = "";
    } else line += ch;
  }
  if (quoted) return null;
  out.push(line);
  return out;
}

/** A unit as typed: by Meno's name for it ("cm-1") or as it is written ("cm⁻¹"); none where it is neither. */
function unitTyped(u: string): Unit | undefined {
  if (isUnit(u)) return u;
  return (Object.keys(UNITS) as Unit[]).find((k) => UNITS[k].label === u);
}

/**
 * Conditions as a chemist types them, one to a line or each after a
 * semicolon (one inside double quotes is a text's): a property, a
 * comparison (< ≤ > ≥ = ≠, or <= >= !=), and a value - a number, with its
 * unit where it has one ("energy ≤ -76.4 Eh", "nll < 30"); true or false;
 * else a text, in quotes or not. Why not, of the
 * first that does not read: no comparison, or one Meno does not know (=<),
 * no property, a unit Meno does not know, nothing to compare with, a quote
 * not closed.
 */
export function conditionsIn(text: string): { conditions: Condition[] } | { why: string } {
  const lines = linesOf(text);
  if (!lines) return { why: "A quote is opened and not closed" };
  const conditions: Condition[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // (the first comparison in it, read whole: what is before it the property, after it the value)
    const found = COMPARING.exec(line);
    if (!found) return { why: `"${line}" compares nothing: it takes a property, then < ≤ > ≥ = or ≠, then a value` };
    const compare = TYPED[found[0]];
    if (!compare) return { why: `"${line}": ${found[0]} is no comparison - it takes < ≤ > ≥ = or ≠ (or <= >= !=)` };
    const property = line.slice(0, found.index).trim();
    const value = line.slice(found.index + found[0].length).trim();
    if (!property) return { why: `"${line}" names no property` };
    if (!value) return { why: `"${line}" has nothing to compare with` };
    const number = /^([-+−]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(value);
    if (number) {
      const unitText = number[2].trim();
      const unit = unitText ? unitTyped(unitText) : "none";
      if (!unit) return { why: `"${line}": ${unitText} is no unit Meno knows` };
      conditions.push({ property, compare, value: Number(number[1].replace("−", "-")), unit });
    } else if (value === "true" || value === "false") conditions.push({ property, compare, value: value === "true" });
    else conditions.push({ property, compare, value: /^".*"$/s.test(value) ? value.slice(1, -1) : value });
  }
  return { conditions };
}
