/**
 * *Rank* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): entries
 * ordered by a number they carry, lowest or highest first, and the first N
 * kept - in each group, or of them all; the rest set aside, each saying its
 * place. Ties keep the order they came in.
 *
 * Values are ranked together only where they can be compared: numbers of one
 * dimension (converted to the first one's unit), each worked out the same way
 * (`workedOutAs`: conditions, program, method, basis, treatment). A group
 * whose values were worked out differently is set aside whole, saying how
 * they differ; an entry with no value, saying so.
 */
import type { Entry } from "../entry";
import type { Unit } from "../units";
import { entries as count, inGroups, isPositiveInteger, numberIn, setAside, tally, unreadable, workedOutUnlike, type NodeOutcome } from "./base";

export type RankOptions = {
  property: string;
  order: "lowest first" | "highest first";
  /** How many are kept: the first N. */
  keep: number;
  /** In each group (the `group` property), or of all of them together. */
  within: "each group" | "all";
};

/** *Rank* on `entries`: *kept*, the first N of each group (or of all) in their ranked order, groups in the order they came; *rest*, the others in the order they came, each saying why. */
export function rank(entries: readonly Entry[], options: RankOptions): NodeOutcome<"kept" | "rest"> {
  if (!options.property) return { ok: false, said: "No property to rank by" };
  if (!isPositiveInteger(options.keep)) return { ok: false, said: "How many to keep must be a whole number, 1 or more" };
  const why = new Map<Entry, string>();
  const kept: Entry[] = [];
  const { groups, ungrouped } = options.within === "each group" ? inGroups(entries) : { groups: [entries.slice()], ungrouped: [] };
  for (const e of ungrouped) why.set(e, "it has no group to be ranked within");
  for (const g of groups) {
    // (the unit the values are ranked in: the first readable one's)
    const first = g.find((e) => !unreadable(e.properties[options.property], options.property) && typeof e.properties[options.property].value === "number");
    const unit: Unit | "none" | undefined = first?.properties[options.property].unit;
    const ranked: { e: Entry; v: number; i: number }[] = [];
    g.forEach((e, i) => {
      const v = unit ? numberIn(e, options.property, unit) : numberIn(e, options.property, "none");
      if ("why" in v) why.set(e, v.why);
      else ranked.push({ e, v: v.value, i });
    });
    const unlike = workedOutUnlike(ranked.map((r) => r.e), options.property);
    if (unlike) {
      const whose = options.within === "each group" ? "its group's" : "the";
      for (const r of ranked) why.set(r.e, `${whose} ${options.property} values ${unlike}, and are not ranked together`);
      continue;
    }
    const sign = options.order === "lowest first" ? 1 : -1;
    ranked.sort((a, b) => sign * (a.v - b.v) || a.i - b.i);
    ranked.forEach((r, k) => {
      if (k < options.keep) kept.push(r.e);
      else why.set(r.e, `ranked ${k + 1} of ${ranked.length}${options.within === "each group" ? " in its group" : ""} by ${options.property}, ${options.order}; the first ${options.keep} kept`);
    });
  }
  const rest = entries.filter((e) => why.has(e)).map((e) => setAside(e, why.get(e)!));
  const said = `${kept.length} of ${count(entries.length)} kept${rest.length ? ` · rest ${rest.length} (${tally(rest)})` : ""}`;
  return { ok: true, exits: { kept, rest }, said };
}
