/**
 * The steps Meno does on the values its entries carry (docs/WORKFLOWS-FOUNDATION.md,
 * *Meno's own nodes*): *Rank*. Each reads a set's entries as entry records
 * (`entryOfSet`), works on them by lib/nodes, and gives each back as it
 * came - one set aside with why written on it (`set_aside`) - and says, on
 * its line, what the value it went by is: its name, and how it was worked
 * out where that was said.
 */
import type { Entry, Property } from "../../../../lib/entry";
import { groupOf, numberIn, workedOutAs } from "../../../../lib/nodes/base";
import { rank, type RankOptions } from "../../../../lib/nodes/rank";
import { compoundLetter, entryOfSet, entryState, FINISHED, type SetEntry } from "./entries";
import type { Holds3D } from "./kinds";
import type { Outcome3D } from "./meno";
import { SET_ASIDE, withSaid } from "./structureSteps";

/** An entry as a step's line names it: its compound's letter and its number, "b #2". */
const named = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;

/**
 * An entry's id as the nodes are given it - its place in what came in,
 * after a mark no value or name carries (U+2063, an invisible separator) -
 * so that where a node's why names it in parentheses, it can be said as
 * the chemist knows it ("b #2"), and nothing else in parentheses is taken
 * for one: a method's "B3LYP-D3(0)".
 */
const MARK = "\u2063";
const idOf = (i: number) => `${MARK}${i}`;
const placeOf = (id: string) => Number(id.slice(MARK.length));
const MARKED = new RegExp(`\\(${MARK}(\\d+)\\)`, "g");

/** Whether two values are the same: equal, but for the last bits a conversion leaves. */
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * What a value is, in a few words, as its record says it was worked out:
 * the program, method and basis, the solvent, the temperature - each where
 * it was said, none guessed ("GFN2-xTB, xtb, in ALPB(chloroform), at
 * 298.15 K"). Nothing where none was.
 */
export function workedOutSaid(p: Property | undefined): string {
  if (!p) return "";
  const parts = new Map(workedOutAs(p));
  const stated = (k: string) => {
    const v = parts.get(k);
    return v && v !== "not stated" && v !== "unknown" ? v : "";
  };
  const level = [stated("method"), stated("basis")].filter(Boolean).join("/");
  return [
    level,
    stated("program"),
    stated("solvent") && (stated("solvent").startsWith("none") ? "in the gas phase" : `in ${stated("solvent")}`),
    stated("temperature") && `at ${stated("temperature")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** The option for which property a step's groups are: its entries' compounds, or a property each carries. */
export type GroupedBy = { within: "each group" | "each value" | "all"; groupBy: string };

/**
 * Entries regrouped by a property's value (*In each value of*): each
 * entry's `group` its value, as text; one without it left ungrouped, which
 * a step then sets aside saying so.
 */
function regrouped(es: readonly Entry[], name: string): Entry[] {
  return es.map((e) => {
    const p = e.properties[name];
    const { group: _, ...rest } = e.properties;
    return p == null || p.value == null ? { ...e, properties: rest } : { ...e, properties: { ...rest, group: { value: String(p.value), unit: "none", status: "computed" } } };
  });
}

/**
 * *Rank* (lib/nodes `rank`): entries ordered by a value they carry, lowest
 * or highest first, and the first N kept - in each group (a conformer set's
 * compounds), in each value of a property (*path*, *species*), or of all of
 * them. The rest each say their place. One that is not a finished result -
 * failed, not converged, its marks unread - is set aside saying so, never
 * ranked. Values ranked together were all worked out the same way; a group
 * whose values were not is set aside whole, saying how they differ.
 */
export function rankedSet(entries: readonly SetEntry[], holds: Holds3D, options: Omit<RankOptions, "within"> & GroupedBy): Outcome3D {
  const property = options.property.trim();
  if (!property) return { ok: false, said: "Name the property to rank by" };
  const groupBy = options.groupBy.trim();
  if (options.within === "each value" && !groupBy) return { ok: false, said: "Name the property whose values are the groups" };
  const unfinished = new Map<number, string>();
  entries.forEach((e, i) => {
    const state = entryState(e);
    if (state !== FINISHED) unfinished.set(i, `not ranked: ${state}`);
  });
  let read = entries.flatMap((e, i) => (unfinished.has(i) ? [] : [entryOfSet(e, idOf(i))]));
  if (options.within === "each value") read = regrouped(read, groupBy);
  const out = rank(read, { property, order: options.order, keep: options.keep, within: options.within === "all" ? "all" : "each group" });
  if (!out.ok) return out;
  const back = (id: string) => entries[placeOf(id)];
  // (its why in a chemist's names: an entry the node names, by its marked id, said as "b #2")
  const inNames = (why: string) => why.replace(MARKED, (_, i) => `(${named(entries[Number(i)])})`).replace("it has no group to be ranked within", `it has no ${groupBy || "group"} to be ranked within`);
  const asideWhy = (e: Entry) => (typeof e.status === "object" && e.status && "aside" in e.status ? String(e.status.aside) : "");
  // (one ranked out with the same value as the last one kept in its group - a degenerate conformer - said so: which of them is kept
  //  is the order they came in, as the core keeps ties; never chosen silently)
  const keyOf = (e: Entry) => (options.within === "all" ? "" : (groupOf(e) ?? ""));
  const lastKept = new Map<string, Entry>();
  for (const e of out.exits.kept) lastKept.set(keyOf(e), e);
  const tieOf = (e: Entry): SetEntry | null => {
    const k = lastKept.get(keyOf(e));
    const at = k?.properties[property];
    if (!k || !at || at.unit === undefined) return null;
    const v = numberIn(k, property, at.unit);
    const w = numberIn(e, property, at.unit);
    return "value" in v && "value" in w && same(v.value, w.value) ? back(k.id) : null;
  };
  let ties = 0;
  const aside = [
    ...out.exits.rest.map((e) => {
      const why = inNames(asideWhy(e));
      const tie = /^ranked \d+ of \d+/.test(why) ? tieOf(e) : null;
      if (tie) ties++;
      return withSaid(back(e.id), SET_ASIDE, tie ? `${why}; tied with ${named(tie)}, which was kept as it came first` : why);
    }),
    ...[...unfinished].map(([i, why]) => withSaid(entries[i], SET_ASIDE, why)),
  ];
  const what = workedOutSaid(out.exits.kept[0]?.properties[property]);
  const within = options.within === "all" ? "of all" : options.within === "each value" ? `in each ${groupBy}` : "in each group";
  const head = `the ${options.order === "lowest first" ? "lowest" : "highest"} ${options.keep} by ${property}${what ? ` (${what})` : ""} ${within}`;
  // (the rest counted by why: those ranked below the first N as one - each its own place, written on it - the others each by their own)
  const whys = new Map<string, number>();
  for (const e of aside) {
    const why = String(e.properties?.[SET_ASIDE]?.value ?? "");
    const key = /^ranked \d+ of \d+/.test(why) ? `below the first ${options.keep}` : why;
    whys.set(key, (whys.get(key) ?? 0) + 1);
  }
  const rest = aside.length ? ` · rest ${aside.length} (${[...whys].map(([why, n]) => `${n}: ${why}`).join("; ")})` : "";
  const tied = ties ? ` · ${ties} tied with one kept` : "";
  return { ok: true, holds, kept: out.exits.kept.map((e) => back(e.id)), aside, said: `${head}: ${out.exits.kept.length} of ${entries.length} kept${rest}${tied}` };
}
