/**
 * *Group* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): each entry's
 * `group` set - the property the nodes that work in each group read:
 * - by constitution: entries of one structure - the same atoms, bonded the
 *   same way, however numbered (Meno's identity, lib/chem/identity) - and one
 *   charge and spin multiplicity. An entry's record holds no configuration of
 *   its stereocentres, so stereoisomers are one group: the option says
 *   "constitution", not "compound", for that reason;
 * - by a property's value: entries with the same value, a number with its
 *   unit or a text;
 * - all together: one group.
 * Groups are lettered a, b, c... in the order their first entry came. An
 * entry with no value to group by goes out of *rest*, saying so; an entry
 * that was in another group is counted and said.
 */
import type { Entry } from "../entry";
import { identityKey } from "../chem/identity";
import type { LayoutInput } from "../layout/perceive";
import { entries as count, groupLetter, groups as countGroups, PROPERTY, setAside, tally, unitLabel, unreadable, type NodeOutcome } from "./base";

export type GroupOptions = { by: "constitution" | "all together" | { property: string } };

/** An entry's structure as Meno's identity reads it: each atom by its element - with its isotope, where it has one - and charge, and its bonds; no stereochemistry, which the entry's record does not hold. */
export function constitutionOf(e: Entry): LayoutInput {
  return {
    atoms: e.structure.atoms.map((a) => ({ el: a.isotope ? `${a.isotope}${a.el}` : a.el, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: e.structure.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
  };
}

/** The key an entry is grouped by, or why it has none. */
function keyOf(e: Entry, by: GroupOptions["by"]): { key: string } | { why: string } {
  if (by === "all together") return { key: "" };
  if (by === "constitution") return { key: `${identityKey(constitutionOf(e))}|${e.species ? `${e.species.charge}|${e.species.multiplicity}` : "skeleton"}` };
  const p = e.properties[by.property];
  const why = unreadable(p, by.property);
  if (why) return { why };
  const v = p!.value;
  if (typeof v === "number") return { key: `${v} ${unitLabel(p!.unit)}` };
  if (typeof v === "string" || typeof v === "boolean") return { key: String(v) };
  return { why: `its ${by.property} is not a number, a text or true/false` };
}

/** *Group* on `entries`: *done*, each with its group, in the order they came; *rest*, those with nothing to group by, each saying why. */
export function group(entries: readonly Entry[], options: GroupOptions): NodeOutcome<"done" | "rest"> {
  if (typeof options.by === "object" && !options.by.property) return { ok: false, said: "No property to group by" };
  const letters = new Map<string, string>();
  const done: Entry[] = [];
  const rest: Entry[] = [];
  let regrouped = 0;
  let skeletons = 0;
  for (const e of entries) {
    const k = keyOf(e, options.by);
    if ("why" in k) {
      rest.push(setAside(e, k.why));
      continue;
    }
    if (!letters.has(k.key)) letters.set(k.key, groupLetter(letters.size));
    if (e.properties[PROPERTY.group]) regrouped++;
    if (options.by === "constitution" && !e.species) skeletons++;
    done.push({ ...e, properties: { ...e.properties, [PROPERTY.group]: { value: letters.get(k.key)!, unit: "none", status: "computed" } } });
  }
  const how = options.by === "constitution" ? "by constitution" : options.by === "all together" ? "all together" : `by ${options.by.property}`;
  const said =
    `${countGroups(letters.size)} ${how} · ${done.length} of ${count(entries.length)}` +
    (regrouped ? ` · ${regrouped} had a group before` : "") +
    // (a skeleton's hydrogens are not there: two of the same heavy atoms are one group, however each is protonated)
    (skeletons ? ` · ${skeletons} without hydrogens, grouped by heavy atoms alone` : "") +
    (rest.length ? ` · rest ${rest.length} (${tally(rest)})` : "");
  return { ok: true, exits: { done, rest }, said };
}
