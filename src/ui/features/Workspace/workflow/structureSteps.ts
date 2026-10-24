/**
 * Meno's steps on structures, as a workflow's steps run them
 * (docs/STRUCTURE-STEPS.md): *Tag*, *Species*, *Combine* and *Measure*, each
 * a set's entries read as Meno's entry record (`entryOfSet`), the step's own
 * function done on them (lib/nodes, lib/steps), and each entry given back as
 * a step's entry (`setEntryOfEntry`) - all it held kept where it is that
 * entry still, what was worked out at another structure or state never
 * carried. Each says what it did; nothing it does not pass on goes unsaid.
 */
import type { Entry } from "../../../../lib/entry";
import { tag } from "../../../../lib/nodes/tag";
import { combined } from "../../../../lib/steps/combine";
import { measured, measurementName, measurementsTyped } from "../../../../lib/steps/measure";
import { speciesNeeds, speciesTyped, withSpecies } from "../../../../lib/steps/species";
import { entryOfSet, setEntryOfEntry, type SetEntry } from "./entries";
import type { Holds3D } from "./kinds";
import type { Outcome3D } from "./meno";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listed = (xs: readonly string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** What a step's entry held that it no longer does, in words, in this order: what was worked out at its old structure or state (`setEntryOfEntry`). */
const DROPPABLE: readonly [keyof SetEntry, string][] = [
  ["energy", "energy"],
  ["calc", "calculation"],
  ["imaginary", "imaginary frequencies"],
  ["degeneracy", "degeneracy"],
  ["mirror", "mirror image"],
  ["stereo", "stereo"],
];
const droppedFrom = (was: SetEntry, now: SetEntry) => DROPPABLE.filter(([k]) => was[k] != null && now[k] == null).map(([, word]) => word);

/** Each entry given back as a step's entry, as it was placed (its compound and number) and from what it was. */
function backEach(entries: readonly SetEntry[], made: readonly Entry[]): SetEntry[] {
  return made.map((e) => {
    const was = entries[Number(e.id)];
    return setEntryOfEntry(e, { compound: was.compound, number: was.number }, was)!;
  });
}

/** *Tag* (lib/nodes `tag`): each entry given an ID under the name given. */
export function taggedSet(entries: readonly SetEntry[], holds: Holds3D, name: string): Outcome3D {
  const out = tag(
    entries.map((e, i) => entryOfSet(e, String(i))),
    { name },
  );
  if (!out.ok) return out;
  return { ok: true, holds, kept: backEach(entries, out.exits.done), aside: [], said: out.said };
}

/** *Species* (lib/steps `withSpecies`): each entry with its charge and multiplicity set; one whose electrons cannot have them, or a skeleton, out of *Failed* with the reason. */
export function speciesSet(entries: readonly SetEntry[], holds: Holds3D, charge: string, multiplicity: string): Outcome3D {
  // (what it still needs, as its card says it: one that does not read, or neither given)
  const needs = speciesNeeds(charge, multiplicity);
  const typed = speciesTyped(charge, multiplicity);
  if (needs != null || "why" in typed) return { ok: false, said: needs ?? "" };
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  // (what each entry set no longer holds, worked out for the species it had: said, never dropped unsaid)
  const dropped: string[][] = [];
  entries.forEach((was, i) => {
    // (judged on its charge and spin alone: one that came in failed - wired from a step's Failed exit to be tried again - is given its species, not its old failure as this step's)
    const e = withSpecies({ ...entryOfSet(was, String(i)), status: "done" }, typed.given);
    if (typeof e.status === "object" && "failed" in e.status) {
      // (its energy not carried out of Failed with it: it stands for no result)
      const { energy: _, ...rest } = was;
      aside.push({ ...rest, failed: { kind: "refused", why: e.status.failed } });
      return;
    }
    const made = setEntryOfEntry(e, { compound: was.compound, number: was.number }, was)!;
    kept.push(made);
    dropped.push(droppedFrom(was, made));
  });
  return { ok: true, holds, kept, aside, said: speciesSaid(kept.length, dropped, aside.length) };
}

/** A Species step's line: how many entries it set, what those it set no longer hold - and why - and how many failed. */
function speciesSaid(set: number, dropped: readonly string[][], failed: number): string {
  const said = [`${plural(set, "entry", "entries")} set`];
  const some = dropped.filter((d) => d.length);
  if (some.length) {
    const words = DROPPABLE.map(([, w]) => w).filter((w) => some.some((d) => d.includes(w)));
    const why = words.length === 1 && words[0] !== "imaginary frequencies" ? "it was for the other species" : "they were for the other species";
    const was = words.length === 1 && words[0] !== "imaginary frequencies" ? "was" : "were";
    said.push(
      some.length === set
        ? `${set === 1 ? "its" : "their"} ${listed(words)} ${was} dropped (${why})`
        : `${some.length} of them had ${some.length === 1 ? "its" : "their"} ${listed(words)} dropped (${why})`,
    );
  }
  if (failed) said.push(`${failed} failed`);
  return said.join("; ");
}

/** *Combine* (lib/steps `combined`): the entries, in the set's order, as one entry - a complex - or why they cannot be. */
export function combinedSet(entries: readonly SetEntry[]): Outcome3D {
  // (each part without the group and number Meno reads from where it stands in its set, and the state it reads from its marks - its place and standing, not values it held - so that what is said not carried is what it held)
  const parts = entries.map((e, i) => {
    const { group: _g, number: _n, state: _s, ...properties } = entryOfSet(e, String(i)).properties;
    return { ...entryOfSet(e, String(i)), properties };
  });
  const out = combined(parts, "complex");
  if ("failed" in out) return { ok: false, said: out.failed };
  const made = setEntryOfEntry(out.entry, { compound: 0, number: 1 });
  if (!made) return { ok: false, said: "The complex has no places in 3D" };
  return { ok: true, holds: "molecules", kept: [made], aside: [], said: [`${plural(entries.length, "part")} as one complex`, ...out.said].join(". ") };
}

/** *Measure* (lib/steps `measured`): each entry with its measurements as properties; one that does not apply to it says why on itself. */
export function measuredSet(entries: readonly SetEntry[], holds: Holds3D, text: string): Outcome3D {
  const typed = measurementsTyped(text);
  if ("why" in typed) return { ok: false, said: typed.why };
  const made = entries.map((e, i) => measured(entryOfSet(e, String(i)), typed.atoms));
  // (each measurement this step made that does not apply, or failed: said on the entry, counted here)
  const names = typed.atoms.map(measurementName);
  const notDone = made.reduce((n, e) => n + names.filter((k) => e.properties[k] && e.properties[k].status !== "computed").length, 0);
  return {
    ok: true,
    holds,
    kept: backEach(entries, made),
    aside: [],
    said: `${plural(typed.atoms.length, "measurement")} on ${plural(entries.length, "entry", "entries")}${notDone ? `, ${notDone} not measured` : ""}`,
  };
}
