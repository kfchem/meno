/**
 * *Ensemble energy* on a set's entries (lib/nodes `ensemble`): each group's
 * free energy over its members, written on the entry that stands for it -
 * its lowest - in the step's first exit; the other members, and any group
 * that cannot be taken together, in its second, each with why written on
 * it (`set_aside`). One that is no result - failed, not converged, its
 * marks unread - is never counted, and says so.
 */
import type { Entry } from "../../../../lib/entry";
import { ensemble } from "../../../../lib/nodes/ensemble";
import { compoundLetter, entryOfSet, entryState, FINISHED, type SetEntry } from "./entries";
import type { Holds3D } from "./kinds";
import type { Outcome3D } from "./meno";
import { SET_ASIDE } from "./structureSteps";

type Values = Record<string, string | number | boolean>;

/** An entry as a step's line names it: its compound's letter and its number, "b #2". */
const named = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
/** An entry's id as the node is given it: its place after a mark no name carries (U+2063), so that only it is said by name. */
const MARK = "\u2063";
const MARKED = new RegExp(`${MARK}(\\d+)`, "g");

/** What an Ensemble energy step still needs of its options: the value to take, a name for it, and - in each value of a property - which. */
export function ensembleNeeds(v: Values): string | undefined {
  if (!String(v.property ?? "").trim()) return "Name the value to take the ensemble of";
  if (!String(v.as ?? "").trim()) return "Name what the ensemble's value is written as";
  if (v.within === "each value" && !String(v.groupBy ?? "").trim()) return "Name the property whose values are the groups";
  return undefined;
}

/** How an Ensemble energy step does its work, in a line: "G-ens = ensemble of G in each group". */
export function ensembleHow(v: Values): string {
  const needs = ensembleNeeds(v);
  if (needs) return needs;
  const within = v.within === "all" ? "of all" : v.within === "each value" ? `in each ${String(v.groupBy).trim()}` : "in each group";
  return `${String(v.as).trim()} = ensemble of ${String(v.property).trim()} ${within}`;
}

/** *Ensemble energy* on `entries`, with its options. */
export function ensembleSet(entries: readonly SetEntry[], holds: Holds3D, v: Values): Outcome3D {
  const needs = ensembleNeeds(v);
  if (needs) return { ok: false, said: needs };
  const groupBy = String(v.groupBy ?? "").trim();
  const unfinished = new Map<number, string>();
  entries.forEach((e, i) => {
    const state = entryState(e);
    if (state !== FINISHED) unfinished.set(i, `not counted: ${state}`);
  });
  let read: Entry[] = entries.flatMap((e, i) => (unfinished.has(i) ? [] : [entryOfSet(e, `${MARK}${i}`)]));
  // (in each value of a property: each entry's group its value, as text; one without it ungrouped, set aside saying so)
  if (v.within === "each value")
    read = read.map((e) => {
      const p = e.properties[groupBy];
      const { group: _, ...rest } = e.properties;
      return p == null || p.value == null ? { ...e, properties: rest } : { ...e, properties: { ...rest, group: { value: String(p.value), unit: "none", status: "computed" } } };
    });
  const as = String(v.as).trim();
  const out = ensemble(read, { property: String(v.property).trim(), within: v.within === "all" ? "all" : "each group", as });
  if (!out.ok) return out;
  const back = (id: string) => entries[Number(id.slice(MARK.length))];
  const inNames = (why: string) => why.replace(MARKED, (_, i) => named(entries[Number(i)])).replace("it has no group to be taken with", `it has no ${groupBy || "group"} to be taken with`);
  const asideWhy = (e: Entry) => (typeof e.status === "object" && e.status && "aside" in e.status ? String(e.status.aside) : "");
  const said = (value: string) => ({ value, unit: "none" as const, status: "computed" as const });
  const kept = out.exits.done.map((e) => {
    const was = back(e.id);
    return { ...was, properties: { ...was.properties, [as]: e.properties[as] } };
  });
  const aside = [
    ...out.exits.rest.map((e) => {
      const was = back(e.id);
      return { ...was, properties: { ...was.properties, [SET_ASIDE]: said(inNames(asideWhy(e))) } };
    }),
    ...[...unfinished].map(([i, why]) => ({ ...entries[i], properties: { ...entries[i].properties, [SET_ASIDE]: said(why) } })),
  ];
  // (the rest counted by why: the members of the ensembles as one, the others each by their own)
  const whys = new Map<string, number>();
  for (const e of aside) {
    const w = String(e.properties?.[SET_ASIDE]?.value ?? "");
    const key = w.startsWith("in the ensemble of ") ? "in an ensemble" : w;
    whys.set(key, (whys.get(key) ?? 0) + 1);
  }
  // (what came of it alone: the temperature is each value's own, said on its record, not the step's to say)
  const rest = aside.length ? ` · rest ${aside.length} (${[...whys].map(([w, n]) => `${n}: ${w}`).join("; ")})` : "";
  return { ok: true, holds, kept, aside, said: `${kept.length} ${kept.length === 1 ? "ensemble" : "ensembles"} from ${entries.length} ${entries.length === 1 ? "entry" : "entries"}${rest}` };
}
