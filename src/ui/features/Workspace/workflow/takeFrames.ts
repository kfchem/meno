/**
 * *Take frames* (Meno's; docs/WORKFLOWS.md, *Kinds of step*): from molecules
 * with frames - a path a step found, an optimisation's way down, a scan -
 * the frames asked for, each as a molecule of its one geometry: the highest
 * in energy, the first, the last, its entry frame (what a set takes of it
 * otherwise), or the highest and those either side of it. Each keeps all
 * its frame held - its energy, its marks, its properties - and the molecule
 * it was a frame of. Nothing is chosen where it cannot be told: the highest
 * of a molecule whose frames do not all have an energy is refused, naming
 * it, never the highest of those that do.
 */
import type { Molecule3D } from "../store/types";
import { framesOf, setEntries } from "./entries";
import type { Outcome3D } from "./meno";

export type Which = "highest" | "first" | "last" | "entry" | "around";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What Take frames takes, in words, as its card and its line say it. */
export function takeFramesHow(which: Which, either: number): string {
  switch (which) {
    case "highest":
      return "The highest in energy";
    case "first":
      return "The first";
    case "last":
      return "The last";
    case "entry":
      return "Each one's entry frame";
    case "around":
      return `The highest in energy and ${plural(either, "frame")} either side`;
  }
}

/** A molecule as a step's line names it: its title, its name, or its place among those that came in. */
const named = (m: Molecule3D, i: number) => m.title || m.name || `molecule ${i + 1}`;

/** Of `molecules`, the frames `which` asks for, each a molecule of one geometry; or why none can be taken. */
export function takeFrames(molecules: readonly Molecule3D[], which: Which, either = 1): Outcome3D {
  if (!molecules.length) return { ok: false, said: "Nothing came in" };
  if (which === "around" && !(Number.isInteger(either) && either >= 1)) return { ok: false, said: "Either side must be 1 frame or more" };
  const byEnergy = which === "highest" || which === "around";
  // (the highest, of a molecule whose frames do not all have one, cannot be told: refused, every such molecule named)
  if (byEnergy) {
    const without = molecules.flatMap((m, i) => {
      const n = framesOf(m);
      return m.energies?.length === n && m.energies.every(Number.isFinite) ? [] : [named(m, i)];
    });
    if (without.length) return { ok: false, said: `Not every frame of ${without.join(", ")} has an energy: the highest cannot be told` };
  }
  const highest = (m: Molecule3D) => m.energies!.reduce((h, e, k) => (e > m.energies![h] ? k : h), 0);
  const chosen = (m: Molecule3D): number[] => {
    const n = framesOf(m);
    switch (which) {
      case "highest":
        return [highest(m)];
      case "first":
        return [0];
      case "last":
        return [n - 1];
      case "entry":
        // (as a set takes it: a path's last, an opened optimisation's or scan's converged ones, else each)
        return m.path ? [n - 1] : (m.entryFrames ?? Array.from({ length: n }, (_, k) => k));
      case "around": {
        const h = highest(m);
        return Array.from({ length: n }, (_, k) => k).filter((k) => Math.abs(k - h) <= either);
      }
    }
  };
  const kept = setEntries(molecules, "molecules", chosen);
  return { ok: true, holds: "molecules", kept, aside: [], said: `${plural(kept.length, "frame")} of ${plural(molecules.length, "molecule")}: ${takeFramesHow(which, either).toLowerCase()}` };
}
