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
 *
 * What its molecule holds besides - a name Tag gave it, a value a step
 * worked out for it - is of that molecule, on its entry frame, and a frame
 * taken keeps none of it unless asked: *Keep from its molecule* names the
 * properties each frame takes from it, as they are (none, unless named).
 * A frame that holds one of them itself keeps its own, and the step's line
 * says so, once.
 */
import type { Property } from "../../../../lib/entry";
import type { Molecule3D } from "../store/types";
import { framesOf, refinedFrame, REFINED_SAID, setEntries } from "./entries";
import type { Outcome3D } from "./meno";

export type Which = "highest" | "first" | "last" | "entry" | "around";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The properties *Keep from its molecule* names, one to a line: each once, in order, blank lines none. */
export function keptNames(text: string): string[] {
  return [...new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))];
}

/** Names in words, the last two joined by "and": "path", "path and species", "path, species and pc". */
const andList = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? ""));

/** What Take frames takes, in words, as its card and its line say it (after its name, so beginning small) - and what it keeps from each frame's molecule, where it keeps any. */
export function takeFramesHow(which: Which, either: number, keep: readonly string[] = []): string {
  const how = takenHow(which, either);
  return keep.length ? `${how}, keeping its molecule's ${andList(keep)}` : how;
}

function takenHow(which: Which, either: number): string {
  switch (which) {
    case "highest":
      return "the highest in energy";
    case "first":
      return "the first";
    case "last":
      return "the last";
    case "entry":
      return "each one's entry frame";
    case "around":
      return `the highest in energy and ${plural(either, "frame")} either side`;
  }
}

// (a path search's point refined, as its frames say: ./entries, where its calculation is put on that frame)
export { PATH_FRAME, REFINED_SAID, refinedFrame } from "./entries";

/** A molecule as a step's line names it: its title, its name, or its place among those that came in. */
const named = (m: Molecule3D, i: number) => m.title || m.name || `molecule ${i + 1}`;

/**
 * A molecule's own values, by their names: those on its entry frame, the one a set takes of it - a path's last,
 * else its one entry frame, else its one frame. None where it has several entry frames (an opened optimisation's
 * converged ones, a set of conformers'): each is an entry of its own, and none of them is the molecule's.
 */
function ownOf(m: Molecule3D): Record<string, Property> | null {
  const n = framesOf(m);
  if (m.properties?.length !== n) return null;
  const f = m.path ? n - 1 : m.entryFrames ? (m.entryFrames.length === 1 ? m.entryFrames[0] : null) : n === 1 ? 0 : null;
  return f == null ? null : (m.properties[f] ?? null);
}

/** Of `molecules`, the frames `which` asks for, each a molecule of one geometry - each with the properties of its molecule `keep` names; or why none can be taken. */
export function takeFrames(molecules: readonly Molecule3D[], which: Which, either = 1, keep: readonly string[] = []): Outcome3D {
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
  const taken = setEntries(molecules, "molecules", chosen);
  // (what each frame keeps from its molecule, where asked: as its molecule holds it - a frame's own kept where it holds the same
  //  name, counted; a name a molecule does not hold, said; nothing else of its molecule, whatever its molecule holds)
  const own = new Map(molecules.map((m) => [m.id, ownOf(m)] as const));
  const theirs = new Map<string, number>();
  const held = new Set<string>();
  // (each name, the molecules a frame was taken from that do not hold it: said, never passed over)
  const without = new Map(keep.map((name) => [name, new Set(taken.flatMap((e) => (own.get(e.from as number)?.[name] === undefined ? [e.from] : [])))] as const));
  const kept = keep.length
    ? taken.map((e) => {
        const values = own.get(e.from as number);
        if (!values) return e;
        const add: Record<string, Property> = {};
        for (const name of keep) {
          if (values[name] === undefined) continue;
          held.add(name);
          // (a frame's own, where it differs from its molecule's: its entry frame holds the molecule's itself)
          if (e.properties?.[name] !== undefined) {
            if (e.properties[name].value !== values[name].value) theirs.set(name, (theirs.get(name) ?? 0) + 1);
          }
          else add[name] = values[name];
        }
        return Object.keys(add).length ? { ...e, properties: { ...add, ...e.properties } } : e;
      })
    : taken;
  const refined = byEnergy ? molecules.filter((m) => refinedFrame(m) != null).length : 0;
  const keeping = [
    ...[...theirs].map(([name, n]) => ` · ${plural(n, "frame")} kept ${n === 1 ? "its" : "their"} own ${name}`),
    ...keep.filter((name) => !held.has(name)).map((name) => ` · ${name} not on any molecule`),
    ...keep.filter((name) => held.has(name) && without.get(name)!.size).map((name) => ` · ${name} not on ${plural(without.get(name)!.size, "molecule")}`),
  ].join("");
  const said = `${plural(kept.length, "frame")} of ${plural(molecules.length, "molecule")}: ${takeFramesHow(which, either, keep)}`;
  return { ok: true, holds: "molecules", kept, aside: [], said: `${refined ? `${said} (of ${refined === molecules.length ? "each" : plural(refined, "path search")}, its ${REFINED_SAID})` : said}${ties.join("")}${keeping}` };
}
