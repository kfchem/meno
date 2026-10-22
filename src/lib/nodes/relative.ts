/**
 * *Relative* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): a new
 * property on each entry - a number it carries less the lowest in its group,
 * or less a reference typed with its unit - in a unit of the same dimension.
 *
 * Only values worked out the same way are taken from one another
 * (`workedOutAs`: conditions, program, method, basis, treatment): a group
 * whose values differ there goes out of *rest* whole, saying how; an entry
 * with no value, saying so. The new property keeps the conditions and what
 * worked out the values it was made from, at the entry's own geometry.
 */
import type { Entry, Property } from "../entry";
import { convert, sameDimension, UNITS, type Unit } from "../units";
import { entries as count, inGroups, numberIn, setAside, tally, unitLabel, workedOutUnlike, type NodeOutcome } from "./base";

export type RelativeOptions = {
  property: string;
  /** The new property's name. */
  name: string;
  /** Less the lowest in its group, or less a number given with its unit. */
  to: "lowest in group" | { value: number; unit: Unit };
  /** The new property's unit. */
  unit: Unit;
};

/** *Relative* on `entries`: *done*, each with the new property, in the order they came; *rest*, the others, each saying why. */
export function relative(entries: readonly Entry[], options: RelativeOptions): NodeOutcome<"done" | "rest"> {
  const { property, name, to, unit } = options;
  if (!property) return { ok: false, said: "No property to take from" };
  if (!name) return { ok: false, said: "The new property needs a name" };
  if (name === property) return { ok: false, said: `The new property cannot be ${property} itself` };
  if (to !== "lowest in group" && (!Number.isFinite(to.value) || !sameDimension(to.unit, unit)))
    return { ok: false, said: `The reference must be a number in ${UNITS[unit].dimension}, as ${unitLabel(unit)} is` };
  const taken = entries.filter((e) => e.properties[name]);
  if (taken.length) return { ok: false, said: `${count(taken.length)} already ${taken.length === 1 ? "has" : "have"} ${name}: give the new property another name` };
  const made = new Map<Entry, Property>();
  const why = new Map<Entry, string>();
  const { groups, ungrouped } = to === "lowest in group" ? inGroups(entries) : { groups: [entries.slice()], ungrouped: [] };
  for (const e of ungrouped) why.set(e, "it has no group to take the lowest of");
  for (const g of groups) {
    const values: { e: Entry; v: number }[] = [];
    for (const e of g) {
      const v = numberIn(e, property, unit);
      if ("why" in v) why.set(e, v.why);
      else values.push({ e, v: v.value });
    }
    const unlike = workedOutUnlike(values.map((x) => x.e), property);
    if (unlike) {
      for (const x of values) why.set(x.e, `${to === "lowest in group" ? "its group's" : "the"} ${property} values ${unlike}, and are not taken from one another`);
      continue;
    }
    if (!values.length) continue;
    const base = to === "lowest in group" ? Math.min(...values.map((x) => x.v)) : convert(to.value, to.unit, unit);
    for (const { e, v } of values) {
      const source = e.properties[property];
      made.set(e, { value: v - base, unit, ...(source.at ? { at: { ...source.at } } : {}), ...(source.by ? { by: { ...source.by } } : {}), status: "computed" });
    }
  }
  const done = entries.filter((e) => made.has(e)).map((e) => ({ ...e, properties: { ...e.properties, [name]: made.get(e)! } }));
  const rest = entries.filter((e) => why.has(e)).map((e) => setAside(e, why.get(e)!));
  const against = to === "lowest in group" ? "the lowest in each group" : `${to.value} ${unitLabel(to.unit)}`;
  const said = `${name}: ${property} less ${against}, in ${unitLabel(unit)} · ${done.length} of ${count(entries.length)}${rest.length ? ` · rest ${rest.length} (${tally(rest)})` : ""}`;
  return { ok: true, exits: { done, rest }, said };
}
