/**
 * The configuration a drawing states, kept on its own atoms and bonds by id (foundation part 15, phase 2, its second half; docs/WORKSPACE.md,
 * *The configuration kept*): each centre's neighbours and sense, each double bond's two refs and whether they are on one side, each axis's
 * sense - or "open", where the drawing says it is not known (a wavy bond, an "either" double bond), or unread, with why, where its marks
 * say nothing readable. Kept after every change (configuration/watch), saved with the drawing and carried with it when copied; what an
 * edit changed is said against what is kept. No reader of configuration takes it yet: identity, Clean-up, R and S, 3D and the files
 * still read the marks (phase 3). Pure: no DOM, no store.
 */
import type { Said } from "../../../../lib/chem/perception/stereo/compare";
import type { Atom, Bond, Model } from "../store/types";
import type { Reading } from "./changes";

/** A centre kept: its neighbours by atom id (-1 its H carried, last) and the sense they turn; open; or unread, with why. */
export type KeptCentre = { set: { neighbours: number[]; sense: 1 | -1 } } | "open" | { unread: string };
/** A bond's unit kept: a double bond's (or an odd cumulene run's) two refs by atom id and whether they are on one side; an axis's sense; open; or unread, with why. */
export type KeptBond = { set: { refs: [number, number]; cis: boolean } } | { axis: 1 | -1 } | "open" | { unread: string };

/** What a reading of a part keeps: each atom's and each bond's, by id - those with none left out. */
export type KeptOf = { atoms: Map<number, KeptCentre>; bonds: Map<number, KeptBond> };

const keyOf = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

/** The bond between two atoms of `model`, where there is one. */
function bondBetween(model: Model, p: number, q: number): Bond | undefined {
  return model.bonds.find((b) => (b.a === p && b.b === q) || (b.a === q && b.b === p));
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
    const b = bondBetween(part, p, q);
    if (b) bonds.set(b.id, { set: { refs: [d.refs[0], d.refs[1]], cis: d.cis } });
  }
  for (const [key, sense] of reading.said.axes) {
    const [p, q] = key.split(",").map(Number);
    const b = bondBetween(part, p, q);
    if (b) bonds.set(b.id, { axis: sense });
  }
  return { atoms, bonds };
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
    } else if ("axis" in k) axes.set(keyOf(b.a, b.b), k.axis);
    else {
      // (the refs listed from the lower-id end, as a reading lists them)
      const [p, q] = b.a < b.b ? [k.set.refs[0], k.set.refs[1]] : [k.set.refs[1], k.set.refs[0]];
      doubles.set(keyOf(b.a, b.b), { refs: [p, q], cis: k.set.cis });
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
  const k = v as { set?: { refs?: unknown; cis?: unknown }; axis?: unknown; unread?: unknown } | null;
  if (!k || typeof k !== "object") return undefined;
  if (typeof k.unread === "string") return { unread: k.unread };
  if (k.axis === 1 || k.axis === -1) return { axis: k.axis };
  const s = k.set;
  if (!s || !Array.isArray(s.refs) || s.refs.length !== 2 || typeof s.cis !== "boolean" || !s.refs.every((n) => Number.isInteger(n) && ids.has(n as number))) return undefined;
  return { set: { refs: [s.refs[0] as number, s.refs[1] as number], cis: s.cis } };
}

/** A kept centre's atoms renumbered (`to`, an atom's new id): none where one of its neighbours is not among them. */
export function keptCentreMoved(k: KeptCentre, to: ReadonlyMap<number, number>): KeptCentre | undefined {
  if (k === "open" || "unread" in k) return k;
  const ns = k.set.neighbours.map((n) => (n === -1 ? -1 : to.get(n)));
  return ns.every((n): n is number => n != null) ? { set: { neighbours: ns, sense: k.set.sense } } : undefined;
}

/** A bond's unit kept, its atoms renumbered: none where one of its refs is not among them. */
export function keptBondMoved(k: KeptBond, to: ReadonlyMap<number, number>): KeptBond | undefined {
  if (k === "open" || "unread" in k || "axis" in k) return k;
  const [p, q] = k.set.refs.map((n) => to.get(n));
  return p != null && q != null ? { set: { refs: [p, q], cis: k.set.cis } } : undefined;
}
