/**
 * Meno's steps on structures, as a workflow's steps run them
 * (docs/STRUCTURE-STEPS.md): *Tag*, *Species*, *Combine*, *Measure* and
 * *Restraints*, and those of two inputs, *Merge*, *Re-bond*, *Compare
 * bonding*, *Torsion restraints* and *Atom map* - each
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
import { restraintsOf, TORSION_STEP, torsionsRestrained } from "../../../../lib/steps/restraints";
import type { OptionValues } from "../../../../lib/options";
import { atomMapNeeds, restraintsTyped, torsionsNeeds } from "./kinds";
import { bondChangesTable, MAPPED_ENTRY, renumberedEntry } from "../../../../lib/steps/reaction";
import { mapOnto, type BondChangeRow } from "../../../../lib/chem/reactionMap";
import type { Molecule } from "../../../../lib/chem/molecule";
import { atomsOfRows, type Table } from "../../../../lib/table";
import { displacedEntry } from "../../../../lib/steps/vibrations";
import { CALC_CARRIED, compoundLetter, entryOfSet, entryState, FINISHED, setEntryOfEntry, type SetEntry } from "./entries";
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
export function measuredSet(entries: readonly SetEntry[], holds: Holds3D, text: string, fromTable?: { table: Table | null; rows: string }): Outcome3D {
  // (the atoms of each entry: typed, the same for all; or each row's of the table - every row on every entry, or those whose
  //  value in the column named is the entry's value of the property of that name - read as the table's columns say they count them)
  let each: (e: SetEntry) => number[][];
  if (fromTable) {
    if (!fromTable.table) return { ok: false, said: "Nothing comes into Atoms" };
    const read = atomsOfRows(fromTable.table);
    if ("why" in read) return { ok: false, said: read.why };
    const name = fromTable.rows.trim();
    const column = name ? fromTable.table.columns.findIndex((c) => c.name === name) : -1;
    if (name && column < 0) return { ok: false, said: `The table has no column ${name}` };
    const cells = fromTable.table.rows.map((r) => (column >= 0 ? r[column] : null));
    each = (e) => {
      const value = e.properties?.[name]?.value;
      return read.rows.filter((_, k) => !name || (value != null && String(cells[k]) === String(value)));
    };
  } else {
    const typed = measurementsTyped(text);
    if ("why" in typed) return { ok: false, said: typed.why };
    each = () => typed.atoms;
  }
  const atoms = entries.map(each);
  const made = entries.map((e, i) => measured(entryOfSet(e, String(i)), atoms[i]));
  // (each measurement this step made that does not apply, or failed: said on the entry, counted here)
  const asked = atoms.reduce((n, a) => n + a.length, 0);
  const notDone = made.reduce((n, e, i) => n + atoms[i].map(measurementName).filter((k) => e.properties[k] && e.properties[k].status !== "computed").length, 0);
  const none = atoms.filter((a) => !a.length).length;
  return {
    ok: true,
    holds,
    kept: backEach(entries, made),
    aside: [],
    said: `${plural(asked, "measurement")} on ${plural(entries.length, "entry", "entries")}${notDone ? `, ${notDone} not measured` : ""}${none ? `, ${none} with no row of the table` : ""}`,
  };
}

/** A property written on an entry by a step: a text, of no unit - why it was set aside, how it is bonded, what it matches. */
const said = (value: string) => ({ value, unit: "none" as const, status: "computed" as const });
/** An entry with a text property of a step's written on it. */
export const withSaid = (e: SetEntry, name: string, value: string): SetEntry => ({ ...e, properties: { ...e.properties, [name]: said(value) } });
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
  /** Every centre by its atoms' numbers, as ConfoTS's check reads them (lib/steps/compareBonding `numberedCentres`). */
  numbered: boolean;
  atoms: string;
  elements: string;
  /** How far, times their covalent radii together, two atoms may stand and be bonded - and at least how far over them, in Å. */
  reach: number;
  floor: number;
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
  if (!(o.reach >= 1 && o.reach <= 2)) return { ok: false, said: "Bonded within must be from 1 to 2 times the sum of the covalent radii" };
  if (!(o.floor >= 0 && o.floor <= 1)) return { ok: false, said: "At least over the sum must be from 0 to 1 Å" };
  const options: CompareOptions = { rs: o.rs, ez: o.ez, numbered: o.numbered, passOver: { atoms, elements }, reach: o.reach, floor: o.floor };
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
  const step = Number(String(v.step ?? TORSION_STEP).trim());
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
  // (a count of none left unsaid: the set it would name shows it empty)
  const said: string[] = [];
  if (kept.length) said.push(`${kept.length} restrained`);
  if (aside.length - noTrans) said.push(`${aside.length - noTrans} trans already`);
  if (noTrans) said.push(`${noTrans} with no trans torsion in ${noTrans === 1 ? "its" : "their"} reference`);
  if (!said.length) said.push("0 restrained");
  if (added) said.push(`${plural(added, "torsion")} newly held`);
  if (raised) said.push(`${plural(raised, "torsion")} held stronger`);
  return { ok: true, holds, kept, aside, said: said.join(" \u00b7 ") };
}

/** A step's entry as the atom mapper reads a structure: its atoms where its places are, its bonds. */
export const moleculeOfEntry = (e: SetEntry): Molecule => ({
  atoms: e.atoms.map((a, i) => ({ ...a, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })),
  bonds: e.bonds.map((b) => ({ ...b })),
});

/** What the atom mapper made of an Atom map's entries (lib/chem/reactionMap `mapOnto`), worked out here or in a worker: of each reference, the sides matched with it. */
export type EntriesMapped = ReturnType<typeof mapOnto>;

/** An Atom map's mapping, one reference at a time: the reference's side (its entries, by place in *Reference*), and each side mapped onto it (each its entries, by place in *Molecules*). */
export type AtomMapGroup = { reference: number[]; sides: number[][] };

/**
 * What an Atom map maps onto what (`AtomMapGroup`): each input's entries
 * each a side of its own, or all one side together - finished, and with
 * their hydrogens - or why it cannot map at all: options it still needs,
 * not one reference where it is against the one, or a reference without
 * its hydrogens. A side it does not map, with why, is in `aside`: each of
 * its entries.
 */
export function atomMapPlan(entries: readonly SetEntry[], references: readonly SetEntry[], v: OptionValues): { groups: AtomMapGroup[]; aside: { entry: number; why: string }[] } | { refused: string } {
  const needs = atomMapNeeds(v);
  if (needs) return { refused: needs };
  const together = { entries: v.moleculesAre === "together", reference: v.referenceIs === "together" };
  const byProperty = v.reference === "property";
  if (!byProperty && !together.reference && references.length !== 1)
    return { refused: `Against the one reference, but ${references.length} came into Reference: match them on a property, or take the reference as one side` };
  const refSides = together.reference ? [references.map((_, i) => i)] : references.map((_, i) => [i]);
  if (!byProperty && refSides[0].some((i) => references[i].skeleton)) return { refused: "The reference has no hydrogens: every atom must map, hydrogens included" };
  const sides = together.entries ? [entries.map((_, i) => i)] : entries.map((_, i) => [i]);
  // (each side's reference: the one, or - each its own - the one with the same value of the property)
  const matched = byProperty
    ? matchedOn(
        entries.map((e, i) => entryOfSet(e, String(i))),
        references.map((e, i) => entryOfSet(e, String(i))),
        String(v.property).trim(),
        "Reference",
      )
    : sides.map(() => ({ index: 0 }));
  const groups = new Map<number, number[][]>();
  const aside: { entry: number; why: string }[] = [];
  sides.forEach((side, k) => {
    const m = matched[k];
    const said = (why: string) => side.forEach((entry) => aside.push({ entry, why }));
    const unfinished = side.find((i) => entryState(entries[i]) !== FINISHED);
    if (unfinished != null) return said(`not finished: ${side.length > 1 ? `${named(entries[unfinished])} is ` : ""}${entryState(entries[unfinished])}`);
    const bare = side.find((i) => entries[i].skeleton);
    if (bare != null) return said(`${side.length > 1 ? `${named(entries[bare])} has` : "it has"} no hydrogens: every atom must map, hydrogens included`);
    if ("why" in m) return said(`not paired: ${m.why}`);
    if (refSides[m.index].some((i) => references[i].skeleton)) return said("its reference has no hydrogens: every atom must map, hydrogens included");
    groups.set(m.index, [...(groups.get(m.index) ?? []), side]);
  });
  return { groups: [...groups].map(([k, ss]) => ({ reference: refSides[k], sides: ss })), aside };
}

/**
 * *Atom map* (lib/chem/reactionMap `mapOnto`, lib/steps/reaction): each
 * side - an entry of *Molecules*, or all of them together - mapped onto its
 * reference - the one of *Reference*, all of them together, or the one with
 * the same value of a property - atom for atom and hydrogens too, and
 * written in its numbering, by its first map or by every map: a reaction's
 * products onto its reactants, a species' conformers onto it. The bonds
 * each map forms, breaks or changes go into *Bond changes*, a table; where
 * bonds are to stay the same, a side whose map changes any is not mapped. A
 * side not finished, with no hydrogens, with no reference to pair with, or
 * that does not map one to one, is set aside with why - never passed on as
 * mapped. A mapped entry keeps its energy and its imaginary frequencies, of
 * its geometry however it is numbered, and one numbered as it was keeps all
 * it held; a calculation does not follow a renumbering, and the line says
 * so. Several entries mapped as one side come out as one, in the places the
 * map set them in, carrying none of their own values.
 * `mapped`, where the mapping was worked out already (in a worker): for each
 * of `atomMapPlan`'s groups, its sides mapped, in order.
 */
export function atomMapSet(entries: readonly SetEntry[], references: readonly SetEntry[], holds: Holds3D, v: OptionValues, mapped?: readonly EntriesMapped[]): Outcome3D {
  const plan = atomMapPlan(entries, references, v);
  if ("refused" in plan) return { ok: false, said: plan.refused };
  const every = v.maps === "every";
  const bonds = v.bonds === "same" ? "same" : "change";
  // (a mapped side as its rows and it name it: its entries' names or places - and its map, where every map is given; two of one name told apart by their places)
  const base = entries.map((e) => e.name ?? named(e));
  const nameOf = (i: number) => (base.filter((b) => b === base[i]).length > 1 ? `${base[i]} (${named(entries[i])})` : base[i]);
  const sideKey = (side: readonly number[], map: number) => `${side.map(nameOf).join(" + ")}${every ? `, map ${map + 1}` : ""}`;
  const kept: SetEntry[] = [];
  const asideWhy = new Map<number, string[]>();
  const why = (side: readonly number[], said: string) => side.forEach((i) => asideWhy.set(i, [...(asideWhy.get(i) ?? []), said]));
  plan.aside.forEach((a) => why([a.entry], a.why));
  const done: { map: number; changes: BondChangeRow[]; side: number[] }[] = [];
  const mappedSides = new Set<number[]>();
  let replaced = 0;
  let calc = 0;
  let partsOwn = 0;
  plan.groups.forEach((g, k) => {
    const out = mapped?.[k] ?? mapOnto(g.reference.map((i) => moleculeOfEntry(references[i])), g.sides.map((side) => side.map((i) => moleculeOfEntry(entries[i]))), { bonds, every });
    for (const n of out.notMapped) why(g.sides[n.product], n.map != null && every ? `map ${n.map + 1}: ${n.reason}` : n.reason);
    const maps = new Map<number[], number>();
    for (const m of out.mapped) {
      const side = g.sides[m.product];
      const first = entries[side[0]];
      // (one entry, as it was; several, as one entry - its parts' own values none of its)
      const whole = side.length === 1 ? entryOfSet(first, String(side[0])) : combinedOf(side.map((i) => entries[i]));
      if ("failed" in whole) {
        why(side, whole.failed);
        continue;
      }
      const r = renumberedEntry(whole, m.order, `${side.join("+")}:${m.map}`);
      if ("failed" in r) {
        why(side, `${every ? `map ${m.map + 1}: ` : ""}${r.failed}`);
        continue;
      }
      // (several entries as one: in the places the map set them in, side by side)
      const placed = side.length === 1 ? r : { ...r, geometry: { kind: "3d" as const, xyz: m.molecule.atoms.flatMap((a) => [a.x, a.y, a.z]) } };
      // (its own place - every map of it, where every one is given, numbered on in its compound)
      const number = every ? (maps.get(side) ?? 0) + 1 : first.number;
      const e = setEntryOfEntry(placed, { compound: every ? side[0] : first.compound, number }, side.length === 1 ? first : undefined);
      if (!e) continue;
      maps.set(side, number);
      mappedSides.add(side);
      done.push({ map: m.map, changes: m.changes, side });
      const moved = m.order.some((j, at) => j !== at);
      let held = e;
      if (side.length === 1 && moved) {
        // (renumbered, its energy and imaginary frequencies its geometry's, whatever its numbering: carried, and its thermochemistry
        //  and vibrations as its own properties, renumbered with it; its calculation not)
        const carried = Object.fromEntries(CALC_CARRIED.flatMap((key) => (r.properties[key] ? [[key, r.properties[key]]] : [])));
        held = { ...e, properties: { ...e.properties, ...carried }, ...(first.energy != null ? { energy: first.energy } : {}), ...(first.imaginary ? { imaginary: [...first.imaginary] } : {}) };
        if (first.calc) calc++;
      }
      if (side.length > 1 && side.some((i) => entries[i].energy != null || entries[i].calc || Object.keys(entries[i].properties ?? {}).length)) partsOwn++;
      if (side.length === 1 && first.properties?.[MAPPED_ENTRY]) replaced++;
      kept.push(withSaid(held, MAPPED_ENTRY, sideKey(side, m.map)));
    }
  });
  // (a side of which no map went through, aside with why - each map's that did not, said on it - each entry of it as it came)
  const allSides = plan.groups.flatMap((g) => g.sides);
  const unmapped = allSides.filter((side) => !mappedSides.has(side)).flat();
  const asideEntries = [...new Set([...plan.aside.map((a) => a.entry), ...unmapped])].sort((p, q) => p - q);
  const aside = asideEntries.map((i) => withSaid(entries[i], SET_ASIDE, (asideWhy.get(i) ?? []).join(" ")));
  const changes = bondChangesTable(done, (d) => sideKey(d.side, d.map));
  const sideCount = (v.moleculesAre === "together" ? 1 : entries.length);
  const line = [`${mappedSides.size} of ${sideCount} mapped`];
  if (aside.length) line.push(`${v.moleculesAre === "together" ? 1 : aside.length} not mapped`);
  if (calc) line.push(`${calc === 1 ? "its calculation" : "calculations"} not carried`);
  if (partsOwn) line.push("the parts' own values not carried");
  if (replaced) line.push(`the ${MAPPED_ENTRY} ${replaced === 1 ? "an entry" : `${replaced} entries`} carried replaced`);
  return { ok: true, holds, kept, aside, said: line.join(", "), tables: { changes } };
}

/** Several step's entries as one entry record, their atoms one after another (lib/steps `combined`), or why not. */
function combinedOf(parts: readonly SetEntry[]): Entry | { failed: string } {
  const out = combined(
    parts.map((e, i) => {
      const { group: _g, number: _n, state: _s, ...properties } = entryOfSet(e, String(i)).properties;
      return { ...entryOfSet(e, String(i)), properties };
    }),
    "side",
  );
  return "failed" in out ? out : out.entry;
}

/**
 * *Displace* (lib/steps `displacedEntry`): each entry's geometry moved
 * along its imaginary vibration - the most negative of several, said - or
 * the one chosen, by the amplitude: the atom moving most by exactly that,
 * the rest in proportion. What it carried rides along, each value saying
 * the geometry it was worked out at; its energy and calculation, of that
 * geometry, are not its own any more. One not finished - its calculation
 * failed, or did not converge - is set aside as not finished: its
 * vibrations are no ground to move it on. One with no vibrations to move
 * along, no imaginary one, or no such vibration, is set aside with why. A
 * conformer set's are counted as frames.
 */
export function displacedSet(entries: readonly SetEntry[], holds: Holds3D, o: { amplitude: number; vibration: "imaginary" | number }): Outcome3D {
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const notes = new Set<string>();
  entries.forEach((e, i) => {
    if (entryState(e) !== FINISHED) {
      aside.push(withSaid(e, SET_ASIDE, `not finished: ${entryState(e)}`));
      return;
    }
    const r = displacedEntry(entryOfSet(e, String(i)), o, String(i));
    if ("failed" in r) {
      aside.push(withSaid(e, SET_ASIDE, r.failed));
      return;
    }
    if (r.said) notes.add(r.said);
    const made = setEntryOfEntry(r.entry, { compound: e.compound, number: e.number }, e);
    if (made) kept.push(made);
  });
  const line = [`${holds === "conformers" ? plural(kept.length, "frame") : plural(kept.length, "entry", "entries")} displaced`];
  if (aside.length) line.push(`${aside.length} not displaced`);
  return { ok: true, holds, kept, aside, said: [line.join(" \u00b7 "), ...notes].join(". ") };
}
