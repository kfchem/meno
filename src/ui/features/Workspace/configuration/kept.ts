/**
 * The configuration a drawing states, kept on its own atoms and bonds by id (foundation part 15, phase 2, its second half; docs/WORKSPACE.md,
 * *The configuration kept*): each centre's neighbours and sense, each double bond's two refs and whether they are on one side, each axis's
 * sense - or "open", where the drawing says it is not known (a wavy bond, an "either" double bond), or unread, with why, where its marks
 * say nothing readable. Kept after every change (configuration/watch), saved with the drawing and carried with it when copied; what an
 * edit changed is said against what is kept. No reader of configuration takes it yet: identity, Clean-up, R and S, 3D and the files
 * still read the marks (phase 3). Pure: no DOM, no store.
 */
import { lowestOthers, type Said } from "../../../../lib/chem/perception/stereo/compare";
import { drawingOf } from "../chem/drawing";
import type { Atom, Bond, Model } from "../store/types";
import type { Reading } from "./changes";

/** A centre kept: its neighbours by atom id (-1 its H carried, last) and the sense they turn; open; or unread, with why. */
export type KeptCentre = { set: { neighbours: number[]; sense: 1 | -1 } } | "open" | { unread: string };
/**
 * A bond's unit kept: a double bond's (or an odd cumulene run's) two refs by atom id and whether they are on one side; an axis's two refs
 * by atom id - at each end, from its lower-id end, the other neighbour its sense is taken against - and that sense; open; or unread, with
 * why. An axis's refs are kept with it: its sense alone, read against whichever neighbour then had the lowest id, would name the other
 * hand once the ids were renumbered (a paste).
 */
export type KeptBond =
  | { set: { refs: [number, number]; cis: boolean; ends?: [number, number] } }
  | { axis: { refs: [number, number]; sense: 1 | -1; ends?: [number, number] } }
  | "open"
  | { unread: string };

/** What a reading of a part keeps: each atom's and each bond's, by id - those with none left out. */
export type KeptOf = { atoms: Map<number, KeptCentre>; bonds: Map<number, KeptBond> };

const keyOf = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

/** The bond between two atoms of `model`, where there is one. */
function bondBetween(model: Model, p: number, q: number): Bond | undefined {
  return model.bonds.find((b) => (b.a === p && b.b === q) || (b.a === q && b.b === p));
}

/**
 * The bond a unit between the atoms `p` and `q` (`p` the lower id) is kept on: the bond between them - or, where they are the two ends
 * of a run of cumulated double bonds (an allene's axis, an odd cumulene's cis or trans), its first bond from `p`, with the ends named
 * (`ends`), as the bond's own atoms are not them. None where neither is there.
 */
function unitBond(model: Model, p: number, q: number): { bond: Bond; ends?: [number, number] } | undefined {
  const direct = bondBetween(model, p, q);
  if (direct) return { bond: direct };
  // (along double bonds from p, each atom once, to q: the first step's bond)
  const doubles = model.bonds.filter((b) => b.order === 2);
  const first = new Map<number, Bond>();
  const seen = new Set([p]);
  let edge = [p];
  while (edge.length) {
    const next: number[] = [];
    for (const x of edge) {
      for (const b of doubles) {
        const y = b.a === x ? b.b : b.b === x ? b.a : null;
        if (y == null || seen.has(y)) continue;
        seen.add(y);
        first.set(y, x === p ? b : first.get(x)!);
        if (y === q) return { bond: first.get(y)!, ends: [p, q] };
        next.push(y);
      }
    }
    edge = next;
  }
  return undefined;
}

/** What `part`, as it is read (`reading`: configuration/changes `readingOf`), keeps. */
export function keptFrom(part: Model, reading: Reading): KeptOf {
  const atoms = new Map<number, KeptCentre>();
  const bonds = new Map<number, KeptBond>();
  for (const [c, t] of reading.said.centres) atoms.set(c, { set: { neighbours: [...t.neighbours], sense: t.volume } });
  for (const [c, why] of reading.unread) if (!atoms.has(c)) atoms.set(c, { unread: why });
  for (const b of part.bonds) {
    // (a wavy bond says its centre is not known - at its narrow end, or its first atom; an "either" double bond says so of itself)
    if (b.stereo === "wavy") {
      const c = b.narrow ?? b.a;
      if (!atoms.has(c)) atoms.set(c, "open");
    }
    if (b.stereo === "either" && b.order === 2) bonds.set(b.id, "open");
  }
  for (const [key, d] of reading.said.doubles) {
    const [p, q] = key.split(",").map(Number);
    const on = unitBond(part, p, q);
    if (on) bonds.set(on.bond.id, { set: { refs: [d.refs[0], d.refs[1]], cis: d.cis, ...(on.ends ? { ends: on.ends } : {}) } });
  }
  const refsOf = axisRefs(part);
  for (const [key, sense] of reading.said.axes) {
    const [p, q] = key.split(",").map(Number);
    const on = unitBond(part, p, q);
    const refs = refsOf(p, q);
    if (on && refs) bonds.set(on.bond.id, { axis: { refs, sense, ...(on.ends ? { ends: on.ends } : {}) } });
  }
  return { atoms, bonds };
}

/**
 * An axis's refs in `part`, by atom id, from its lower-id end `p` to `q`: at each end the other neighbour of the lowest id, as a reading
 * takes its sense against (perception/stereo/compare `againstLowest`) - null where an end has none, or an atom is not in `part`.
 */
function axisRefs(part: Model): (p: number, q: number) => [number, number] | null {
  const drawing = drawingOf(part);
  const ids = part.atoms.map((a) => a.id);
  return (p, q) => {
    const i = drawing.index.get(p);
    const j = drawing.index.get(q);
    if (i == null || j == null) return null;
    const [r, s] = lowestOthers(drawing.bonds, ids, [i, j]);
    return r != null && s != null ? [ids[r], ids[s]] : null;
  };
}

/** Whether any atom or bond of `part` keeps a configuration: none where it was never kept - a drawing from before this, or new. */
export function keepsAny(part: Model): boolean {
  return part.atoms.some((a) => a.config != null) || part.bonds.some((b) => b.config != null);
}

/**
 * What `part` keeps, read as a reading is (`Reading`): its centres, double bonds and axes as kept, its unread atoms with their why - the
 * H's and plain H's as `now` has them, the same atoms.
 */
export function keptReading(part: Model, now: Said): Reading {
  const centres: Said["centres"] = new Map();
  const doubles: Said["doubles"] = new Map();
  const axes: Said["axes"] = new Map();
  const unread = new Map<number, string>();
  const open = new Set<number>();
  const refsOf = axisRefs(part);
  for (const a of part.atoms) {
    const k = a.config;
    if (!k) continue;
    if (k === "open") open.add(a.id);
    else if ("unread" in k) unread.set(a.id, k.unread);
    else centres.set(a.id, { neighbours: k.set.neighbours, volume: k.set.sense });
  }
  for (const b of part.bonds) {
    const k = b.config;
    if (!k) continue;
    if (k === "open") {
      open.add(b.a);
      open.add(b.b);
    } else if ("unread" in k) {
      unread.set(b.a, k.unread);
    } else if ("axis" in k) {
      // (its sense against the refs it was kept with, turned for each end where another neighbour now has the lowest id - as a
      //  reading of the drawing now takes it.
      //  Each ref is matched to the end it is bonded to, not by its place in the pair: renumbered, the lower-id end may be the other.
      //  Its ends: the bond's own, or those named - an allene's)
      const [x, y] = k.axis.ends ?? [b.a, b.b];
      const [p, q] = x < y ? [x, y] : [y, x];
      const now = refsOf(p, q);
      const keptAt = (end: number) => k.axis.refs.find((r) => bondBetween(part, end, r) != null);
      const turned = (now && keptAt(p) !== now[0] ? -1 : 1) * (now && keptAt(q) !== now[1] ? -1 : 1);
      axes.set(keyOf(p, q), (k.axis.sense * turned) as 1 | -1);
    } else {
      // (the refs listed from the lower-id end, as a reading lists them)
      const [x, y] = k.set.ends ?? [b.a, b.b];
      const [p, q] = x < y ? [k.set.refs[0], k.set.refs[1]] : [k.set.refs[1], k.set.refs[0]];
      doubles.set(keyOf(x, y), { refs: [p, q], cis: k.set.cis });
    }
  }
  return { said: { centres, doubles, axes, hydrogens: now.hydrogens, plain: now.plain }, unread, open };
}

/** `model` with what `kept` keeps put on its atoms and bonds among `ids` (both ends among them), and taken off those of them it keeps none for. */
export function withKept(model: Model, ids: ReadonlySet<number>, kept: KeptOf): Model {
  const same = (p: unknown, q: unknown) => JSON.stringify(p) === JSON.stringify(q);
  let changed = false;
  const atoms = model.atoms.map((a): Atom => {
    if (!ids.has(a.id)) return a;
    const k = kept.atoms.get(a.id);
    if (same(k, a.config)) return a;
    changed = true;
    const { config: _c, ...rest } = a;
    return k ? { ...rest, config: k } : rest;
  });
  const bonds = model.bonds.map((b): Bond => {
    if (!ids.has(b.a) || !ids.has(b.b)) return b;
    const k = kept.bonds.get(b.id);
    if (same(k, b.config)) return b;
    changed = true;
    const { config: _c, ...rest } = b;
    return k ? { ...rest, config: k } : rest;
  });
  return changed ? { ...model, atoms, bonds } : model;
}

/** A kept centre as a file or a copy holds it, read only where it is whole and its atoms are of the drawing (`ids`): else none. */
export function keptCentreRead(v: unknown, ids: ReadonlySet<number>): KeptCentre | undefined {
  if (v === "open") return "open";
  const k = v as { set?: { neighbours?: unknown; sense?: unknown }; unread?: unknown } | null;
  if (!k || typeof k !== "object") return undefined;
  if (typeof k.unread === "string") return { unread: k.unread };
  const s = k.set;
  if (!s || !Array.isArray(s.neighbours) || (s.sense !== 1 && s.sense !== -1)) return undefined;
  const ns = s.neighbours;
  if (ns.length < 3 || ns.length > 4 || !ns.every((n) => n === -1 || (Number.isInteger(n) && ids.has(n as number)))) return undefined;
  return { set: { neighbours: ns as number[], sense: s.sense } };
}

/** A bond's unit kept, as a file or a copy holds it, read only where it is whole and its atoms are of the drawing: else none. */
export function keptBondRead(v: unknown, ids: ReadonlySet<number>): KeptBond | undefined {
  if (v === "open") return "open";
  const k = v as { set?: { refs?: unknown; cis?: unknown }; axis?: { refs?: unknown; sense?: unknown }; unread?: unknown } | null;
  if (!k || typeof k !== "object") return undefined;
  if (typeof k.unread === "string") return { unread: k.unread };
  // (a pair of the drawing's atoms; and ends, where named, likewise)
  const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && ids.has(n as number));
  const ends = (v: unknown) => (v === undefined ? {} : pair(v) ? { ends: [v[0], v[1]] as [number, number] } : null);
  if (k.axis != null) {
    const { refs, sense } = k.axis;
    const named = ends((k.axis as { ends?: unknown }).ends);
    if (!pair(refs) || (sense !== 1 && sense !== -1) || !named) return undefined;
    return { axis: { refs: [refs[0], refs[1]], sense, ...named } };
  }
  const s = k.set as { refs?: unknown; cis?: unknown; ends?: unknown } | undefined;
  const named = ends(s?.ends);
  if (!s || !pair(s.refs) || typeof s.cis !== "boolean" || !named) return undefined;
  return { set: { refs: [s.refs[0], s.refs[1]], cis: s.cis, ...named } };
}

/** A kept centre's atoms renumbered (`to`, an atom's new id): none where one of its neighbours is not among them. */
export function keptCentreMoved(k: KeptCentre, to: ReadonlyMap<number, number>): KeptCentre | undefined {
  if (k === "open" || "unread" in k) return k;
  const ns = k.set.neighbours.map((n) => (n === -1 ? -1 : to.get(n)));
  return ns.every((n): n is number => n != null) ? { set: { neighbours: ns, sense: k.set.sense } } : undefined;
}

/** A bond's unit kept, its atoms renumbered: none where one of its refs is not among them. */
export function keptBondMoved(k: KeptBond, to: ReadonlyMap<number, number>): KeptBond | undefined {
  if (k === "open" || "unread" in k) return k;
  // (a pair renumbered: none where one of it is not among them)
  const moved = (v: readonly number[]): [number, number] | null => {
    const [p, q] = v.map((n) => to.get(n));
    return p != null && q != null ? [p, q] : null;
  };
  const unit = "axis" in k ? k.axis : k.set;
  const refs = moved(unit.refs);
  const ends = unit.ends ? moved(unit.ends) : undefined;
  if (!refs || ends === null) return undefined;
  const named = ends ? { ends } : {};
  return "axis" in k ? { axis: { refs, sense: k.axis.sense, ...named } } : { set: { refs, cis: k.set.cis, ...named } };
}
