/**
 * Marks that glide to their new places rather than jump (docs/EDITOR-2D.md, *Where*: R, S, E and Z): each, by its key, eased from where
 * it is drawn to where it is now placed over `DURATION.move`, on Meno's `EASE` - from the place it had reached when its place changed
 * again, so that a mark following a dragged atom moves on smoothly. A mark new to it, or one that is to go at once (`snap`: one dragged by
 * hand, which follows the pointer), is drawn where it is placed. Pure: the time is given.
 */
import { DURATION, EASE, eased } from "../../../theme/motion";

type Pt = { x: number; y: number };
/** Each mark's glide: where it set off from, where it is going, and when it set off (ms). */
export type MarkGlides = Map<string, { from: Pt; to: Pt; start: number }>;

/** Nearer than this in the page's units is the same place: no glide. */
const SAME = 1e-6;

const onMeno = (u: number) => eased(EASE, u);

function placeAt(g: { from: Pt; to: Pt; start: number }, now: number, ms: number, ease: (u: number) => number): Pt {
  const u = ease((now - g.start) / ms);
  return { x: g.from.x + (g.to.x - g.from.x) * u, y: g.from.y + (g.to.y - g.from.y) * u };
}

/**
 * Each of `marks` where it is drawn at `now` (ms), `glides` brought up to date with where each is placed; and whether any is still on
 * its way. Marks gone from `marks` are let go.
 */
export function markGlideStep<T extends { key: string; x: number; y: number }>(
  glides: MarkGlides,
  marks: readonly T[],
  now: number,
  snap: (key: string) => boolean = () => false,
  ms = DURATION.move * 1000,
  /** The curve it goes on: Meno's `EASE`, or another's that it goes with. */
  ease: (u: number) => number = onMeno,
): { marks: T[]; moving: boolean } {
  const keys = new Set(marks.map((m) => m.key));
  for (const k of [...glides.keys()]) if (!keys.has(k)) glides.delete(k);
  let moving = false;
  const out = marks.map((m) => {
    const to = { x: m.x, y: m.y };
    const g = glides.get(m.key);
    if (!g || snap(m.key)) {
      glides.set(m.key, { from: to, to, start: now });
      return m;
    }
    if (Math.hypot(g.to.x - to.x, g.to.y - to.y) > SAME) glides.set(m.key, { from: placeAt(g, now, ms, ease), to, start: now });
    const h = glides.get(m.key)!;
    if (now - h.start >= ms) return m;
    moving = true;
    const p = placeAt(h, now, ms, ease);
    return { ...m, x: p.x, y: p.y };
  });
  return { marks: out, moving };
}
