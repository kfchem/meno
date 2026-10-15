/**
 * How guides come and go (docs/PRESENTING.md, *Guides*): each fades in over
 * `FADE_IN_MS` and out over `FADE_OUT_MS`; one that is there for less than
 * `SHOW_AFTER_MS` - an alignment passed in a fast drag - is not shown at
 * all, the snap itself unaffected; and one that moves to a new line goes
 * there, not away and back. A guide is a slot among those of its kind and
 * direction: the third vertical line is the third, wherever it lies.
 * Time is given, not read: the same as the guides are drawn, and tested.
 */
import type { GuideMarks, Seg } from "./guides";

export const FADE_IN_MS = 100;
export const FADE_OUT_MS = 150;
export const SHOW_AFTER_MS = 80;
/** The time constant, in ms, with which a guide goes to a new line. */
export const GLIDE_MS = 50;

type Slot = {
  /** Where it should be, and where it is drawn (going there). */
  seg: Seg;
  shown: Seg;
  /** Whether the drag has it now, and since when without a break. */
  present: boolean;
  since: number;
  /** How opaque it is drawn, 0 to 1. */
  level: number;
};

export type Faded = { seg: Seg; level: number; mark: boolean };

const vertical = (s: Seg) => Math.abs(s.x2 - s.x1) <= Math.abs(s.y2 - s.y1);

export class GuideFade {
  private readonly slots = new Map<string, Slot>();
  private at: number | null = null;

  /**
   * The guides at `now` (ms), `marks` being those the drag has or none: each
   * as it is drawn, and whether any is still on its way (a frame is wanted).
   */
  update(now: number, marks: GuideMarks | null): { drawn: Faded[]; moving: boolean } {
    const dt = this.at == null ? 0 : Math.max(0, now - this.at);
    const glide = 1 - Math.exp(-dt / GLIDE_MS);
    this.at = now;
    const wanted = new Map<string, { seg: Seg; mark: boolean }>();
    const count = new Map<string, number>();
    const add = (s: Seg, mark: boolean) => {
      const group = `${mark ? "m" : "l"}${vertical(s) ? "v" : "h"}`;
      const i = count.get(group) ?? 0;
      count.set(group, i + 1);
      wanted.set(`${group}${i}`, { seg: s, mark });
    };
    for (const l of marks?.lines ?? []) add(l, false);
    for (const m of marks?.marks ?? []) add(m, true);
    let moving = false;
    for (const [key, w] of wanted) {
      const was = this.slots.get(key);
      if (!was) {
        this.slots.set(key, { seg: w.seg, shown: w.seg, present: true, since: now, level: 0 });
      } else {
        if (!was.present) was.since = now;
        was.present = true;
        was.seg = w.seg;
        // (a guide not drawn at all goes to its place at once; one drawn glides there, below)
        if (was.level <= 0) was.shown = w.seg;
      }
    }
    const drawn: Faded[] = [];
    for (const [key, slot] of [...this.slots]) {
      if (!wanted.has(key)) slot.present = false;
      const shows = slot.present && now - slot.since >= SHOW_AFTER_MS;
      slot.level = shows ? Math.min(1, slot.level + dt / FADE_IN_MS) : Math.max(0, slot.level - dt / FADE_OUT_MS);
      if (!slot.present && slot.level <= 0) {
        this.slots.delete(key);
        continue;
      }
      if (slot.present && !same(slot.shown, slot.seg)) slot.shown = approach(slot.shown, slot.seg, glide);
      if (slot.level > 0) drawn.push({ seg: slot.shown, level: slot.level, mark: key[0] === "m" });
      // (waiting to be shown, fading, or gliding: a frame is wanted)
      if (slot.present ? slot.level < 1 || !same(slot.shown, slot.seg) : slot.level > 0) moving = true;
    }
    return { drawn, moving };
  }

  /** Nothing held: for a drag that ended and has faded out. */
  get idle(): boolean {
    return this.slots.size === 0;
  }
}

function same(a: Seg, b: Seg): boolean {
  return Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) + Math.abs(a.x2 - b.x2) + Math.abs(a.y2 - b.y2) < 1e-9;
}

/** `a` a share `k` of the way to `b`, all of the way once it is close. */
function approach(a: Seg, b: Seg, k: number): Seg {
  const near = Math.abs(a.x1 - b.x1) + Math.abs(a.y1 - b.y1) + Math.abs(a.x2 - b.x2) + Math.abs(a.y2 - b.y2) < 1e-6;
  if (near) return b;
  return { x1: a.x1 + (b.x1 - a.x1) * k, y1: a.y1 + (b.y1 - a.y1) * k, x2: a.x2 + (b.x2 - a.x2) * k, y2: a.y2 + (b.y2 - a.y2) * k };
}
