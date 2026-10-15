import { smallestRings } from "../../../../lib/layout/rings";
import type { Model, RingFills } from "../store/types";

/**
 * The rings of what is drawn, as a colour fills them (docs/EDITOR-2D.md,
 * *Colour*): each by its key - its atoms' ids, ascending, joined by "-", as
 * an aromatic circle's is - so that a fill goes where its atoms go.
 */

type P = { x: number; y: number };

/** A ring's key: its atoms' ids, ascending, joined by "-". */
export function ringKeyOf(ids: readonly number[]): string {
  return [...ids].sort((a, b) => a - b).join("-");
}

/** The drawing's rings - the smallest set of smallest rings - each its atoms' ids in order round it, and its key. */
export function ringsOf(model: Model): { key: string; ids: number[] }[] {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const edges = model.bonds.flatMap((b): [number, number][] => {
    const i = index.get(b.a);
    const j = index.get(b.b);
    return i != null && j != null && i !== j && !b.endpoints?.length ? [[i, j]] : [];
  });
  return smallestRings(model.atoms.length, edges).map((ring) => {
    const ids = ring.map((i) => model.atoms[i].id);
    return { key: ringKeyOf(ids), ids };
  });
}

/** Twice the area a ring's outline encloses (any sign). */
function area2(pts: readonly P[]): number {
  let s = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  });
  return Math.abs(s);
}

/** Whether `p` is inside the outline `pts`. */
function inside(pts: readonly P[], p: P): boolean {
  let within = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}

/** The smallest ring of the drawing whose outline holds `p`, by its key; null, where none does. */
export function ringAt(model: Model, p: P): string | null {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  let best: { key: string; size: number } | null = null;
  for (const r of ringsOf(model)) {
    const pts = r.ids.map((id) => at.get(id)!);
    if (!inside(pts, p)) continue;
    const size = area2(pts);
    if (!best || size < best.size) best = { key: r.key, size };
  }
  return best?.key ?? null;
}

/**
 * Whether the ring a key names is still in the drawing: its atoms there,
 * and a ring among them - not undone away, its closing bond not broken.
 * Worked out on those atoms alone, so it costs nothing on a large drawing.
 */
export function ringThere(model: Model, key: string): boolean {
  const ids = new Set(key.split("-").map(Number));
  const atoms = model.atoms.filter((a) => ids.has(a.id));
  if (atoms.length !== ids.size) return false;
  const bonds = model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
  return ringsOf({ ...model, atoms, bonds }).some((r) => r.key === key);
}

/** The rings all of whose atoms are among `ids`, by key. */
export function ringsAmong(model: Model, ids: ReadonlySet<number>): string[] {
  return ringsOf(model)
    .filter((r) => r.ids.every((id) => ids.has(id)))
    .map((r) => r.key);
}

/**
 * What is kept of each ring whose atoms are all among `ids`, by key - its
 * fill, whether its circle is drawn: what a copy of them carries, and what
 * a workspace saves of rings still drawn.
 */
export function fillsAmong<T = RingFills[string]>(fills: Readonly<Record<string, T>> | undefined, ids: ReadonlySet<number>): Record<string, T> {
  return Object.fromEntries(Object.entries(fills ?? {}).filter(([key]) => key.split("-").every((id) => ids.has(Number(id)))));
}
