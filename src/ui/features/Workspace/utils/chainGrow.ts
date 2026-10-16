/**
 * How a chain's new bonds grow (the maintainer, 2026-10-15: "a little more
 * nyu-nyu-nyu"): each new atom goes out from the one its bond comes from to
 * its place, eased out with no overshoot; one taken back by retracing goes
 * back the same way; several laid in one frame go one after another, each
 * out of the last. Pure: where each is at a time, given when each began.
 */
import type { Pt } from "./honeycomb";
import type { StrokeNode } from "./stroke";

/** How long one bond takes to grow, in ms, before it is made as slow as `CHAIN_EASE` says. */
export const GROW_MS = 140;
/** How soon after the one before it each of several laid at once begins, as a part of the time one takes. */
export const STAGGER = 0.55;

const easeOut = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/** A node of the stroke as it is drawn: where it is now, how far out it is, and whether it is on its way back. */
export type GrownNode = { node: StrokeNode; id: number; x: number; y: number; grown: number; going: boolean };

type Held = { node: StrokeNode; key: string; start: number; going: boolean };

const keyOf = (n: StrokeNode, i: number) => `${i}:${n.x.toFixed(3)},${n.y.toFixed(3)}:${n.atomId ?? ""}:${n.pathIndex ?? ""}`;

/**
 * The state of a chain's growing: what it holds of the nodes drawn, each
 * from when. `set` is told the nodes the stroke has now, and `at` gives
 * where each is at a time, the ones taken back included until they are in.
 */
export class ChainGrow {
  private held = new Map<string, Held & { i: number }>();
  private last = 0;
  readonly ms: number;

  constructor(ease = 1) {
    this.ms = GROW_MS * ease;
  }

  /** The nodes now: those new begin, staggered from `now`; those not there any more go back. */
  set(nodes: readonly StrokeNode[], now: number): void {
    const keys = nodes.map((n, i) => keyOf(n, i));
    const present = new Set(keys);
    // (a node's place taken by another: the one before goes at once)
    for (const [k, h] of [...this.held]) {
      if (!present.has(k) && nodes[h.i] != null) this.held.delete(k);
    }
    // (those back from where they were, the later one first)
    let back = now;
    for (const [k, h] of [...this.held].reverse()) {
      if (present.has(k) || h.going) continue;
      this.held.set(k, { ...h, going: true, start: back });
      back += this.ms * STAGGER;
    }
    let at = Math.max(now, this.last);
    nodes.forEach((n, i) => {
      const k = keys[i];
      const was = this.held.get(k);
      if (was && !was.going) return;
      this.held.set(k, { node: n, key: k, start: at, going: false, i });
      at += this.ms * STAGGER;
    });
    this.last = Math.max(now, at - this.ms * STAGGER);
  }

  /** Where each node is at `now`, with `parent` giving the place a node grows from (its own place being `to`). Done ones are let go. */
  at(now: number, from: (n: StrokeNode, i: number, shown: readonly { x: number; y: number }[]) => Pt): { out: (Held & { i: number; x: number; y: number; grown: number })[]; moving: boolean } {
    const out: (Held & { i: number; x: number; y: number; grown: number })[] = [];
    let moving = false;
    const shown: { x: number; y: number }[] = [];
    const items = [...this.held.values()].sort((a, b) => a.i - b.i);
    for (const h of items) {
      const u = (now - h.start) / this.ms;
      const g = h.going ? 1 - easeOut(u) : easeOut(u);
      if (h.going && u >= 1) {
        this.held.delete(h.key);
        continue;
      }
      if (u < 1) moving = true;
      const origin = from(h.node, h.i, shown);
      const x = origin.x + (h.node.x - origin.x) * g;
      const y = origin.y + (h.node.y - origin.y) * g;
      shown[h.i] = { x, y };
      out.push({ ...h, x, y, grown: g });
    }
    return { out, moving };
  }
}
