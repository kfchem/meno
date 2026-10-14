/**
 * The steps Meno does itself (docs/WORKFLOWS.md, *Who does a step*), on a
 * set's entries alone: *As conformers*, *Energy window*, *Duplicates*,
 * *Populations* and *Choose one* - written for Meno from the specification and the
 * published methods. Each takes the entries that came in and says which
 * it keeps, which it sets aside, and what it found; or why it could not.
 */
import { knownOf } from "../../../../lib/io/writers";
import type { OptionValues } from "../../../../lib/options";
import { compoundLetter, type SetEntry } from "./entries";
import { kindInfo, optionsOf, type SetKind, type StepKind } from "./kinds";
import { rmsd } from "./rmsd";
import { least } from "../../../../lib/chem/lists";

/** Kilocalories per mole in a hartree (CODATA 2018). */
export const KCAL_PER_HARTREE = 627.5094740631;
/** The gas constant in hartrees per kelvin: R over the joules per mole in a hartree (CODATA 2018). */
const R_HARTREE = 8.314462618 / 2625499.6;

/** What a step did: the entries it kept - with their shares, where it found them - and those it set aside, as a set that holds `holds`; or why it could not. */
export type Outcome =
  | { ok: true; holds: SetKind; kept: SetEntry[]; aside: SetEntry[]; shares?: number[]; said: string }
  | { ok: false; said: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A Meno step of `kind` on `entries`, of a set that holds `holds`, with its options (over its kind's defaults) - and what their energies are, where it ranks by them (`energiesBy`). */
export function runMeno(kind: StepKind, entries: readonly SetEntry[], holds: SetKind, own?: OptionValues, energiesBy?: string): Outcome {
  if (!entries.length) return { ok: false, said: "Nothing came in" };
  const options = optionsOf(kindInfo(kind).options ?? [], own);
  switch (kind) {
    case "as-conformers":
      return asConformers(entries);
    case "energy-window":
      return energyWindow(entries, Number(options.window));
    case "duplicates":
      return duplicates(entries, holds, Number(options.rmsd));
    case "populations":
      return populations(entries, Number(options.temperature));
    case "choose":
      return chooseOne(entries, options.which === "number" ? Number(options.number) : null, energiesBy);
    default:
      return { ok: false, said: "Meno does not do this itself" };
  }
}

/**
 * Whether two entries are of the same constitution: the same atoms, in the
 * same order, bonded the same way - and of the same charge and spin, as the
 * programs are told them (lib/io/writers `knownOf`), so that a triplet is
 * never a conformer of its singlet.
 */
export function constitutionOf(e: Pick<SetEntry, "atoms" | "bonds">): string {
  const atoms = e.atoms.map((a) => `${a.el}${a.charge ? `(${a.charge})` : ""}`).join(" ");
  const bonds = e.bonds
    .map((b) => `${Math.min(b.a1, b.a2)}-${Math.max(b.a1, b.a2)}:${b.order}`)
    .sort()
    .join(" ");
  return `${atoms}|${bonds}|${speciesOf(e)}`;
}

/** An entry's charge and spin multiplicity, as the programs are told them (lib/io/writers `knownOf`): entries that differ in them are different species. */
function speciesOf(e: Pick<SetEntry, "atoms">): string {
  const { charge, multiplicity } = knownOf({
    atoms: e.atoms.map((a) => ({ el: a.el, x: 0, y: 0, z: 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}) })),
    bonds: [],
  });
  return `${charge} ${multiplicity}`;
}

/** A compound set as a conformer set: entries of the same constitution as conformers of one compound, numbered in the order they came. */
function asConformers(entries: readonly SetEntry[]): Outcome {
  const groups = new Map<string, SetEntry[]>();
  for (const e of entries) {
    const key = constitutionOf(e);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const kept = [...groups.values()].flatMap((g, compound) => g.map((e, i) => ({ ...e, compound, number: i + 1 })));
  return { ok: true, holds: "conformers", kept, aside: [], said: `${plural(groups.size, "compound")} · ${kept.length}` };
}

/** The entries of each compound, in the order they came. */
function byCompound(entries: readonly SetEntry[]): SetEntry[][] {
  const out = new Map<number, SetEntry[]>();
  for (const e of entries) out.set(e.compound, [...(out.get(e.compound) ?? []), e]);
  return [...out.values()];
}

const NO_ENERGY: Outcome = { ok: false, said: "Not every entry has an energy" };

/** Each compound's conformers within `kcal` of its lowest; the rest set aside. */
function energyWindow(entries: readonly SetEntry[], kcal: number): Outcome {
  if (entries.some((e) => e.energy == null)) return NO_ENERGY;
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  for (const g of byCompound(entries)) {
    const lowest = least(g.map((e) => e.energy!));
    for (const e of g) ((e.energy! - lowest) * KCAL_PER_HARTREE <= kcal + 1e-9 ? kept : aside).push(e);
  }
  return { ok: true, holds: "conformers", kept, aside, said: `${kept.length} of ${entries.length} kept` };
}

/**
 * Each entry unlike the others kept: an entry as near as `most` (RMSD, in
 * ångströms, after the best fit) to one kept before it is set aside. Taken
 * lowest energy first where all have one, else in order. In a conformer
 * set they are compared within each compound; in a compound set, each
 * with those of the same atoms in the same order - a structure there
 * twice is the same structure, not two compounds. Never two of different
 * charge or spin: they are different species, however alike in shape.
 */
function duplicates(entries: readonly SetEntry[], holds: SetKind, most: number): Outcome {
  const keyOf = (e: SetEntry) => `${holds === "conformers" ? `#${e.compound}` : atomsOf(e)}|${speciesOf(e)}`;
  const groups = [...entries.reduce((m, e) => m.set(keyOf(e), [...(m.get(keyOf(e)) ?? []), e]), new Map<string, SetEntry[]>()).values()];
  const energies = entries.every((e) => e.energy != null);
  const keptSet = new Set<SetEntry>();
  for (const g of groups) {
    const order = energies ? [...g].sort((p, q) => p.energy! - q.energy!) : g;
    const kept: SetEntry[] = [];
    for (const e of order) {
      if (kept.some((k) => rmsd(k.xyz, e.xyz) <= most)) continue;
      kept.push(e);
      keptSet.add(e);
    }
  }
  // (in the order they came)
  const kept = entries.filter((e) => keptSet.has(e));
  const aside = entries.filter((e) => !keptSet.has(e));
  return { ok: true, holds, kept, aside, said: `${kept.length} of ${entries.length} kept` };
}

const atomsOf = (e: SetEntry) => e.atoms.map((a) => a.el).join(" ");

/** Each conformer's Boltzmann population within its compound at `kelvin`. */
function populations(entries: readonly SetEntry[], kelvin: number): Outcome {
  if (entries.some((e) => e.energy == null)) return NO_ENERGY;
  const shares = new Map<SetEntry, number>();
  for (const g of byCompound(entries)) {
    // (each counted as many times as its conformer search found it alike, where it said: as CREST's own weights are)
    const w = boltzmann(g.map((e) => e.energy!), kelvin, g.every((e) => e.degeneracy != null) ? g.map((e) => e.degeneracy!) : undefined);
    g.forEach((e, i) => shares.set(e, w[i]));
  }
  const compounds = byCompound(entries).length;
  return {
    ok: true,
    holds: "conformers",
    kept: [...entries],
    aside: [],
    shares: entries.map((e) => shares.get(e)!),
    said: `${plural(compounds, "compound")} at ${kelvin} K`,
  };
}

/**
 * One conformer of each compound, chosen on purpose (docs/WORKFLOWS.md,
 * *Kinds of step*): its lowest in energy - or, given `number`, the one of
 * that number - as a compound of its own; the rest set aside. What it says
 * names the one chosen, of how many, and what the energies it was ranked
 * by are (`by`: the program and method that worked them out).
 */
function chooseOne(entries: readonly SetEntry[], number: number | null, by?: string): Outcome {
  if (number == null && entries.some((e) => e.energy == null)) return NO_ENERGY;
  const kept: SetEntry[] = [];
  const aside: SetEntry[] = [];
  const groups = byCompound(entries);
  for (const g of groups) {
    const chosen = number == null ? g.reduce((a, b) => (b.energy! < a.energy! ? b : a)) : g.find((e) => e.number === number);
    if (!chosen) return { ok: false, said: `${compoundLetter(g[0].compound)} has no conformer ${number}` };
    kept.push({ ...chosen, compound: kept.length });
    aside.push(...g.filter((e) => e !== chosen));
  }
  const which = number == null ? "lowest" : "chosen";
  const said =
    groups.length === 1 ? `#${kept[0].number} of ${entries.length}, ${which}` : `${plural(groups.length, "compound")}, each its ${number == null ? "lowest" : `#${number}`}`;
  return { ok: true, holds: "molecules", kept, aside, said: by && number == null ? `${said} · ${by}` : said };
}

/**
 * Boltzmann populations at `kelvin`, from energies in hartrees: each
 * weighed by its degeneracy where given - the forms of it alike, each as
 * likely - the shares adding up to one.
 */
export function boltzmann(energies: readonly number[], kelvin: number, degeneracies?: readonly number[]): number[] {
  if (!energies.length) return [];
  const lowest = least(energies);
  const w = energies.map((e, i) => (degeneracies?.[i] ?? 1) * Math.exp(-(e - lowest) / (R_HARTREE * kelvin)));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}
