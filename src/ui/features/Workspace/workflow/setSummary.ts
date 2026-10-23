/**
 * A large result set summed up in its frame (docs/WORKFLOWS-FOUNDATION.md,
 * *What a set shows*: more than 50 entries, "a grid of a sample of its
 * structures ... and histograms of the properties chosen"): which of its
 * molecules are drawn, and how its entries' energies spread - each said with
 * how many it is of, what it is of, and what worked it out.
 */
import { factor } from "../../../../lib/units";
import type { Molecule3D } from "../store/types";
import { compoundLetter, framesOf } from "./entries";
import { energiesFrom } from "./setTable";

/** How many of a set's structures its frame draws: a grid of four by three. */
export const SAMPLE = 12;

/** One structure the frame draws: the set's molecule, by its place, and the frame of it drawn. */
export type Sampled = { molecule: number; frame: number };

/** What of a molecule in 3D the summary reads. */
type Of3D = Pick<Molecule3D, "frames" | "path" | "energies" | "calc" | "made" | "partOf" | "failed" | "marksUnread" | "numbers">;

/**
 * The structures a large set's frame draws, and what they are of: in a
 * conformer set, each compound once - its first conformer, since a drawing
 * shows its constitution and configuration, which its conformers share -
 * the first `SAMPLE` compounds in the step's order; in a set of molecules,
 * the first `SAMPLE` molecules, each as it ends (a path, its last frame).
 */
export function sampleOf(molecules: readonly Of3D[], holds: "molecules" | "conformers"): { picks: Sampled[]; of: number; said: string } {
  const picks = molecules.slice(0, SAMPLE).map((m, i) => ({ molecule: i, frame: holds === "conformers" || !m.path ? 0 : framesOf(m) - 1 }));
  const n = molecules.length;
  const noun = holds === "conformers" ? (n === 1 ? "compound" : "compounds") : n === 1 ? "molecule" : "molecules";
  const said =
    picks.length === n ? `${holds === "conformers" ? "Each compound" : "Each molecule"}, drawn once` : `The first ${picks.length} of ${n.toLocaleString("en-US")} ${noun}, in the step's order${holds === "conformers" ? ", each drawn once" : ""}`;
  return { picks, of: n, said };
}

/** Kilocalories per mole in a hartree (Meno's units table: CODATA 2018). */
const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/**
 * How many bins a histogram of `n` values has: Sturges's rule, the number
 * of bits it takes to count them and one more - ⌈log₂ n⌉ + 1 (H. A.
 * Sturges, "The choice of a class interval", J. Am. Stat. Assoc. 21 (1926)
 * 65-66). One, for a single value.
 */
export function sturges(n: number): number {
  return n <= 1 ? 1 : Math.ceil(Math.log2(n)) + 1;
}

/** One bar of a histogram: the values in [from, to) - the last bar's `to` taken in too - and how many there are. */
export type Bin = { from: number; to: number; count: number };

/** `values` counted into `sturges(n)` bins of one width from the least to the greatest: all in one, where they are all one value. A value that is no finite number is in no bin - its caller counts it, and says so. */
export function binned(given: readonly number[]): Bin[] {
  const values = given.filter(Number.isFinite);
  if (!values.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = hi > lo ? sturges(values.length) : 1;
  const w = hi > lo ? (hi - lo) / k : 0;
  const bins: Bin[] = Array.from({ length: k }, (_, i) => ({ from: lo + i * w, to: i === k - 1 ? hi : lo + (i + 1) * w, count: 0 }));
  for (const v of values) bins[w > 0 ? Math.min(k - 1, Math.floor((v - lo) / w)) : 0].count++;
  return bins;
}

/**
 * A large set's entries as a histogram: in a conformer set, each
 * conformer's energy above its compound's lowest, in kcal/mol - each
 * counted once, as the set holds it - of those whose energies one method
 * worked out: the method most of them were worked out by, said (the first
 * of those as many, in the step's order). Those by another, by a method
 * not stated - two such may be two methods - those with no usable
 * energy (none, or no finite number), and those of a compound only a part
 * of whose conformers is here (`partOf`: its lowest may not be among
 * them), counted and said, not drawn. In a set
 * of molecules, none: the energies of different compounds are not set
 * against one another.
 */
export type Chart =
  | {
      quantity: string;
      unit: string;
      by: string;
      bins: Bin[];
      counted: number;
      /** Entries left out of it, and why. */
      left: { count: number; why: string }[];
    }
  | { none: string };

export function chartOf(molecules: readonly Of3D[], holds: "molecules" | "conformers"): Chart {
  if (holds !== "conformers") return { none: "No energies charted: they are of different compounds" };
  let without = 0;
  let unstated = 0;
  let parts = 0;
  // (each compound's usable energies - finite numbers - and what worked them out: of those that finished alone - one
  //  that failed, or whose marks did not read, left out and named, never a compound's lowest)
  const compounds: { from: string; energies: number[] }[] = [];
  const unfinished: string[] = [];
  for (const [i, m] of molecules.entries()) {
    const n = framesOf(m);
    const finished = (f: number) => !m.marksUnread && !(m.failed?.length === n && m.failed[f]);
    for (let f = 0; f < n; f++) if (!finished(f)) unfinished.push(`${compoundLetter(i)} #${m.numbers?.[f] ?? f + 1}`);
    const all = m.energies?.length === n ? m.energies : [];
    const energies = all.filter((e, f) => Number.isFinite(e) && finished(f));
    // (of those that finished, each with no usable energy: none, or no finite number)
    for (let f = 0; f < n; f++) if (finished(f) && !Number.isFinite(all[f])) without++;
    if (!energies.length) continue;
    // (only a part of a search's conformers: its lowest may not be among them, so nothing is above it - counted, not charted)
    if (m.partOf) {
      parts += energies.length;
      continue;
    }
    const from = energiesFrom(m);
    if (!from) {
      unstated += energies.length;
      continue;
    }
    compounds.push({ from, energies });
  }
  // (the method most were worked out by - the first of those as many)
  const tally = new Map<string, number>();
  for (const c of compounds) tally.set(c.from, (tally.get(c.from) ?? 0) + c.energies.length);
  let by: string | undefined;
  for (const [from, k] of tally) if (by == null || k > tally.get(by)!) by = from;
  const values: number[] = [];
  let other = 0;
  for (const c of compounds) {
    if (c.from !== by) {
      other += c.energies.length;
      continue;
    }
    // (a compound's energies, worked out one way: its lowest among them, each above it)
    let lowest = Infinity;
    for (const e of c.energies) if (e < lowest) lowest = e;
    for (const e of c.energies) values.push((e - lowest) * KCAL_PER_HARTREE);
  }
  const failedSaid = unfinished.length ? `failed or not known to have finished (${unfinished.slice(0, 6).join(", ")}${unfinished.length > 6 ? ", ..." : ""})` : "";
  if (!values.length && unfinished.length && !compounds.length && !unstated && !parts) return { none: `No energies charted: none finished - ${unfinished.length} ${failedSaid}` };
  if (!values.length) return { none: unstated ? "No energies charted: what worked them out is not stated" : parts ? "No energies charted: each compound is only a part of a search's conformers" : "No energies to chart" };
  const left = [
    ...(other ? [{ count: other, why: "worked out another way" }] : []),
    ...(unstated ? [{ count: unstated, why: "worked out by a method not stated" }] : []),
    ...(without ? [{ count: without, why: "with no usable energy" }] : []),
    ...(unfinished.length ? [{ count: unfinished.length, why: failedSaid }] : []),
    ...(parts ? [{ count: parts, why: "of a compound only a part of whose conformers is here" }] : []),
  ];
  return { quantity: "ΔE above each compound's lowest", unit: "kcal/mol", by: by!, bins: binned(values), counted: values.length, left };
}
