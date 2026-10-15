/**
 * Catalytic cycles as the page has them (lib/chem/cycle): what lies on
 * each - its structures, each with its labels, and its words - measured as
 * the canvas draws them, the arrows each is drawn with, what moves with a
 * cycle, and where a thing let go near a cycle's line is put on it.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelSetOf } from "../../../../lib/chem/layout2d";
import { wordsSet } from "../../../../lib/chem/captions";
import { branchPath, cycleArrows, cycleMembers, ontoCycle, type Cycle, type CycleArrow, type CycleBox, type CycleMember } from "../../../../lib/chem/cycle";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { follow, TAU } from "../../../theme/motion";
import { editorLayoutOptions } from "../layoutOptions";
import type { Caption, Model } from "../store/types";
import { structuresOf } from "../workflow/entries";

/** What may lie on a cycle: a structure, by its atoms, or words, by their id - and the box round it. */
export type CycleThing = { atoms?: number[]; caption?: number; box: CycleBox };

/**
 * Where a cycle was last pointed at on its line, round it (radians): where an
 * arrow coming in or going out is put from its menu.
 */
export const cyclePointed: { id: number | null; angle: number } = { id: null, angle: 0 };

/** How near a cycle's line a thing let go is put on it, in bonds. */
const SNAP = 1.0;
/** How near the far end of an arrow coming in or going out its words lie, to go with the cycle, in bonds. */
const LABEL_NEAR = 1.4;

/** The structures and words on the page, each with the box round it as it is drawn: a structure's atoms, its labels' letters about them. */
export function cycleThings(model: Pick<Model, "atoms" | "bonds">, captions: readonly Caption[], style: DrawingStyle): CycleThing[] {
  const opts = editorLayoutOptions(style);
  const pad = opts.fontPx * 0.45;
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const out: CycleThing[] = [];
  for (const ids of structuresOf(model as Model)) {
    let box: CycleBox | null = null;
    for (const id of ids) {
      const a = at.get(id);
      if (!a) continue;
      const r = a.el === "C" ? 0 : pad;
      box = box ? { x0: Math.min(box.x0, a.x - r), y0: Math.min(box.y0, a.y - r), x1: Math.max(box.x1, a.x + r), y1: Math.max(box.y1, a.y + r) } : { x0: a.x - r, y0: a.y - r, x1: a.x + r, y1: a.y + r };
    }
    if (box) out.push({ atoms: ids, box });
  }
  const set = labelSetOf(opts);
  for (const c of captions) {
    const w = wordsSet(c, opts, set);
    out.push({ caption: c.id, box: { x0: c.x - w.halfW, y0: c.y - w.halfH, x1: c.x + w.halfW, y1: c.y + w.halfH } });
  }
  return out;
}

/** The arrows the cycles are drawn with, what is on each measured from `things`. */
export function arrowsOfCycles(cycles: readonly Cycle[], things: readonly CycleThing[]): CycleArrow[] {
  const boxes = things.map((t) => t.box);
  return cycles.flatMap((c) => cycleArrows(c, boxes, NOMINAL_BOND_LENGTH));
}

/** What goes with a cycle as it is moved or sized: what is on its line, and the words at its arrows' far ends. */
export function carriedByCycle(c: Cycle, things: readonly CycleThing[]): { atoms: number[]; captions: number[] } {
  const on = new Set(cycleMembers(c, things.map((t) => t.box), NOMINAL_BOND_LENGTH).map((m) => m.index));
  const labels = (c.branches ?? []).map((b) => branchPath(c, b, NOMINAL_BOND_LENGTH).label);
  const atoms: number[] = [];
  const captions: number[] = [];
  things.forEach((t, i) => {
    const m = { x: (t.box.x0 + t.box.x1) / 2, y: (t.box.y0 + t.box.y1) / 2 };
    const near = t.caption != null && labels.some((l) => Math.hypot(l.x - m.x, l.y - m.y) < LABEL_NEAR * NOMINAL_BOND_LENGTH);
    if (!on.has(i) && !near) return;
    if (t.atoms) atoms.push(...t.atoms);
    if (t.caption != null) captions.push(t.caption);
  });
  return { atoms, captions };
}

/** How far a thing let go with its box at `box` is moved to lie on the line of the cycle nearest it - none, where no cycle's line is near (`SNAP` bonds). */
export function snapToCycles(cycles: readonly Cycle[], box: CycleBox): { x: number; y: number } | null {
  const m = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  let best: { d: number; c: Cycle } | null = null;
  for (const c of cycles) {
    const d = Math.abs(Math.hypot(m.x - c.x, m.y - c.y) - c.r);
    if (d <= SNAP * NOMINAL_BOND_LENGTH && (!best || d < best.d)) best = { d, c };
  }
  if (!best) return null;
  const by = ontoCycle(best.c, box);
  return Math.hypot(by.x, by.y) > 1e-6 ? by : null;
}

/** Which thing on the page a thing is, from one measuring to the next: a structure by its first atom, words by their id. */
export function thingKey(t: CycleThing): string {
  return t.atoms ? `a${Math.min(...t.atoms)}` : `c${t.caption}`;
}

/**
 * What is on a cycle as it is drawn, following what is on it: the circle
 * opening round what comes on to its line and closing after what goes off
 * it, eased rather than at a jump. `take` is given what is on it now, each
 * with its `thingKey`; `step` moves on by `dt` seconds and says whether
 * anything is still on its way.
 */
export class CycleEase {
  private shown = new Map<string, CycleMember & { to: number }>();
  private last: readonly (CycleMember & { key: string })[] | null = null;

  take(now: readonly (CycleMember & { key: string })[]): void {
    if (now === this.last) return;
    // (as they are, the first time: a cycle opened is not drawn opening)
    const first = this.last === null;
    this.last = now;
    const on = new Set(now.map((m) => m.key));
    for (const m of now) {
      const was = this.shown.get(m.key);
      this.shown.set(m.key, { index: m.index, angle: m.angle, half: was ? was.half : first ? m.half : 0, to: m.half });
    }
    for (const [k, s] of this.shown) if (!on.has(k)) this.shown.set(k, { ...s, to: 0, passing: true });
  }

  step(dt: number): boolean {
    let moving = false;
    for (const [k, s] of this.shown) {
      if (Math.abs(s.half - s.to) < 1e-4) {
        s.half = s.to;
        if (s.passing) this.shown.delete(k);
        continue;
      }
      s.half = follow(s.half, s.to, dt, TAU.move);
      moving = true;
    }
    return moving;
  }

  members(): CycleMember[] {
    return [...this.shown.values()].map(({ index, angle, half, passing }) => ({ index, angle, half, ...(passing ? { passing } : {}) }));
  }
}
