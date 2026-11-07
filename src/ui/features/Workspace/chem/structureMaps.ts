/**
 * Atom maps between any structures on the page (docs/ATOM-MAPPING.md, *Between
 * structures on the page*): made from the right-click menu of two or more
 * selected - the one right-clicked Before, each other After - and kept on the
 * page, not on an arrow. A map is the same as an arrow's (chem/atomMap
 * `ArrowAtomMap`: Before its reactant side, After its product side); what it
 * shows goes on the drawing as an arrow's does, and on its structures'
 * molecules in 3D too: there, every atom's number, its hydrogens' with it.
 */
import type { Molecule } from "../../../../lib/chem/molecule";
import { numberedLike } from "../../../../lib/chem/referenceNumbering";
import type { ArrowAtomMap, Model, Molecule3D } from "../store/types";
import { linkOf } from "../utils/drawnLink";
import { mapShows, mapStanding } from "./atomMap";

/** A map kept between two structures on the page, numbered as it was made. */
export type StructureMap = { id: number; map: ArrowAtomMap };

/**
 * Each atom's number on a ready map's sides in 3D: Before's heavy atoms one
 * after another as they stand in 3D - the numbers the drawing shows - then
 * its hydrogens, after them in the same order; each of After's atoms its
 * Before atom's. 0 for none.
 */
export function sideNumbers(map: ArrowAtomMap): { before: number[]; after: number[] } {
  const mapping = map.maps[map.chosen] ?? map.maps[0];
  const before = new Array<number>(map.reactant.atoms.length).fill(0);
  const after = new Array<number>(map.product.atoms.length).fill(0);
  if (!mapping) return { before, after };
  // (the drawn heavy atoms first, as chem/atomMap `mapMarks` numbers them on the drawing; then the rest - the hydrogens; of a
  // partial map, only those it pairs)
  const paired = new Set(map.complete ? map.reactant.atoms.map((_, i) => i) : mapping.filter((r) => r >= 0));
  const drawnHeavy = (i: number) => map.reactant.atoms[i].el !== "H" && map.reactant.drawnFrom[i] != null;
  let next = 1;
  map.reactant.atoms.forEach((_, i) => {
    if (drawnHeavy(i) && paired.has(i)) before[i] = next++;
  });
  map.reactant.atoms.forEach((_, i) => {
    if (!drawnHeavy(i) && paired.has(i)) before[i] = next++;
  });
  mapping.forEach((r, j) => (after[j] = r >= 0 ? (before[r] ?? 0) : 0));
  return { before, after };
}

/**
 * The molecules in 3D on the page a side is made of: each one still its
 * drawing's (utils/drawnLink `linkOf`) whose atoms are those of a run of the
 * side's atoms - the same drawn atom each, and the same elements, in order -
 * which is how a side taken from the page (chem/useAtomMaps) is made of
 * them; or, `anyLink`, whatever has become of its drawing since (to take
 * numbers off it). By molecule id, where its first atom is in the side.
 */
export function sideMolecules(side: ArrowAtomMap["reactant"], molecules3d: readonly Molecule3D[], model: Model, anyLink = false): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of molecules3d) {
    if (!m.drawnFrom || (!anyLink && linkOf(m, model) !== "live")) continue;
    const first = m.drawnFrom.find((id) => id != null);
    if (first == null) continue;
    for (let from = side.drawnFrom.indexOf(first); from >= 0; from = side.drawnFrom.indexOf(first, from + 1)) {
      // (the drawn atom of its first that has one: back to where its own first atom stands in the side)
      const start = from - m.drawnFrom.indexOf(first);
      if (start < 0 || start + m.atoms.length > side.atoms.length) continue;
      const same = m.atoms.every((a, i) => a.el === side.atoms[start + i].el && m.drawnFrom![i] === side.drawnFrom[start + i]);
      if (same) {
        out.set(m.id, start);
        break;
      }
    }
  }
  return out;
}

/**
 * A side's numbers on one of its molecules in 3D, frame by frame: each frame
 * numbered as the side's own geometry - the map was made on it - by
 * lib/chem/referenceNumbering `numberedLike`, so that a conformer that puts
 * two alike atoms (a methyl's hydrogens) each in the other's place has their
 * numbers swapped with them. A frame whose numbering is not resolved has
 * none (null).
 */
function framesNumbered(m: Molecule3D, side: ArrowAtomMap["reactant"], start: number, n: readonly number[]): (number[] | null)[] {
  const reference: Molecule = {
    atoms: m.atoms.map((a, i) => ({ ...a, x: side.atoms[start + i].x, y: side.atoms[start + i].y, z: side.atoms[start + i].z })),
    bonds: m.bonds,
  } as Molecule;
  const at = (xyz: readonly number[]): Molecule => ({ atoms: m.atoms.map((a, i) => ({ ...a, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })), bonds: m.bonds }) as Molecule;
  const frames = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length)];
  return numberedLike(reference, frames.map(at)).map((r) => {
    if (!("order" in r)) return null;
    // (order[i]: the frame's atom that is the reference's atom i - which carries atom i's number)
    const out = new Array<number>(m.atoms.length).fill(0);
    r.order.forEach((k, i) => (out[k] = n[start + i] ?? 0));
    return out;
  });
}

/**
 * What the page's maps put on its molecules in 3D: each atom's number, by
 * molecule id (0 for none), on the molecules of ready maps shown - frame by
 * frame (`framesNumbered`), the first frame's and the rest's apart - and the
 * molecules of any map, shown or not, to be cleared of numbers it put there.
 */
export function numbers3d(
  maps: readonly StructureMap[],
  molecules3d: readonly Molecule3D[],
  model: Model,
): { numbers: Map<number, { first: number[]; rest: (number[] | null)[] }>; touched: Set<number> } {
  const numbers = new Map<number, { first: number[]; rest: (number[] | null)[] }>();
  const touched = new Set<number>();
  for (const { map } of maps) {
    const sides = [
      { side: map.reactant, key: "before" as const },
      { side: map.product, key: "after" as const },
    ];
    const ready = map.shown && mapShows(mapStanding({ atomMap: map }, model));
    const n = ready ? sideNumbers(map) : null;
    for (const { side, key } of sides) {
      // (a map of a drawing changed since: its numbers taken off its molecules, whatever their tie to it now)
      for (const [id, start] of sideMolecules(side, molecules3d, model, true)) {
        touched.add(id);
        const m = molecules3d.find((x) => x.id === id)!;
        if (!n || linkOf(m, model) !== "live") continue;
        const [first, ...rest] = framesNumbered(m, side, start, n[key]);
        numbers.set(id, { first: first ?? new Array<number>(m.atoms.length).fill(0), rest });
      }
    }
  }
  return { numbers, touched };
}

/**
 * What a map's sides in 3D hold, in words for its menu: how many conformers
 * each side's molecule has and so how many pairs of them there are, Before
 * by After - said before any are made ("Conformers: 6 × 3 = 18 pairs") - and
 * how many frames could not be numbered ("Not numbered: 2 of 6 conformers
 * of Before"). None where a side has no molecule in 3D on the page.
 */
export function conformersSaid(map: ArrowAtomMap, molecules3d: readonly Molecule3D[], model: Model): string[] {
  const counted = (side: ArrowAtomMap["reactant"]) => {
    const ms = [...sideMolecules(side, molecules3d, model).keys()].map((id) => molecules3d.find((m) => m.id === id)!);
    if (!ms.length) return null;
    const frames = ms.reduce((t, m) => Math.max(t, 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length), 0);
    const unnumbered = ms.reduce((t, m) => t + (m.mapFrames ?? []).filter((f) => f == null).length, 0);
    return { frames, unnumbered };
  };
  const before = counted(map.reactant);
  const after = counted(map.product);
  if (!before || !after) return [];
  const one = (k: number) => (k === 1 ? "1 conformer" : `${k} conformers`);
  const pairs = before.frames * after.frames;
  return [
    `Conformers: ${before.frames} × ${after.frames} = ${pairs} ${pairs === 1 ? "pair" : "pairs"}`,
    ...(before.unnumbered ? [`Not numbered: ${before.unnumbered} of ${one(before.frames)} of Before`] : []),
    ...(after.unnumbered ? [`Not numbered: ${after.unnumbered} of ${one(after.frames)} of After`] : []),
  ];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isIndex = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;

/** A side of a map as a workspace's file has it, or null where it is not one. */
function sideRead(v: unknown): ArrowAtomMap["reactant"] | null {
  const s = v as { atoms?: unknown; bonds?: unknown; drawnFrom?: unknown } | null;
  if (!s || !Array.isArray(s.atoms) || !Array.isArray(s.bonds) || !Array.isArray(s.drawnFrom) || s.drawnFrom.length !== s.atoms.length) return null;
  const n = s.atoms.length;
  const atoms: ArrowAtomMap["reactant"]["atoms"] = [];
  for (const a of s.atoms as { el?: unknown; x?: unknown; y?: unknown; z?: unknown; charge?: unknown }[]) {
    if (typeof a?.el !== "string" || !isNum(a.x) || !isNum(a.y) || !isNum(a.z) || (a.charge != null && !Number.isInteger(a.charge))) return null;
    atoms.push({ el: a.el, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge as number } : {}) });
  }
  const bonds: ArrowAtomMap["reactant"]["bonds"] = [];
  for (const b of s.bonds as { a1?: unknown; a2?: unknown; order?: unknown }[]) {
    if (!isIndex(b?.a1, n) || !isIndex(b.a2, n) || !isNum(b.order)) return null;
    bonds.push({ a1: b.a1, a2: b.a2, order: b.order });
  }
  const drawnFrom = (s.drawnFrom as unknown[]).map((id) => (Number.isInteger(id) ? (id as number) : null));
  return { atoms, bonds, drawnFrom };
}

/** The maps between structures a workspace's file keeps (`structureMaps`), each read whole or left out; numbered from 1, in order. */
export function readStructureMaps(v: unknown): { maps: StructureMap[]; left: number } {
  const maps: StructureMap[] = [];
  let left = 0;
  for (const e of Array.isArray(v) ? v : []) {
    const m = (e as { map?: unknown } | null)?.map as Partial<Record<keyof ArrowAtomMap, unknown>> | undefined;
    const reactant = sideRead(m?.reactant);
    const product = sideRead(m?.product);
    const all = Array.isArray(m?.maps) ? (m!.maps as unknown[]) : null;
    // (a partial map's product atoms with none -1; a complete one's every one paired)
    const complete = m?.complete === true;
    const ok =
      !!m && typeof m.drawnAs === "string" && reactant && product && all &&
      all.every((k) => Array.isArray(k) && k.length === product.atoms.length && k.every((r) => isIndex(r, reactant.atoms.length) || (!complete && r === -1))) &&
      Number.isInteger(m.chosen) && (m.chosen as number) >= 0 && (m.chosen as number) < Math.max(1, all.length);
    if (!ok) {
      left++;
      continue;
    }
    maps.push({
      id: maps.length + 1,
      map: { drawnAs: m.drawnAs as string, reactant: reactant!, product: product!, maps: all as number[][], complete: complete && all!.length > 0, chosen: m.chosen as number, shown: m.shown !== false },
    });
  }
  return { maps, left };
}
