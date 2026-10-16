/**
 * Catalytic cycles as the page has them (lib/chem/cycle): what lies on
 * each - its structures, each with its labels, and its words - measured as
 * the canvas draws them, the arrows each is drawn with, what moves with a
 * cycle, and where a thing let go near a cycle's line is put on it.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelSetOf } from "../../../../lib/chem/layout2d";
import { wordsSet } from "../../../../lib/chem/captions";
import { branchPath, cycleArrows, cycleMembers, ontoCycle, type Cycle, type CycleArrow, type CycleBox, type CycleBranch, type CycleInk, type CycleMember, type CycleMotion } from "../../../../lib/chem/cycle";
import type { DrawingStyle } from "../../../../lib/chem/style";
import { styleOf } from "../../../../lib/chem/style";
import { DURATION, follow, TAU } from "../../../theme/motion";
import type { EditorStore } from "../store";
import { editorLayoutOptions } from "../layoutOptions";
import { labelBoxes, labelledPart } from "./freePlace";
import type { Caption, Model } from "../store/types";
import { structuresOf } from "../workflow/entries";

/** What may lie on a cycle: a structure, by its atoms, or words, by their id - the box round it, and what is drawn of it (`ink`), for the circle to stop short of. */
export type CycleThing = { atoms?: number[]; caption?: number; box: CycleBox; ink?: CycleInk };

/**
 * Where a cycle was last pointed at on its line, round it (radians): where an
 * arrow coming in or going out is put from its menu.
 */
export const cyclePointed: { id: number | null; angle: number } = { id: null, angle: 0 };

/** How near a cycle's line a thing let go is put on it, in bonds. */
const SNAP = 1.0;
/** How near the far end of an arrow coming in or going out its words lie, to go with the cycle, in bonds. */
const LABEL_NEAR = 1.4;
/** How near a cycle's line anything is measured, in bonds: what lies further can be on no cycle, nor be put on one, nor be the words by its arrows. */
const NEAR = 3;

/** Whether a box comes within `reach` of a cycle's line. */
function nearLine(c: Cycle, b: CycleBox, reach: number): boolean {
  const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1);
  const dy = Math.max(b.y0 - c.y, 0, c.y - b.y1);
  const far = Math.hypot(Math.max(Math.abs(b.x0 - c.x), Math.abs(b.x1 - c.x)), Math.max(Math.abs(b.y0 - c.y), Math.abs(b.y1 - c.y)));
  return Math.hypot(dx, dy) - reach <= c.r && c.r <= far + reach;
}

/**
 * The structures and words on the page, each with the box round it as it is
 * drawn: a structure's atoms and its labels' letters as far as they reach -
 * HO, B(OH)2 - and words as they are set. With `near`, only those that come
 * within a few bonds of one of those cycles' lines: the rest can be on none.
 */
export function cycleThings(model: Pick<Model, "atoms" | "bonds">, captions: readonly Caption[], style: DrawingStyle, near?: readonly Cycle[]): CycleThing[] {
  if (near && !near.length) return [];
  const opts = editorLayoutOptions(style);
  const reach = NEAR * NOMINAL_BOND_LENGTH;
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const out: CycleThing[] = [];
  for (const ids of structuresOf(model as Model)) {
    let box: CycleBox | null = null;
    const take = (b: CycleBox) => (box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b);
    for (const id of ids) {
      const a = at.get(id);
      if (a) take({ x0: a.x, y0: a.y, x1: a.x, y1: a.y });
    }
    if (!box || (near && !near.some((c) => nearLine(c, box!, reach)))) continue;
    // (its labels' letters, as the drawing sets them)
    const these = new Set(ids);
    const part = { atoms: ids.flatMap((id) => (at.has(id) ? [at.get(id)!] : [])), bonds: model.bonds.filter((b) => these.has(b.a) && these.has(b.b)) };
    const letters = labelBoxes(labelledPart(part as Model), style);
    for (const b of letters) take(b);
    // (its bonds as drawn: each line as wide as it is drawn - a double bond's two, a wedge's broad end, a wave's swing)
    const line = opts.lineWidthPx / 2;
    const lines = part.bonds.flatMap((b) => {
      const a1 = at.get(b.a);
      const a2 = at.get(b.b);
      if (!a1 || !a2) return [];
      const half =
        b.order === 3 ? opts.tripleOffsetPx + line
        : b.order === 2 ? opts.doubleOffsetPx + line
        : b.stereo === "wavy" ? opts.wavyAmpPx + line
        : b.stereo === "up" || b.stereo === "down" || (b.display && b.display !== "plain" && b.display !== "dashed") ? opts.wedgeWidthPx / 2
        : line;
      return [{ a: { x: a1.x, y: a1.y }, b: { x: a2.x, y: a2.y }, half }];
    });
    // (an atom alone, with no letters: its point)
    const points = part.bonds.length || letters.length ? [] : part.atoms.map((a) => ({ x0: a.x - line, y0: a.y - line, x1: a.x + line, y1: a.y + line }));
    out.push({ atoms: ids, box, ink: { lines, boxes: [...letters, ...points] } });
  }
  const set = labelSetOf(opts);
  for (const c of captions) {
    const w = wordsSet(c, opts, set);
    const box = { x0: c.x - w.halfW, y0: c.y - w.halfH, x1: c.x + w.halfW, y1: c.y + w.halfH };
    if (near && !near.some((cy) => nearLine(cy, box, reach))) continue;
    out.push({ caption: c.id, box, ink: { lines: [], boxes: [box] } });
  }
  return out;
}

/** What is on a cycle, of `things`: each by its box's middle, the circle cut short of its ink. */
export function membersOn(c: Cycle, things: readonly CycleThing[]): CycleMember[] {
  return cycleMembers(c, things.map((t) => t.box), NOMINAL_BOND_LENGTH, things.map((t) => t.ink));
}

/** The arrows the cycles are drawn with, what is on each measured from `things`. */
export function arrowsOfCycles(cycles: readonly Cycle[], things: readonly CycleThing[]): CycleArrow[] {
  const boxes = things.map((t) => t.box);
  return cycles.flatMap((c) => cycleArrows(c, boxes, NOMINAL_BOND_LENGTH, membersOn(c, things)));
}

/** The words by the far end of a cycle's arrow coming in or going out, of `things`: the nearest, within `LABEL_NEAR` bonds - none, where there are none. */
export function branchWords(c: Cycle, b: CycleBranch, things: readonly CycleThing[]): number | null {
  const l = branchPath(c, b, NOMINAL_BOND_LENGTH).label;
  let best: { d: number; id: number } | null = null;
  for (const t of things) {
    if (t.caption == null) continue;
    const d = Math.hypot((t.box.x0 + t.box.x1) / 2 - l.x, (t.box.y0 + t.box.y1) / 2 - l.y);
    if (d < LABEL_NEAR * NOMINAL_BOND_LENGTH && (!best || d < best.d)) best = { d, id: t.caption };
  }
  return best?.id ?? null;
}

/** What goes with a cycle as it is moved or sized: what is on its line, and the words at its arrows' far ends. */
export function carriedByCycle(c: Cycle, things: readonly CycleThing[]): { atoms: number[]; captions: number[] } {
  const on = new Set(membersOn(c, things).map((m) => m.index));
  const words = new Set((c.branches ?? []).map((b) => branchWords(c, b, things)));
  const atoms: number[] = [];
  const captions: number[] = [];
  things.forEach((t, i) => {
    if (!on.has(i) && !(t.caption != null && words.has(t.caption))) return;
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
  private shown = new Map<string, CycleMember & { toLo: number; toHi: number }>();
  private last: readonly (CycleMember & { key: string })[] | null = null;

  take(now: readonly (CycleMember & { key: string })[]): void {
    if (now === this.last) return;
    // (as they are, the first time: a cycle opened is not drawn opening)
    const first = this.last === null;
    this.last = now;
    const on = new Set(now.map((m) => m.key));
    for (const m of now) {
      const was = this.shown.get(m.key);
      const from = (side: "lo" | "hi") => (was ? was[side] : first ? m[side] : 0);
      this.shown.set(m.key, { index: m.index, angle: m.angle, lo: from("lo"), hi: from("hi"), toLo: m.lo, toHi: m.hi });
    }
    for (const [k, s] of this.shown) if (!on.has(k)) this.shown.set(k, { ...s, toLo: 0, toHi: 0, passing: true });
  }

  step(dt: number): boolean {
    let moving = false;
    for (const [k, s] of this.shown) {
      if (Math.abs(s.lo - s.toLo) < 1e-4 && Math.abs(s.hi - s.toHi) < 1e-4) {
        s.lo = s.toLo;
        s.hi = s.toHi;
        if (s.passing) this.shown.delete(k);
        continue;
      }
      s.lo = follow(s.lo, s.toLo, dt, TAU.move);
      s.hi = follow(s.hi, s.toHi, dt, TAU.move);
      moving = true;
    }
    return moving;
  }

  members(): CycleMember[] {
    return [...this.shown.values()].map(({ index, angle, lo, hi, passing }) => ({ index, angle, lo, hi, ...(passing ? { passing } : {}) }));
  }
}

/** How long a cycle takes to turn round, in seconds: its heads travelling round, its arrows in and out and their words swinging across. */
export const TURN_S = DURATION.move * 1.5;

/** The way a turn goes, from 0 to 1: as gentle out of its start as into its end. */
export function turnEase(t: number): number {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
}

const branchKey = (b: CycleBranch) => `${b.way}:${b.at.toFixed(5)}`;

/**
 * A cycle as it is drawn while it changes, following what it is: turned
 * round, its heads travel round to the other ends of its stretches; an
 * arrow coming in or going out put there grows, and one taken away goes -
 * eased, rather than at a jump. `take` is given the cycle as it is now;
 * `step` moves on by `dt` seconds and says whether anything is still on its
 * way; `motion` is what `cycleArrows` draws it with.
 */
export class CycleChange {
  private ccw: boolean | null = null;
  /** How far round its turn it is, in time, 0 to 1: 1, not turning. */
  private t = 1;
  private shown: { key: string; b: CycleBranch; grown: number; to: number }[] = [];
  private last: readonly CycleBranch[] | null = null;

  take(c: Cycle): void {
    const ccw = !!c.ccw;
    // (turned round again on the way: back from where it has got to)
    if (this.ccw !== null && ccw !== this.ccw) this.t = 1 - this.t;
    this.ccw = ccw;
    const now = c.branches ?? [];
    if (now === this.last) return;
    // (as they are, the first time: a cycle opened is not drawn growing)
    const first = this.last === null;
    this.last = now;
    const keys = new Set(now.map(branchKey));
    for (const s of this.shown) if (!keys.has(s.key)) s.to = 0;
    for (const b of now) {
      const s = this.shown.find((x) => x.key === branchKey(b));
      if (s) Object.assign(s, { b, to: 1 });
      else this.shown.push({ key: branchKey(b), b, grown: first ? 1 : 0, to: 1 });
    }
  }

  step(dt: number): boolean {
    let moving = false;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / TURN_S);
      moving = true;
    }
    this.shown = this.shown.filter((s) => {
      if (Math.abs(s.grown - s.to) < 1e-3) {
        s.grown = s.to;
        return s.to > 0;
      }
      s.grown = follow(s.grown, s.to, dt, TAU.move);
      moving = true;
      return true;
    });
    return moving;
  }

  motion(): CycleMotion {
    return { ...(this.t < 1 ? { turn: turnEase(this.t) } : {}), branches: this.shown.map(({ b, grown }) => ({ b, grown })) };
  }
}

/**
 * A cycle turned round, as one step: the way it goes, and the words by its
 * arrows coming in and going out carried across to where those arrows now
 * end, in time with the arrows swinging across (`TURN_S`, `turnEase`).
 */
export function turnCycle(store: EditorStore, id: number, frame: (go: () => void) => void = (go) => void requestAnimationFrame(go)): void {
  const st = store.getState();
  const c = st.cycles.find((x) => x.id === id);
  if (!c) return;
  const turned: Cycle = { ...c, ccw: c.ccw ? undefined : true };
  const things = cycleThings(st.model, st.captions, styleOf(st.docStyle), [c]);
  const moves = (c.branches ?? []).flatMap((b) => {
    const words = st.captions.find((w) => w.id === branchWords(c, b, things));
    if (!words) return [];
    const from = branchPath(c, b, NOMINAL_BOND_LENGTH).label;
    const to = branchPath(turned, b, NOMINAL_BOND_LENGTH).label;
    return [{ id: words.id, x: words.x, y: words.y, dx: to.x - from.x, dy: to.y - from.y }];
  });
  const gesture = `turn-${performance.now()}`;
  const start = performance.now();
  const go = () => {
    const t = Math.min((performance.now() - start) / (TURN_S * 1000), 1);
    const u = turnEase(t);
    store.getState().updateCycle(id, { ccw: !c.ccw }, gesture, moves.map((m) => ({ id: m.id, x: m.x + m.dx * u, y: m.y + m.dy * u })));
    if (t < 1) frame(go);
  };
  go();
}
