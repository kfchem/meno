/**
 * *Take frames* (Meno's; docs/WORKFLOWS.md, *Kinds of step*): from molecules
 * with frames - a path a step found, an optimisation's way down, a scan -
 * the frames asked for, each as a molecule of its one geometry: the highest
 * in energy, the first, the last, its entry frame (what a set takes of it
 * otherwise), or the highest and those either side of it. Each keeps all
 * its frame held - its energy, its marks, its properties - and the molecule
 * it was a frame of. Nothing is chosen where it cannot be told: the highest
 * of a molecule whose frames do not all have an energy is refused, naming
 * it, never the highest of those that do. Nothing is chosen silently
 * either: where frames are equally high, the first is taken, and the line
 * says which were. A path search's molecule's highest is the point it
 * refined (`refinedFrame`), as its frame says it is - whatever image may
 * stand higher - and the step's line says so.
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

/** What a path search writes on each of its path's frames (ORCA's worker: `PATH_FRAME`), and on the point it refined. */
export const PATH_FRAME = "path.frame";
export const REFINED_SAID = "highest point refined";

/** Of a path search's molecule, the frame that is the point it refined, as its frames say; none for any other molecule. */
export function refinedFrame(m: Pick<Molecule3D, "calc">): number | null {
  const said = m.calc?.results?.find((r) => r.id === PATH_FRAME && r.on === "frames");
  if (!said || said.on !== "frames") return null;
  const k = said.values.indexOf(REFINED_SAID);
  return k >= 0 && said.values.lastIndexOf(REFINED_SAID) === k ? k : null;
}

/** A molecule as a step's line names it: its title, its name, or its place among those that came in. */
const named = (m: Molecule3D, i: number) => m.title || m.name || `molecule ${i + 1}`;

/** Of `molecules`, the frames `which` asks for, each a molecule of one geometry; or why none can be taken. */
export function takeFrames(molecules: readonly Molecule3D[], which: Which, either = 1): Outcome3D {
  if (!molecules.length) return { ok: false, said: "Nothing came in" };
  if (which === "around" && !(Number.isInteger(either) && either >= 1)) return { ok: false, said: "Either side must be a whole number of frames, 1 or more" };
  const byEnergy = which === "highest" || which === "around";
  // (the highest, of a molecule whose frames do not all have one, cannot be told: refused, every such molecule named)
  if (byEnergy) {
    const without = molecules.flatMap((m, i) => {
      const n = framesOf(m);
      return m.energies?.length === n && m.energies.every(Number.isFinite) ? [] : [named(m, i)];
    });
    if (without.length) return { ok: false, said: `Not every frame of ${without.join(", ")} has an energy: the highest cannot be told` };
  }
  // (the highest: a path search's point refined, where it is one - else the frame of the highest energy)
  const highest = (m: Molecule3D) => refinedFrame(m) ?? m.energies!.reduce((h, e, k) => (e > m.energies![h] ? k : h), 0);
  // (frames equally high - the first taken - said, each molecule named, its frames counted from 1; a path search's point refined is none of them)
  const ties = byEnergy
    ? molecules.flatMap((m, i) => {
        if (refinedFrame(m) != null) return [];
        const top = m.energies![highest(m)];
        const at = m.energies!.flatMap((e, k) => (e === top ? [k + 1] : []));
        return at.length > 1 ? [` · frames ${at.slice(0, -1).join(", ")} and ${at[at.length - 1]} of ${named(m, i)} are equally high: the first is taken`] : [];
      })
    : [];
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
  const refined = byEnergy ? molecules.filter((m) => refinedFrame(m) != null).length : 0;
  const said = `${plural(kept.length, "frame")} of ${plural(molecules.length, "molecule")}: ${takeFramesHow(which, either).toLowerCase()}`;
  return { ok: true, holds: "molecules", kept, aside: [], said: `${refined ? `${said} (of ${refined === molecules.length ? "each" : plural(refined, "path search")}, its ${REFINED_SAID})` : said}${ties.join("")}` };
}
