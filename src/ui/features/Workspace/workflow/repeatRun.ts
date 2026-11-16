/**
 * A Repeat's passes, as far as they are its own and not its steps' (workflow/repeat): what each entry of a pass carries - the pass, its
 * variable's value, and how many times it has gone round - and what is left when the passes run out. Pure: the runner (store
 * `runRepeat`) puts *This pass* on the page, runs the steps inside, and reads what landed on *Again* and *Done*.
 */
import type { Property } from "../../../../lib/entry";
import type { Molecule3D } from "../store/types";
import { valueAt, type RepeatRead } from "./repeat";

/** The property each entry of a pass carries: which pass it is in, from 1. */
export const PASS = "pass";
/** The property that counts how many times an entry has gone round before this pass: 0 in its first. Rides with it, as a Tag's ID does. */
export const TIMES_ROUND = "times round";
/** What an entry carries that leaves a Repeat whose passes ran out while it still went round. */
export const RAN_OUT = "passes ran out";

/** A molecule's first frame's properties: those of each entry, as the steps inside read them. */
const propsOf = (m: Pick<Molecule3D, "properties">): Record<string, Property> => m.properties?.[0] ?? {};

/** A number property that rides with its entry (a label): of no geometry, kept through every step. */
const label = (value: number | string, unit: Property["unit"] = "none"): Property => ({ value, unit, status: "computed", label: true });

/**
 * Each entry of pass `pass`, as it goes into *This pass*: with its pass, its count of times round, and - where the Repeat has a
 * variable - its value: counted per entry, From and as many Steps as it has gone round; per pass, as many as the passes before. An
 * entry whose count runs past the values given (over values, counted per entry) has none: it is not in `go`, but in `spent`.
 */
export function passEntries<M extends Pick<Molecule3D, "properties">>(molecules: readonly M[], r: RepeatRead, pass: number): { go: M[]; spent: M[] } {
  const go: M[] = [];
  const spent: M[] = [];
  for (const m of molecules) {
    const was = propsOf(m)[TIMES_ROUND]?.value;
    // (gone round once more than it had, where it carries a count - else this is its first time)
    const count = r.counted === "pass" ? pass - 1 : typeof was === "number" ? was + 1 : 0;
    const value = r.variable ? valueAt(r.variable, count) : undefined;
    if (r.variable && value == null) {
      spent.push(m);
      continue;
    }
    const add: Record<string, Property> = {
      [PASS]: label(pass),
      [TIMES_ROUND]: label(count),
      ...(r.variable && value != null ? { [r.variable.name]: label(value, r.variable.unit) } : {}),
    };
    const frames = m.properties?.length ? m.properties : [{}];
    go.push({ ...m, properties: frames.map((p) => ({ ...p, ...add })) });
  }
  return { go, spent };
}

/** An entry that leaves by *Out* though it was still going round - the passes ran out, or its values did - marked so. */
export function ranOut<M extends Pick<Molecule3D, "properties">>(m: M): M {
  const frames = m.properties?.length ? m.properties : [{}];
  return { ...m, properties: frames.map((p) => ({ ...p, [RAN_OUT]: label("yes") })) };
}

/** Whether the Repeat has made its last pass: as many as it makes, or - until none goes again - nothing landed on *Again*. */
export function lastPass(r: RepeatRead, pass: number, again: number): boolean {
  if (r.repeat === "until" && again === 0) return true;
  return pass >= r.passes;
}
