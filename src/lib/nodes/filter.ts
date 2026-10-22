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

export type FilterOptions = { conditions: Condition[]; match: "all" | "any" };

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

/** Whether an entry meets a condition, or why it does not. */
function meets(e: Entry, c: Condition): true | string {
  if (typeof c.value === "number") {
    const v = numberIn(e, c.property, c.unit ?? "none");
    if ("why" in v) return v.why;
    return compares(v.value, c.compare, c.value) || `not ${conditionText(c)} (${trim(v.value)}${c.unit && c.unit !== "none" ? ` ${unitLabel(c.unit)}` : ""})`;
  }
  const p = e.properties[c.property];
  const why = unreadable(p, c.property);
  if (why) return why;
  if (typeof p!.value !== typeof c.value) return `its ${c.property} is not ${typeof c.value === "string" ? "a text" : "true or false"}`;
  return compares(p!.value as string | boolean, c.compare, c.value) || `not ${conditionText(c)}`;
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
  for (const e of entries) {
    const results = options.conditions.map((c) => meets(e, c));
    const unmet = results.filter((r): r is string => r !== true);
    const ok = options.match === "all" ? unmet.length === 0 : unmet.length < results.length;
    if (ok) kept.push(e);
    else rest.push(setAside(e, unmet.join("; ")));
  }
  const said = `${kept.length} of ${count(entries.length)} kept${rest.length ? ` · rest ${rest.length} (${tally(rest)})` : ""}`;
  return { ok: true, exits: { kept, rest }, said };
}

/** The comparisons as they may be typed, each with the one it is: ≤ as <=, ≥ as >=, ≠ as != - the longer first, so that <= is not < and =. */
const TYPED: [string, Comparison][] = [
  ["<=", "≤"],
  [">=", "≥"],
  ["!=", "≠"],
  ["==", "="],
  ["≤", "≤"],
  ["≥", "≥"],
  ["≠", "≠"],
  ["<", "<"],
  [">", ">"],
  ["=", "="],
];

/** A unit as typed: by Meno's name for it ("cm-1") or as it is written ("cm⁻¹"); none where it is neither. */
function unitTyped(u: string): Unit | undefined {
  if (isUnit(u)) return u;
  return (Object.keys(UNITS) as Unit[]).find((k) => UNITS[k].label === u);
}

/**
 * Conditions as a chemist types them, one to a line or each after a
 * semicolon: a property, a comparison (< ≤ > ≥ = ≠, or <= >= !=), and a
 * value - a number, with its unit where it has one ("energy ≤ -76.4 Eh",
 * "nll < 30"); true or false; else a text, in quotes or not. Why not, of the
 * first that does not read: no comparison, no property, a unit Meno does not
 * know, nothing to compare with.
 */
export function conditionsIn(text: string): { conditions: Condition[] } | { why: string } {
  const conditions: Condition[] = [];
  for (const raw of text.split(/[;\n]/)) {
    const line = raw.trim();
    if (!line) continue;
    // (the first comparison in it: what is before it the property, after it the value)
    let at = -1;
    let typed = "";
    let compare: Comparison = "=";
    for (const [t, c] of TYPED) {
      const k = line.indexOf(t);
      if (k >= 0 && (at < 0 || k < at || (k === at && t.length > typed.length))) [at, typed, compare] = [k, t, c];
    }
    if (at < 0) return { why: `"${line}" compares nothing: it takes a property, then < ≤ > ≥ = or ≠, then a value` };
    const property = line.slice(0, at).trim();
    const value = line.slice(at + typed.length).trim();
    if (!property) return { why: `"${line}" names no property` };
    if (!value) return { why: `"${line}" has nothing to compare with` };
    const number = /^([-+−]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(value);
    if (number) {
      const unitText = number[2].trim();
      const unit = unitText ? unitTyped(unitText) : "none";
      if (!unit) return { why: `"${line}": ${unitText} is no unit Meno knows` };
      conditions.push({ property, compare, value: Number(number[1].replace("−", "-")), unit });
    } else if (value === "true" || value === "false") conditions.push({ property, compare, value: value === "true" });
    else conditions.push({ property, compare, value: value.replace(/^"(.*)"$/, "$1") });
  }
  return { conditions };
}
