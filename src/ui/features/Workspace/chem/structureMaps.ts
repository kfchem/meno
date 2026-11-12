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
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { numberedLike } from "../../../../lib/chem/referenceNumbering";
import type { ArrowAtomMap, Model, Molecule3D } from "../store/types";
import { linkOf } from "../utils/drawnLink";
import { beforeNumbers, mapShows, mapStanding } from "./atomMap";

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
  const before = beforeNumbers(map);
  const after = new Array<number>(map.product.atoms.length).fill(0);
  if (!mapping) return { before, after };
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
    `Conformers: ${before.frames} × ${after.frames} = ${pairs} ${pairs === 1 ? "pair" : "pairs"}${pairs > MOST_PAIRS ? `, more than ${MOST_PAIRS} at once` : ""}`,
    ...(before.unnumbered ? [`Not numbered: ${before.unnumbered} of ${one(before.frames)} of Before`] : []),
    ...(after.unnumbered ? [`Not numbered: ${after.unnumbered} of ${one(after.frames)} of After`] : []),
  ];
}

/**
 * The most pairs of conformers *Pair conformers* makes: past it, the
 * lowest-energy k of each side, k as large as keeps them within it. The
 * maintainer's number is still to come; this is the one place it is set.
 */
export const MOST_PAIRS = 1000;

/** Of `n` and `m` conformers, how many of each are paired: all, or the k of each - fewer where a side has fewer - whose pairs stay within `most`. */
export function pairedCounts(n: number, m: number, most = MOST_PAIRS): [number, number] {
  if (n * m <= most) return [n, m];
  let k = 1;
  while (k < Math.max(n, m) && Math.min(n, k + 1) * Math.min(m, k + 1) <= most) k++;
  return [Math.min(n, k), Math.min(m, k)];
}

/**
 * A side's one molecule in 3D and its frames numbered by the map, lowest
 * energy first (as they come, where its file gives none): each frame's
 * atoms' numbers. Null where the side is not one molecule in 3D on the page.
 */
function sideFrames(side: ArrowAtomMap["reactant"], numbers: readonly number[], molecules3d: readonly Molecule3D[], model: Model): { molecule: Molecule3D; frames: { at: number; numbers: number[] }[] } | null {
  const held = [...sideMolecules(side, molecules3d, model)];
  if (held.length !== 1) return null;
  const [id, start] = held[0];
  const molecule = molecules3d.find((m) => m.id === id)!;
  if (start !== 0 || molecule.atoms.length !== side.atoms.length) return null;
  const numbered = framesNumbered(molecule, side, 0, numbers);
  const energy = (f: number) => molecule.energies?.[f] ?? Infinity;
  const frames = numbered.flatMap((n, at) => (n ? [{ at, numbers: n }] : []));
  frames.sort((p, q) => energy(p.at) - energy(q.at) || p.at - q.at);
  return { molecule, frames };
}

/**
 * What *Pair conformers* would pair on a ready map whose sides are each one
 * molecule in 3D with more than one conformer between them: how many there
 * are, Before by After, and those it pairs - all, or past `MOST_PAIRS` the
 * lowest-energy k of each (`pairedCounts`), by frame. Null where there is
 * nothing to pair.
 */
export function conformerPairs(map: ArrowAtomMap, molecules3d: readonly Molecule3D[], model: Model): { of: [number, number]; before: number[]; after: number[] } | null {
  if (!map.complete) return null;
  const n = sideNumbers(map);
  const before = sideFrames(map.reactant, n.before, molecules3d, model);
  const after = sideFrames(map.product, n.after, molecules3d, model);
  if (!before || !after || before.frames.length * after.frames.length < 2) return null;
  const [k, l] = pairedCounts(before.frames.length, after.frames.length);
  return { of: [before.frames.length, after.frames.length], before: before.frames.slice(0, k).map((f) => f.at), after: after.frames.slice(0, l).map((f) => f.at) };
}

/**
 * The conformers a map pairs (`pairs`) written as one SD file: for each
 * pair, Before's frame and After's, each atom written at its number's place
 * - the reactants' numbering, as *Export reaction in 3D* writes the map's
 * own two. Null where a frame paired is gone, or no longer numbered.
 */
export function pairedSdf(map: ArrowAtomMap, molecules3d: readonly Molecule3D[], model: Model, title: string): string | null {
  if (!map.pairs) return null;
  const n = sideNumbers(map);
  const before = sideFrames(map.reactant, n.before, molecules3d, model);
  const after = sideFrames(map.product, n.after, molecules3d, model);
  if (!before || !after) return null;
  const record = (side: { molecule: Molecule3D; frames: { at: number; numbers: number[] }[] }, at: number, name: string) => {
    const f = side.frames.find((x) => x.at === at);
    if (!f) return null;
    const m = side.molecule;
    const xyz = at === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : (m.frames ?? []).filter((x) => x.length === 3 * m.atoms.length)[at - 1];
    if (!xyz) return null;
    const atoms = new Array<{ el: string; x: number; y: number; z: number; charge?: number }>(m.atoms.length);
    m.atoms.forEach((a, i) => (atoms[f.numbers[i] - 1] = { el: a.el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2], ...(a.charge ? { charge: a.charge } : {}) }));
    const bonds = m.bonds.map((b) => ({ a1: f.numbers[b.a1] - 1, a2: f.numbers[b.a2] - 1, order: b.order }));
    return writeMolfile3d(atoms, bonds, { title: `${title} ${name}` }) + "$$$$\n";
  };
  let out = "";
  for (const b of map.pairs.before)
    for (const a of map.pairs.after) {
      const r = record(before, b, `reactant conformer ${b + 1}`);
      const p = record(after, a, `product conformer ${a + 1}`);
      if (r == null || p == null) return null;
      out += r + p;
    }
  return out;
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

/** Whether `v` is a map's conformers paired: Before's frames and After's, each a frame's number, one at least each. */
function pairsRead(v: unknown): boolean {
  const p = v as { before?: unknown; after?: unknown } | null;
  const frames = (x: unknown) => Array.isArray(x) && x.length > 0 && x.every((f) => Number.isInteger(f) && f >= 0);
  return !!p && frames(p.before) && frames(p.after);
}

/** Whether `v` numbers `n` atoms 1 to n, each once. */
function numbersRead(v: unknown, n: number): boolean {
  return Array.isArray(v) && v.length === n && new Set(v).size === n && v.every((k) => Number.isInteger(k) && k >= 1 && k <= n);
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
      map: {
        drawnAs: m.drawnAs as string,
        reactant: reactant!,
        product: product!,
        maps: all as number[][],
        complete: complete && all!.length > 0,
        chosen: m.chosen as number,
        shown: m.shown !== false,
        // (Before's numbers, where renumbered: each atom one of 1 to n, none twice - else as it holds them)
        ...(numbersRead(m.numbers, reactant!.atoms.length) ? { numbers: m.numbers as number[] } : {}),
        // (its conformers paired, by frame: kept where each is a frame's number, a frame not there said so when it is written)
        ...(pairsRead(m.pairs) ? { pairs: m.pairs as { before: number[]; after: number[] } } : {}),
      },
    });
  }
  return { maps, left };
}
