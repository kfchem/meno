/**
 * The steps Meno does itself (docs/WORKFLOWS.md, *Who does a step*), on a
 * set's entries alone: *As conformers*, *Energy window*, *Duplicates*,
 * *Populations* and *Choose one* - written for Meno from the specification and the
 * published methods. Each takes the entries that came in and says which
 * it keeps, which it sets aside, and what it found; or why it could not.
 */
import { speciesOf as speciesBy } from "../../../../lib/io/writers";
import type { OptionValues } from "../../../../lib/options";
import { compoundLetter, type SetEntry } from "./entries";
import { kindInfo, optionsOf, type SetKind, type StepKind } from "./kinds";
import { rmsd } from "./rmsd";
import { least } from "../../../../lib/chem/lists";
import { boltzmann } from "../../../../lib/boltzmann";
import { factor } from "../../../../lib/units";

/** Kilocalories per mole in a hartree (Meno's units table). */
const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

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
      return drain(duplicates(entries, holds, Number(options.rmsd), never));
    case "populations":
      return populations(entries, Number(options.temperature));
    case "choose":
      return chooseOne(entries, options.which === "number" ? Number(options.number) : null, energiesBy);
    default:
      return { ok: false, said: "Meno does not do this itself" };
  }
}

/**
 * How a step done in turns goes: each turn as long as `slice` by the clock
 * `now` (milliseconds), the turns let go between (`pause`), told how many
 * entries it has been through at most every `tell` (`onDone`), and given
 * up where it is `stopped`.
 */
export type Turns = { onDone?: (done: number) => void; pause?: () => Promise<void>; slice?: number; tell?: number; now?: () => number; stopped?: () => boolean };

/**
 * `runMeno`, Duplicates done in turns that let the page go on between them
 * - thousands of conformers alike take seconds - saying after each how
 * many entries it has been through, and given up between two where it is
 * stopped: null. The other steps take no time to speak of, and are done
 * at once.
 */
export async function runMenoInTurns(kind: StepKind, entries: readonly SetEntry[], holds: SetKind, own?: OptionValues, energiesBy?: string, how: Turns = {}): Promise<Outcome | null> {
  if (kind !== "duplicates" || !entries.length) return runMeno(kind, entries, holds, own, energiesBy);
  const options = optionsOf(kindInfo(kind).options ?? [], own);
  const now = how.now ?? (() => performance.now());
  const least = how.slice ?? TURN_MS;
  let slice = least;
  let began = now();
  let told = began;
  const turns = duplicates(entries, holds, Number(options.rmsd), () => now() - began >= slice);
  for (;;) {
    const turn = turns.next();
    if (turn.done) return turn.value;
    // (said at most so often: each saying draws the card again)
    if (now() - told >= (how.tell ?? TELL_MS)) {
      how.onDone?.(turn.value);
      told = now();
    }
    const left = now();
    await (how.pause ?? nextTurn)();
    if (how.stopped?.()) return null;
    began = now();
    // (the page's own turn taken into account - a frame drawn, say: each slice at least four times as long as it took, so that the work has four fifths of the time, up to TURN_MOST_MS, the page still answering within a frame or three)
    slice = Math.min(TURN_MOST_MS, Math.max(least, 4 * (began - left)));
  }
}

/** How long a turn of Duplicates' is before it lets the page go on, at least and at most, and how often at most it says how far it is, in milliseconds. */
export const TURN_MS = 11;
export const TURN_MOST_MS = 50;
export const TELL_MS = 100;

/**
 * The next turn of the page's - what waits to be drawn, or pointed at,
 * done first - by a message posted to itself: a timer of nought, set again
 * and again, is held to four milliseconds at the least, and the turns cost
 * more than the work.
 */
const nextTurn = () =>
  new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });

/** What work done in turns comes to, done all at once. */
function drain<T>(turns: Generator<number, T>): T {
  for (;;) {
    const turn = turns.next();
    if (turn.done) return turn.value;
  }
}

/**
 * Whether two entries are of the same constitution: the same atoms, in the
 * same order, bonded the same way - and of the same charge and spin, as the
 * programs are told them (lib/io/writers `speciesOf`), so that a triplet is
 * never a conformer of its singlet.
 */
export function constitutionOf(e: Pick<SetEntry, "atoms" | "bonds" | "charge" | "multiplicity">): string {
  const atoms = e.atoms.map((a) => `${a.el}${a.charge ? `(${a.charge})` : ""}`).join(" ");
  const bonds = e.bonds
    .map((b) => `${Math.min(b.a1, b.a2)}-${Math.max(b.a1, b.a2)}:${b.order}`)
    .sort()
    .join(" ");
  return `${atoms}|${bonds}|${speciesOf(e)}`;
}

/**
 * An entry's charge and spin multiplicity, as the programs are told them
 * (lib/io/writers `speciesOf`): what a calculation it was read from said,
 * else what its atoms say. Entries that differ in them are different
 * species - an anion read from a calculation is no conformer of its neutral.
 */
function speciesOf(e: Pick<SetEntry, "atoms" | "charge" | "multiplicity">): string {
  const atoms = e.atoms.map((a) => ({ el: a.el, x: 0, y: 0, z: 0, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}) }));
  const { charge, multiplicity } = speciesBy({ atoms, bonds: [] }, e);
  return `${charge} ${multiplicity}`;
}

/**
 * `value` added to the group of `key` in `groups`, in place, and the groups
 * given back: grouping thousands of entries copied each group again for
 * every entry put in it, and took seconds at 20,000.
 */
export function pushTo<K, V>(groups: Map<K, V[]>, key: K, value: V): Map<K, V[]> {
  const group = groups.get(key);
  if (group) group.push(value);
  else groups.set(key, [value]);
  return groups;
}

/** A compound set as a conformer set: entries of the same constitution as conformers of one compound, numbered in the order they came. */
function asConformers(entries: readonly SetEntry[]): Outcome {
  const groups = new Map<string, SetEntry[]>();
  for (const e of entries) pushTo(groups, constitutionOf(e), e);
  const kept = [...groups.values()].flatMap((g, compound) => g.map((e, i) => ({ ...e, compound, number: i + 1 })));
  return { ok: true, holds: "conformers", kept, aside: [], said: `${plural(groups.size, "compound")} · ${kept.length}` };
}

/** The entries of each compound, in the order they came. */
function byCompound(entries: readonly SetEntry[]): SetEntry[][] {
  const out = new Map<number, SetEntry[]>();
  for (const e of entries) pushTo(out, e.compound, e);
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
function* duplicates(entries: readonly SetEntry[], holds: SetKind, most: number, due: () => boolean): Generator<number, Outcome> {
  const keyOf = (e: SetEntry) => `${holds === "conformers" ? `#${e.compound}` : atomsOf(e)}|${speciesOf(e)}`;
  const groups = [...entries.reduce((m, e) => pushTo(m, keyOf(e), e), new Map<string, SetEntry[]>()).values()];
  const energies = entries.every((e) => e.energy != null);
  const keptSet = new Set<SetEntry>();
  let before = 0;
  for (const g of groups) {
    const turns = keptApartInTurns(energies ? [...g].sort((p, q) => p.energy! - q.energy!) : g, most, rmsd, due);
    for (;;) {
      const turn = turns.next();
      if (turn.done) {
        for (const e of turn.value) keptSet.add(e);
        break;
      }
      yield before + turn.value;
    }
    before += g.length;
  }
  // (in the order they came)
  const kept = entries.filter((e) => keptSet.has(e));
  const aside = entries.filter((e) => !keptSet.has(e));
  return { ok: true, holds, kept, aside, said: `${kept.length} of ${entries.length} kept` };
}

const atomsOf = (e: SetEntry) => e.atoms.map((a) => a.el).join(" ");

/**
 * Of `order` - entries of the same atoms in the same order - those kept,
 * each unlike every one kept before it: its RMSD after the best fit to
 * each above `most`. Each is laid over only those kept that could be
 * within `most` of it, by two bounds the RMSD is never below (its atoms
 * taken in their own order, rmsd.ts): the difference of their radii of
 * gyration, and, atom by atom, of their distances from their middles - so
 * none alike is missed. Laid over every one kept, thousands of distinct
 * conformers took minutes. `measure` is the RMSD (counted, in a test).
 */
export function keptApart(order: readonly SetEntry[], most: number, measure: (p: readonly number[], q: readonly number[]) => number = rmsd): SetEntry[] {
  return drain(keptApartInTurns(order, most, measure, never));
}

/** A turn that is never over: work done at once. */
const never = () => false;

/** `keptApart`, in turns, each over once it is `due`: after each, how many of `order` it has been through. */
function* keptApartInTurns(order: readonly SetEntry[], most: number, measure: (p: readonly number[], q: readonly number[]) => number, due: () => boolean): Generator<number, SetEntry[]> {
  // (bounds worked out in floating point, given a hair's room: one alike by a hair is never passed over)
  const reach = most + 1e-9;
  const kept: { e: SetEntry; radii: Float64Array; rg: number }[] = [];
  const out: SetEntry[] = [];
  // (the first kept whose radius of gyration is at least `rg`: those kept are in that order)
  const from = (rg: number) => {
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (kept[mid].rg < rg) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const [done, e] of order.entries()) {
    if (done > 0 && due()) yield done;
    const shape = shapeOf(e.xyz);
    let alike = false;
    for (let j = from(shape.rg - reach); j < kept.length && kept[j].rg <= shape.rg + reach && !alike; j++) {
      const k = kept[j];
      if (apartAtLeast(k.radii, shape.radii) > reach) continue;
      alike = measure(k.e.xyz, e.xyz) <= most;
    }
    if (alike) continue;
    kept.splice(from(shape.rg), 0, { e, ...shape });
    out.push(e);
  }
  return out;
}

/** A geometry's atoms' distances from its middle, in their order, and its radius of gyration. */
function shapeOf(xyz: readonly number[]): { radii: Float64Array; rg: number } {
  const n = xyz.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += xyz[3 * i];
    cy += xyz[3 * i + 1];
    cz += xyz[3 * i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const radii = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(xyz[3 * i] - cx, xyz[3 * i + 1] - cy, xyz[3 * i + 2] - cz);
    radii[i] = r;
    sum += r * r;
  }
  return { radii, rg: n ? Math.sqrt(sum / n) : 0 };
}

/** The least RMSD two geometries could have after any fit, from their atoms' distances from their middles: each atom at least as far from its fellow as their distances differ. */
function apartAtLeast(p: Float64Array, q: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) sum += (p[i] - q[i]) ** 2;
  return p.length ? Math.sqrt(sum / p.length) : 0;
}

/** Each conformer's Boltzmann population within its compound at `kelvin`. */
function populations(entries: readonly SetEntry[], kelvin: number): Outcome {
  if (entries.some((e) => e.energy == null)) return NO_ENERGY;
  // (at 0 K or below there are no shares to give: all would be 0/0, or the highest energy the most)
  if (!(kelvin > 0)) return { ok: false, said: "The temperature must be above 0 K" };
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

