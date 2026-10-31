/**
 * *Ensemble energy* (docs/WORKFLOWS-FOUNDATION.md, case F, step 44): a
 * group's free energy over its members - its conformers - taken together,
 * the alternative to its lowest alone:
 *
 *   G_ens = G_min - R T ln Σ_i g_i exp(-(G_i - G_min) / R T)
 *
 * with g_i each member's degeneracy (1 where it says none; one that is no
 * count refused), at the one
 * temperature its members' values state - none assumed. One entry stands
 * for each group, its lowest, carrying the value: of the group, not of
 * that one geometry (`Property.ensemble`), each member's value kept as it
 * was (`Property.parts`, an Add's own parts one level down).
 */
import type { By, Entry, Property, PropertyPart } from "../entry";
import { convert, type Unit } from "../units";
import { entries as count, inGroups, numberIn, setAside, tally, unreadable, workedOutUnlike, type NodeOutcome } from "./base";
import { R_GAS } from "./standardState";

export type EnsembleOptions = {
  /** The value each member carries, a free energy. */
  property: string;
  /** In each group (the `group` property), or of them all as one. */
  within: "each group" | "all";
  /** The name the ensemble's value is written under, on the entry that stands for its group. */
  as: string;
};

/** What of a member's `by` its ensemble's value carries: the level the members share. */
const LEVEL = ["plugin", "version", "program", "method", "basis", "model"] as const;

/** Joules in a thermochemical kilocalorie. */
const J_PER_KCAL = 4184;

/** A member's value as a part (`PropertyPart`): as it was, an Add's parts with it. */
const partOf = (name: string, p: Property): PropertyPart => ({
  property: name,
  value: p.value as number,
  unit: p.unit,
  ...(p.at ? { at: p.at } : {}),
  ...(p.by ? { by: p.by } : {}),
  ...(p.parts ? { parts: p.parts } : {}),
});

/**
 * *Ensemble energy* on `entries`: *done*, the entry standing for each
 * group - its lowest - with the ensemble's value written under `as`;
 * *rest*, the other members, each saying whose ensemble it is in, and any
 * group whose ensemble cannot be worked out, each saying why.
 */
export function ensemble(entries: readonly Entry[], options: EnsembleOptions): NodeOutcome<"done" | "rest"> {
  const name = options.property.trim();
  const as = options.as.trim();
  if (!name) return { ok: false, said: "Name the value to take the ensemble of" };
  if (!as) return { ok: false, said: "Name what the ensemble's value is written as" };
  const done: Entry[] = [];
  const why = new Map<Entry, string>();
  const { groups, ungrouped } = options.within === "each group" ? inGroups(entries) : { groups: [entries.slice()], ungrouped: [] };
  for (const e of ungrouped) why.set(e, "it has no group to be taken with");
  for (const g of groups) {
    const out = groupEnsemble(g, name, as);
    if (typeof out === "string") {
      for (const e of g) why.set(e, out);
      continue;
    }
    done.push(out.stands);
    for (const e of g) if (e !== out.of) why.set(e, `in the ensemble of ${out.of.id}`);
  }
  const rest = entries.filter((e) => why.has(e)).map((e) => setAside(e, why.get(e)!));
  const said = `${done.length} ${done.length === 1 ? "ensemble" : "ensembles"} of ${count(entries.length)}${rest.length ? ` · rest ${rest.length} (${tally(rest)})` : ""}`;
  return { ok: true, exits: { done, rest }, said };
}

/** One group's ensemble: the entry standing for it - its lowest - with the value; or why it cannot be worked out. */
function groupEnsemble(g: readonly Entry[], name: string, as: string): { stands: Entry; of: Entry } | string {
  for (const e of g) {
    const w = unreadable(e.properties[name], name);
    if (w) return `its group's ${e.id} cannot be counted: ${w}`;
    if (as in e.properties) return `${e.id} has its own ${as} already`;
    if (!e.properties[name].at?.geometry) return `its group's ${e.id} has a ${name} of no geometry`;
  }
  const unlike = workedOutUnlike(g, name);
  if (unlike) return `its group's ${name} values ${unlike}, and are not taken together`;
  const unit = g[0].properties[name].unit;
  if (unit === "none") return `its ${name} has no unit: an energy is wanted`;
  const values: number[] = [];
  for (const e of g) {
    const v = numberIn(e, name, unit);
    if ("why" in v) return v.why;
    values.push(v.value);
  }
  // (one temperature, stated by every member: none assumed)
  const kelvins = g.map((e) => e.properties[name].at?.kelvin);
  if (kelvins.some((k) => k == null)) return `its group's ${name} values do not all say their temperature`;
  const kelvin = kelvins[0]!;
  if (kelvins.some((k) => k !== kelvin)) return `its group's ${name} values are of different temperatures`;
  // (a degeneracy that is said must be a count: one that is not sets the group aside, never read as 1)
  const degeneracies: number[] = [];
  for (const e of g) {
    const d = e.properties.degeneracy;
    if (d && (d.status !== "computed" || typeof d.value !== "number" || !Number.isFinite(d.value) || !(d.value > 0)))
      return `its group's ${e.id} has a degeneracy that is not a number above 0`;
    degeneracies.push(d ? (d.value as number) : 1);
  }
  // (in kcal/mol, R T: R = 8.314462618 J/(mol K) over 4184 J/kcal)
  const kcal = values.map((v) => convert(v, unit as Unit, "kcal/mol"));
  const low = Math.min(...kcal);
  const rt = (R_GAS * kelvin) / J_PER_KCAL;
  const sum = kcal.reduce((s, v, i) => s + degeneracies[i] * Math.exp(-(v - low) / rt), 0);
  const value = convert(low - rt * Math.log(sum), "kcal/mol", unit as Unit);
  const lowest = g[kcal.indexOf(low)];
  const first = lowest.properties[name];
  const agreed = <K extends "atm" | "solvent">(k: K) => {
    const all = g.map((e) => e.properties[name].at?.[k]);
    return all.every((x) => x === all[0]) && all[0] != null ? { [k]: all[0] } : {};
  };
  const n = g.length;
  // (the members' own level - program, method, basis, model - which they share, so that two ensembles at one level, of
  //  any sizes, are compared and summed as values worked out alike, and two at different levels are not; the count is
  //  the ensemble's own, never part of how it was worked out)
  const shared: By = {};
  for (const k of LEVEL) {
    const all = g.map((e) => e.properties[name].by?.[k]);
    if (all[0] != null && all.every((x) => x === all[0])) shared[k] = all[0];
  }
  const treatment = first.by?.treatment ?? "unknown";
  const property: Property = {
    value,
    unit,
    at: { geometry: first.at!.geometry, kelvin, ...agreed("atm"), ...agreed("solvent") },
    by: { ...shared, treatment: `ensemble, -R T ln Σ g exp(-${name}/R T), of ${treatment}` },
    parts: g.map((e) => partOf(name, e.properties[name])),
    ensemble: { of: n },
    status: "computed",
  };
  return { stands: { ...lowest, properties: { ...lowest.properties, [as]: property } }, of: lowest };
}

