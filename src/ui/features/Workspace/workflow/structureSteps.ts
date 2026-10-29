/**
 * Meno's steps on structures, as a workflow's steps run them
 * (docs/STRUCTURE-STEPS.md): *Tag*, *Species*, *Combine*, *Measure* and
 * *Restraints*, and those of two inputs, *Merge*, *Re-bond*, *Compare
 * bonding* and *Torsion restraints* - each
 * a set's entries read as Meno's entry record (`entryOfSet`), the step's own
 * function done on them (lib/nodes, lib/steps), and each entry given back as
 * a step's entry (`setEntryOfEntry`) - all it held kept where it is that
 * entry still, what was worked out at another structure or state never
 * carried. Each says what it did; nothing it does not pass on goes unsaid.
 */
import type { Entry } from "../../../../lib/entry";
import { tag } from "../../../../lib/nodes/tag";
import { merge } from "../../../../lib/nodes/merge";
import { matchedOn } from "../../../../lib/nodes/match";
import { rebonded } from "../../../../lib/steps/rebond";
import { atomsFromOne, comparedBonding, matchingReference, type CompareOptions } from "../../../../lib/steps/compareBonding";
import { combined } from "../../../../lib/steps/combine";
import { measured, measurementName, measurementsTyped } from "../../../../lib/steps/measure";
import { speciesNeeds, speciesTyped, withSpecies } from "../../../../lib/steps/species";
import { restraintsOf, torsionsRestrained } from "../../../../lib/steps/restraints";
import type { OptionValues } from "../../../../lib/options";
import { restraintsTyped, torsionsNeeds } from "./kinds";
import { CALC_CARRIED, compoundLetter, entryOfSet, setEntryOfEntry, type SetEntry } from "./entries";
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
/** Whether an entry carries anything of a calculation as its own properties (entries `CALC_CARRIED`): a conformer's free energy, its vibrations. */
const carries = (e: SetEntry) => CALC_CARRIED.some((k) => e.properties?.[k]);
const droppedFrom = (was: SetEntry, now: SetEntry) => [
  ...DROPPABLE.filter(([k]) => was[k] != null && now[k] == null).map(([, word]) => word),
  ...(carries(was) && !carries(now) ? ["thermochemistry"] : []),
];

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
    const words = [...DROPPABLE.map(([, w]) => w), "thermochemistry"].filter((w) => some.some((d) => d.includes(w)));
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

/** A property written on an entry by a step: a text, of no unit - why it was set aside, how it is bonded, what it matches. */
const said = (value: string) => ({ value, unit: "none" as const, status: "computed" as const });
/** An entry with a text property of a step's written on it. */
const withSaid = (e: SetEntry, name: string, value: string): SetEntry => ({ ...e, properties: { ...e.properties, [name]: said(value) } });
/** An entry as a step's line names it: its compound's letter and its number, "b #2". */
const named = (e: SetEntry) => `${compoundLetter(e.compound)} #${e.number}`;
/** Why an entry was set aside, as the steps of two inputs write it on it (`set_aside`): to read in its set's table, and to filter on. */
export const SET_ASIDE = "set_aside";
/** How an entry is bonded against its reference, as *Compare bonding* writes it on one that is not the same: its differences, or why it was not compared. */
export const BONDING = "bonding";

/**
 * *Merge* (lib/nodes `merge`): two sets of one kind made one, *First*'s
 * entries then *Second*'s - all of them, or one for each value of a
 * property - those set aside each saying which it gave way to. A conformer
 * set's compounds stay apart: *Second*'s are numbered on after *First*'s.
 */
export function mergedSet(first: readonly SetEntry[], second: readonly SetEntry[], holds: Holds3D, keep: "all" | "one", property: string): Outcome3D {
  const name = property.trim();
  if (keep === "one" && !name) return { ok: false, said: "Name the property to keep one of each" };
  const past = first.reduce((n, e) => Math.max(n, e.compound + 1), 0);
  const all = [...first, ...second.map((e) => ({ ...e, compound: e.compound + past }))];
  const asEntry = (i: number) => entryOfSet(all[i], String(i));
  const out = merge(
    [first.map((_, i) => asEntry(i)), second.map((_, k) => asEntry(first.length + k))],
    { keep: keep === "one" ? { onePer: name } : "all" },
  );
  if (!out.ok) return out;
  const asideWhy = (e: { status: unknown }) => (typeof e.status === "object" && e.status && "aside" in e.status ? String(e.status.aside) : "");
  // (each as it came - a step's entry, never made again - its why written on it, naming the one it gave way to)
  const back = (id: string) => all[Number(id)];
  const keptBy = new Map(out.exits.done.map((e) => [e.id, back(e.id)]));
  const aside = out.exits.rest.map((e) => withSaid(back(e.id), SET_ASIDE, asideWhy(e).replace(/as (\d+), which was kept/, (_, id) => `as ${named(keptBy.get(id) ?? back(id))}, which was kept`)));
  return { ok: true, holds, kept: out.exits.done.map((e) => back(e.id)), aside, said: out.said };
}

/**
 * *Re-bond* (lib/steps `rebonded`): each entry of *Geometry* given the
 * bonds and charges of an entry of *Bonding* - each with each, or the one
 * that has the same value of a property - as one entry of its own; where
 * the two do not hold the same atoms in one numbering, or *Geometry*'s holds
 * frames, the geometry entry set aside with why, naming the bonding entry.
 * Re-bonded entries are grouped by the geometry's compound and the bonding
 * entry, each group a compound of its own.
 */
export function rebondedSet(geometry: readonly SetEntry[], bonding: readonly SetEntry[], holds: Holds3D, pairs: "each" | "property", property: string): Outcome3D {
  const name = property.trim();
  if (pairs === "property" && !name) return { ok: false, said: "Name the property to pair them on" };
  const gs = geometry.map((e, i) => entryOfSet(e, String(i)));
  const bs = bonding.map((e, i) => entryOfSet(e, String(i)));
  // (the pairs: each with each, or each geometry with the one bonding entry of its value)
  const matched = pairs === "property" ? matchedOn(gs, bs, name, "Bonding") : null;
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const notes = new Set<string>();
  const groups = new Map<string, { compound: number; count: number }>();
  geometry.forEach((g, i) => {
    const onto = matched ? ("index" in matched[i] ? [matched[i].index] : []) : bonding.map((_, k) => k);
    if (matched && "why" in matched[i]) {
      aside.push(withSaid(g, SET_ASIDE, `not paired: ${matched[i].why}`));
      return;
    }
    for (const k of onto) {
      const r = rebonded(gs[i], bs[k], `${i}:${k}`);
      if ("failed" in r) {
        aside.push(withSaid(g, SET_ASIDE, `onto ${named(bonding[k])}: ${r.failed}`));
        continue;
      }
      r.said.forEach((n) => notes.add(n));
      const key = `${g.compound}|${k}`;
      const group = groups.get(key) ?? { compound: groups.size, count: 0 };
      group.count += 1;
      groups.set(key, group);
      const made = setEntryOfEntry(r.entry, { compound: group.compound, number: group.count });
      if (made) kept.push(made);
    }
  });
  const line = [`${plural(kept.length, "entry", "entries")} re-bonded${pairs === "property" ? `, paired on ${name}` : ", each with each"}`];
  if (aside.length) line.push(`${aside.length} not re-bonded`);
  return { ok: true, holds, kept, aside, said: [line.join(" \u00b7 "), ...notes].join(". ") };
}

/** *Compare bonding*'s options as its card gives them: against which reference, what it writes of the match, what it compares, and what it passes over. */
export type CompareStep = {
  reference: "each" | "property";
  property: string;
  writes: string;
  from: string;
  rs: boolean;
  ez: boolean;
  atoms: string;
  elements: string;
};

/**
 * *Compare bonding* (lib/steps `comparedBonding`): whether each entry's
 * geometry is bonded as its reference is - the one of *Reference* with the
 * same value of a property, or each reference in turn, the first it is
 * bonded as named on it (`writes`: its number, from 1, or its value of
 * `from`; "none" where it is none). The same, out of *Same*; otherwise out
 * of *Different*, its differences written on it - or why it could not be
 * compared (another numbering, frames, no reference to pair with), counted
 * apart.
 */
export function comparedSet(entries: readonly SetEntry[], references: readonly SetEntry[], holds: Holds3D, o: CompareStep): Outcome3D {
  const atoms = atomsFromOne(o.atoms);
  if ("why" in atoms) return { ok: false, said: atoms.why };
  const elements = o.elements.split(/[\s,]+/).filter(Boolean);
  if (o.reference === "property" && !o.property.trim()) return { ok: false, said: "Name the property to pair them on" };
  if (o.reference === "each" && !o.writes.trim()) return { ok: false, said: "Name the property the match is written as" };
  const options: CompareOptions = { rs: o.rs, ez: o.ez, passOver: { atoms, elements } };
  const es = entries.map((e, i) => entryOfSet(e, String(i)));
  const rs = references.map((e, i) => entryOfSet(e, String(i)));
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  let notCompared = 0;
  const different = (e: SetEntry, why: string) => aside.push(withSaid(e, BONDING, why));
  const unpaired = (e: SetEntry, why: string) => {
    notCompared++;
    different(e, `not compared: ${why}`);
  };
  if (o.reference === "property") {
    const matched = matchedOn(es, rs, o.property.trim(), "Reference");
    entries.forEach((e, i) => {
      const m = matched[i];
      if ("why" in m) return unpaired(e, m.why);
      const r = comparedBonding(es[i], rs[m.index], options);
      if ("failed" in r) return unpaired(e, r.failed);
      if (r.same) kept.push(e);
      else different(e, `different: ${r.differences.join(" ")}`);
    });
  } else {
    const writes = o.writes.trim();
    const from = o.from.trim();
    // (what is written of the reference it is bonded as: its value of `from` where one is chosen - else its number among them, from 1)
    const of = (k: number) => {
      const p = rs[k].properties[from];
      return from ? (p && p.status === "computed" && (typeof p.value === "string" || typeof p.value === "number") ? String(p.value) : `none of its own (${from})`) : `reference ${k + 1}`;
    };
    entries.forEach((e, i) => {
      const k = matchingReference(es[i], rs, options);
      if (k != null) return kept.push(withSaid(e, writes, of(k)));
      // (with one reference, what differs from it; with several, that it is none of them - each one's differences are its own)
      const one = rs.length === 1 ? comparedBonding(es[i], rs[0], options) : null;
      if (one && "failed" in one) return unpaired(withSaid(e, writes, "none"), one.failed);
      different(withSaid(e, writes, "none"), one && !one.same ? `different: ${one.differences.join(" ")}` : `bonded as none of the ${rs.length} references`);
    });
  }
  const line = [`${kept.length} same`, `${aside.length - notCompared} different`, ...(notCompared ? [`${notCompared} not compared`] : [])];
  return { ok: true, holds, kept, aside, said: line.join(" \u00b7 ") };
}

/** An entry with its restraints as a step left them. */
const withRestraints = (e: SetEntry, restraints: NonNullable<SetEntry["properties"]>[string]): SetEntry => ({ ...e, properties: { ...e.properties, restraints } });

/**
 * *Restraints* (lib/steps `restraintsOf`): each entry with its restraints
 * from itself - its coordination bonds at the factor given, the pairs
 * typed at their distance, the atoms typed fixed - whatever it held before
 * replaced; one it cannot have them out of *Failed*, saying why.
 */
export function restrainedSet(entries: readonly SetEntry[], holds: Holds3D, v: OptionValues): Outcome3D {
  const typed = restraintsTyped(v);
  if ("why" in typed) return { ok: false, said: typed.why };
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const total = { coordination: 0, distances: 0, fixed: 0 };
  let replaced = 0;
  let torsionsKept = 0;
  entries.forEach((was, i) => {
    const r = restraintsOf(entryOfSet(was, String(i)), typed.asked);
    if ("failed" in r) {
      aside.push({ ...was, failed: { kind: "refused", why: r.failed } });
      return;
    }
    total.coordination += r.count.coordination;
    total.distances += r.count.distances;
    total.fixed += r.count.fixed;
    if (r.count.replaced) replaced++;
    if (r.count.torsionsKept) torsionsKept++;
    kept.push(withRestraints(was, r.property));
  });
  const said = [`${plural(kept.length, "entry", "entries")} restrained`];
  if (typed.asked.coordination != null) said.push(total.coordination ? `${plural(total.coordination, "coordination bond")} held` : "no coordination bonds");
  if (total.distances) said.push(`${plural(total.distances, "pair")} at their distance`);
  if (total.fixed) said.push(`${plural(total.fixed, "atom")} fixed`);
  // (what an entry held before: its distances and atoms fixed replaced, its torsions - with the strengths they reached - kept; both said)
  if (replaced) said.push(`${replaced} ${replaced === 1 ? "entry's" : "entries'"} earlier distances and atoms fixed replaced`);
  if (torsionsKept) said.push(`${torsionsKept} ${torsionsKept === 1 ? "entry's" : "entries'"} torsions kept`);
  if (aside.length) said.push(`${aside.length} failed`);
  return { ok: true, holds, kept, aside, said: said.join(" \u00b7 ") };
}

/**
 * *Torsion restraints* (lib/steps `torsionsRestrained`): each entry against
 * its reference - the one of *Reference*, or the one with the same value of
 * a property - each torsion trans there and not trans here held at 180°,
 * stronger by the step each time; out of *Restrained*. One with every such
 * torsion trans already out of *Trans already*, as it came - counted apart
 * where its reference has no trans torsion at all. Where any entry cannot
 * be set against a reference, nothing is done, each such entry named with
 * why: its only other exit is *Trans already*, and none is passed on as
 * trans that was never looked at.
 */
export function torsionsSet(entries: readonly SetEntry[], references: readonly SetEntry[], holds: Holds3D, v: OptionValues): Outcome3D {
  const needs = torsionsNeeds(v);
  if (needs) return { ok: false, said: needs };
  const step = Number(String(v.step).trim());
  const byProperty = v.reference === "property";
  if (!byProperty && references.length !== 1) return { ok: false, said: `Against the one reference, but ${references.length} came into Reference: match them on a property` };
  const es = entries.map((e, i) => entryOfSet(e, String(i)));
  const rs = references.map((e, i) => entryOfSet(e, String(i)));
  const matched = byProperty ? matchedOn(es, rs, String(v.property).trim(), "Reference") : es.map(() => ({ index: 0 }));
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const problems: string[] = [];
  let added = 0;
  let raised = 0;
  let noTrans = 0;
  entries.forEach((e, i) => {
    const m = matched[i];
    if ("why" in m) return problems.push(`${named(e)}: ${m.why}`);
    const r = torsionsRestrained(es[i], rs[m.index], step);
    if ("failed" in r) return problems.push(`${named(e)}: ${r.failed}`);
    if (!r.count.trans) noTrans++;
    if (!r.count.wrong) return aside.push(e);
    added += r.count.added;
    raised += r.count.raised;
    kept.push(withRestraints(e, r.property));
  });
  if (problems.length) return { ok: false, said: `${plural(problems.length, "entry", "entries")} could not be set against a reference: ${problems.join("; ")}` };
  const said = [`${kept.length} restrained`, `${aside.length - noTrans} trans already`];
  if (noTrans) said.push(`${noTrans} with no trans torsion in ${noTrans === 1 ? "its" : "their"} reference`);
  if (added) said.push(`${plural(added, "torsion")} newly held`);
  if (raised) said.push(`${plural(raised, "torsion")} held stronger`);
  return { ok: true, holds, kept, aside, said: said.join(" \u00b7 ") };
}
