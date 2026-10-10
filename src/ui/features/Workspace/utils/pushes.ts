import { labelBox, labelSetOf, type LayoutOptions, type TextItem } from "../../../../lib/chem/layout2d";
import { pushShape, type PushEndAt, type PushMeasures, type PushShape } from "../../../../lib/chem/pushArrow";
import type { Bond, PushArrow, PushEnd } from "../store/types";

/**
 * Electron-pushing arrows as the drawing has them (lib/chem/pushArrow):
 * each end found among the atoms where they are drawn - on the canvas, as
 * they glide; in a picture, as they are - and drawn clear of their labels,
 * so that the canvas and every picture draw the same arrows.
 */

type P = { x: number; y: number };
type AtomAt = { id: number; x: number; y: number; el: string; charge?: number };

/** The elements an arrow leaves from a lone pair of: those that have one to give in a neutral structure. */
const PAIRED = new Set(["N", "O", "S", "P", "Se", "F", "Cl", "Br", "I"]);

/** Whether an atom has a lone pair an arrow is drawn from: a lone pair's element, or one with a negative charge. */
export function hasLonePair(a: Pick<AtomAt, "el" | "charge">): boolean {
  return PAIRED.has(a.el) || (a.charge ?? 0) < 0;
}

/** How far round a bare vertex an arrow keeps, in bonds. */
const BARE_CLEAR = 0.12;
/** How far past its label's ink, in ems of the labels. */
const LABEL_CLEAR = 0.15;

/** How far an arrow keeps from an atom, toward `u`: past its label's ink - the box round it - or round its bare vertex. */
function clearOf(label: TextItem | undefined, fontSize: number, opts: LayoutOptions, bondLength: number): (u: P) => number {
  if (!label) return () => BARE_CLEAR * bondLength;
  const box = labelBox(label, fontSize, labelSetOf(opts));
  return (u: P) => {
    const tx = u.x > 1e-9 ? box.right / u.x : u.x < -1e-9 ? box.left / -u.x : Infinity;
    const ty = u.y > 1e-9 ? box.top / u.y : u.y < -1e-9 ? box.bottom / -u.y : Infinity;
    return Math.min(tx, ty) + LABEL_CLEAR * fontSize;
  };
}

/** The atoms joined to `ids` by bonds - their structures - by index. */
function structuresOf(ids: readonly number[], atoms: readonly AtomAt[], bonds: readonly Pick<Bond, "a" | "b">[]): P[] {
  const next = new Map<number, number[]>();
  for (const b of bonds) {
    next.set(b.a, [...(next.get(b.a) ?? []), b.b]);
    next.set(b.b, [...(next.get(b.b) ?? []), b.a]);
  }
  const seen = new Set(ids);
  const queue = [...ids];
  while (queue.length)
    for (const n of next.get(queue.pop()!) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  return atoms.filter((a) => seen.has(a.id));
}

/**
 * Each arrow's curve, by its id - from and to its ends among `atoms` (in
 * the order the layout's `labels` number them), bent as it says or away
 * from its structures - its head half or full: those whose ends are drawn.
 */
export function pushShapes(
  pushes: readonly PushArrow[],
  atoms: readonly AtomAt[],
  bonds: readonly Pick<Bond, "id" | "a" | "b">[],
  labels: readonly TextItem[],
  opts: LayoutOptions,
  fontSize: number,
  m: PushMeasures,
  /** An end of one being drawn out, where the pointer is: that end of the arrow `of` there. */
  pointer?: { of: number; end: "from" | "to"; at: P },
): { push: PushArrow; shape: PushShape; from: PushEndAt; to: PushEndAt }[] {
  if (!pushes.length) return [];
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const labelOf = new Map(labels.filter((t) => t.atom != null).map((t) => [t.atom!, t]));
  const bondOf = new Map(bonds.map((b) => [b.id, b]));
  const atomAt = (id: number) => {
    const i = index.get(id);
    return i == null ? null : atoms[i];
  };
  const endAt = (e: PushEnd, tail: boolean, noPair: boolean): PushEndAt | null => {
    if ("atom" in e) {
      const a = atomAt(e.atom);
      if (!a) return null;
      return { atom: a, clear: clearOf(labelOf.get(index.get(e.atom)!), fontSize, opts, m.bondLength), pair: tail && !noPair && hasLonePair(a) };
    }
    const ends = "bond" in e ? bondOf.get(e.bond) && [bondOf.get(e.bond)!.a, bondOf.get(e.bond)!.b] : e.gap;
    const p = ends && atomAt(ends[0]);
    const q = ends && atomAt(ends[1]);
    if (!p || !q) return null;
    return "bond" in e ? { bond: [p, q] } : { gap: [p, q] };
  };
  const ids = (e: PushEnd) => ("atom" in e ? [e.atom] : "gap" in e ? e.gap : bondOf.get(e.bond) ? [bondOf.get(e.bond)!.a, bondOf.get(e.bond)!.b] : []);
  const free = (at: P): PushEndAt => ({ gap: [at, at] });
  return pushes.flatMap((push) => {
    const from = pointer?.of === push.id && pointer.end === "from" ? free(pointer.at) : endAt(push.from, true, !!push.noPair);
    const to = pointer?.of === push.id && pointer.end === "to" ? free(pointer.at) : endAt(push.to, false, true);
    if (!from || !to) return [];
    const around = push.bend ? [] : structuresOf([...ids(push.from), ...ids(push.to)], atoms, bonds);
    const shape = pushShape(from, to, push.bend, around, m);
    return shape ? [{ push, shape, from, to }] : [];
  });
}

/** Where an electron-pushing arrow drawn to `p` ends: the atom or the bond under the pointer, else the gap between two atoms not bonded whose middle `p` is near - where a bond forms - else nowhere. */
export function pushTargetAt(
  p: P,
  hovered: { atomId: number | null; bondId: number | null },
  atoms: readonly AtomAt[],
  bonds: readonly Pick<Bond, "id" | "a" | "b">[],
  bondLength: number,
): PushEnd | null {
  if (hovered.atomId != null) return { atom: hovered.atomId };
  if (hovered.bondId != null) return { bond: hovered.bondId };
  const L = bondLength;
  // (an atom or a bond at the pointer, where none is lit yet: the pointer came straight onto it)
  const part = partAt(p, atoms, bonds, L);
  if (part) return part;
  const near = atoms.filter((a) => Math.hypot(a.x - p.x, a.y - p.y) < 2.2 * L);
  if (near.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < 0.45 * L)) return null;
  const bonded = new Set(bonds.map((b) => (b.a < b.b ? `${b.a}-${b.b}` : `${b.b}-${b.a}`)));
  let best: { gap: [number, number]; d: number } | null = null;
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const a = near[i];
      const b = near[j];
      const apart = Math.hypot(a.x - b.x, a.y - b.y);
      if (apart < 0.6 * L || apart > 3.2 * L || bonded.has(a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`)) continue;
      const d = Math.hypot((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y);
      if (d < 0.4 * L && (!best || d < best.d)) best = { gap: [a.id, b.id], d };
    }
  return best ? { gap: best.gap } : null;
}

/** The atom at `p` - within 0.35 of a bond of it - or else the bond, within a quarter of one of its line; none, else. */
export function partAt(p: P, atoms: readonly AtomAt[], bonds: readonly Pick<Bond, "id" | "a" | "b">[], bondLength: number): PushEnd | null {
  const L = bondLength;
  let atom: { id: number; d: number } | null = null;
  for (const a of atoms) {
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < 0.35 * L && (!atom || d < atom.d)) atom = { id: a.id, d };
  }
  if (atom) return { atom: atom.id };
  const at = new Map(atoms.map((a) => [a.id, a]));
  let bond: { id: number; d: number } | null = null;
  for (const b of bonds) {
    const u = at.get(b.a);
    const v = at.get(b.b);
    if (!u || !v) continue;
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const t = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / Math.max(dx * dx + dy * dy, 1e-12)));
    const d = Math.hypot(u.x + t * dx - p.x, u.y + t * dy - p.y);
    if (d < 0.25 * L && (!bond || d < bond.d)) bond = { id: b.id, d };
  }
  return bond ? { bond: bond.id } : null;
}
