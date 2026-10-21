/**
 * *Populations* (docs/WORKFLOWS-FOUNDATION.md, *Meno's own nodes*): each
 * entry's share within its group at a temperature, by Boltzmann's
 * distribution of the free energy G (`thermo.free-energy`), each counted as
 * many times as its degeneracy says, where every one in its group has one.
 *
 * Shares come from G, never from the electronic energy: an entry that has no
 * free energy goes out of the *failed* exit, saying so, and is never weighted
 * by another energy in its place. A group is weighted only when its free
 * energies can be added up in one sum - worked out at the node's temperature,
 * at one pressure, in one solvent, by one program, method, basis and thermal
 * treatment; else the whole group goes out of *failed*, each entry saying
 * why: shares of part of a group would be shares of something else.
 */
import { boltzmann } from "../boltzmann";
import type { Entry, Property } from "../entry";
import { failedWith, groups, inGroups, numberIn, PROPERTY, workedOutUnlike, type NodeOutcome } from "./base";

/** How near a free energy's temperature must be to the node's to be the same, in kelvin. */
const SAME_KELVIN = 1e-6;

export type PopulationsOptions = {
  /** The temperature, in kelvin. */
  kelvin: number;
};

/** Why an entry's own free energy cannot be weighted at `kelvin`, else nothing. */
function ownProblem(e: Entry, kelvin: number): string | null {
  const g = numberIn(e, PROPERTY.freeEnergy, "Eh");
  if ("why" in g) return e.properties[PROPERTY.freeEnergy] ? g.why : `it has no free energy (${PROPERTY.freeEnergy})${e.properties[PROPERTY.energy] ? ", only an electronic energy, which is not weighted in its place" : ""}`;
  const at = e.properties[PROPERTY.freeEnergy].at?.kelvin;
  if (at == null) return "its free energy does not say the temperature it was worked out at";
  if (Math.abs(at - kelvin) > SAME_KELVIN) return `its free energy is at ${at} K, not ${kelvin} K`;
  const d = e.properties[PROPERTY.degeneracy];
  if (d && (d.status !== "computed" || typeof d.value !== "number" || !(d.value > 0))) return "its degeneracy is not a number above 0";
  return null;
}

/** Why a group's free energies cannot be added up in one sum - two of them worked out differently - else nothing. */
function mixed(g: readonly Entry[]): string | null {
  const unlike = workedOutUnlike(g, PROPERTY.freeEnergy);
  if (unlike) return `its group's free energies ${unlike}`;
  const counted = g.filter((e) => e.properties[PROPERTY.degeneracy]).length;
  if (counted > 0 && counted < g.length) return `only ${counted} of the ${g.length} in its group have a degeneracy`;
  return null;
}

/** *Populations* on `entries`: *done*, each with its share (`population`) within its group; *failed*, each saying why. */
export function populations(entries: readonly Entry[], options: PopulationsOptions): NodeOutcome<"done" | "failed"> {
  const { kelvin } = options;
  if (!(Number.isFinite(kelvin) && kelvin > 0)) return { ok: false, said: "The temperature must be above 0 K" };
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  const shares = new Map<Entry, Property>();
  const failed = new Map<Entry, string>();
  const { groups: gs, ungrouped } = inGroups(entries);
  for (const e of ungrouped) failed.set(e, "it has no group to be weighted within");
  let weighted = 0;
  for (const g of gs) {
    const own = g.map((e) => ownProblem(e, kelvin));
    const k = own.findIndex((w) => w != null);
    const problem = k >= 0 ? null : mixed(g);
    if (k >= 0 || problem) {
      g.forEach((e, i) => failed.set(e, own[i] ?? problem ?? `another in its group could not be weighted (${g[k].id}: ${own[k]})`));
      continue;
    }
    weighted++;
    const energies = g.map((e) => (numberIn(e, PROPERTY.freeEnergy, "Eh") as { value: number }).value);
    const counted = g.every((e) => e.properties[PROPERTY.degeneracy]) ? g.map((e) => e.properties[PROPERTY.degeneracy].value as number) : undefined;
    const w = boltzmann(energies, kelvin, counted);
    g.forEach((e, i) => {
      const fe = e.properties[PROPERTY.freeEnergy];
      shares.set(e, { value: w[i], unit: "none", at: { ...fe.at!, kelvin }, ...(fe.by ? { by: { ...fe.by } } : {}), status: "computed" });
    });
  }
  const done = entries.filter((e) => shares.has(e)).map((e) => ({ ...e, properties: { ...e.properties, [PROPERTY.population]: shares.get(e)! } }));
  const out = entries.filter((e) => failed.has(e)).map((e) => failedWith(e, failed.get(e)!));
  const said = `Shares from free energy at ${kelvin} K · ${done.length} in ${groups(weighted)}${out.length ? ` · ${out.length} failed` : ""}`;
  return { ok: true, exits: { done, failed: out }, said };
}
