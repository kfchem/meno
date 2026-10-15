import { describe, expect, it } from "vitest";
import { ChainGrow, GROW_MS, STAGGER } from "./chainGrow";
import type { StrokeNode } from "./stroke";

const node = (x: number, y: number, from?: number): StrokeNode => ({ x, y, ...(from != null ? { from } : {}) });
const parent = (_nodes: readonly StrokeNode[], base = { x: 0, y: 0 }) => (n: StrokeNode, i: number, shown: readonly { x: number; y: number }[]) =>
  (n.from != null ? (n.from === -1 ? base : shown[n.from]) : i > 0 ? shown[i - 1] : base) ?? base;

describe("a chain's new bonds growing", () => {
  it("a new atom goes out from the one its bond comes from to its place, eased out and never past it", () => {
    const g = new ChainGrow();
    const nodes = [node(1, 0)];
    g.set(nodes, 1000);
    const xs: number[] = [];
    for (let t = 0; t <= GROW_MS + 20; t += 10) xs.push(g.at(1000 + t, parent(nodes)).out[0].x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(1);
    for (let k = 1; k < xs.length; k++) {
      expect(xs[k]).toBeGreaterThanOrEqual(xs[k - 1]);
      expect(xs[k]).toBeLessThanOrEqual(1);
    }
    // (quick out of its start: more than half the way in the first third)
    expect(xs[Math.floor(xs.length / 3)]).toBeGreaterThan(0.5);
  });

  it("is that much slower as the ease says: the same shape over longer", () => {
    const fast = new ChainGrow(1);
    const slow = new ChainGrow(1.3);
    expect(slow.ms).toBeCloseTo(1.3 * fast.ms, 9);
  });

  it("several laid in one frame go one after another, each out of the one before it", () => {
    const g = new ChainGrow();
    const nodes = [node(1, 0), node(2, 0), node(3, 0)];
    g.set(nodes, 0);
    const early = g.at(10, parent(nodes)).out;
    // (the second has not begun: still at the first's place as it is now)
    expect(early[1].grown).toBe(0);
    expect(early[1].x).toBeCloseTo(early[0].x, 9);
    const later = g.at(GROW_MS * STAGGER + 30, parent(nodes)).out;
    expect(later[1].grown).toBeGreaterThan(0);
    expect(later[2].grown).toBe(0);
    const done = g.at(GROW_MS * (1 + 2 * STAGGER) + 10, parent(nodes));
    expect(done.out.map((h) => h.x)).toEqual([1, 2, 3]);
    expect(done.moving).toBe(false);
  });

  it("one taken back by retracing shrinks the same way into the one before it, and is let go", () => {
    const g = new ChainGrow();
    let nodes = [node(1, 0), node(2, 0)];
    g.set(nodes, 0);
    g.at(1000, parent(nodes));
    nodes = [node(1, 0)];
    g.set(nodes, 1000);
    const mid = g.at(1000 + GROW_MS / 2, parent(nodes)).out;
    const back = mid.find((h) => h.going)!;
    expect(back.x).toBeGreaterThan(1);
    expect(back.x).toBeLessThan(2);
    const gone = g.at(1000 + GROW_MS + 20, parent(nodes));
    expect(gone.out.filter((h) => h.going)).toHaveLength(0);
    expect(gone.out.map((h) => h.x)).toEqual([1]);
  });

  it("goes to where it is where nothing changes: no node moves once grown", () => {
    const g = new ChainGrow();
    const nodes = [node(1, 0), node(1.5, 0.9)];
    g.set(nodes, 0);
    g.at(2000, parent(nodes));
    g.set(nodes, 2000);
    const s = g.at(2001, parent(nodes));
    expect(s.moving).toBe(false);
    expect(s.out.map((h) => [h.x, h.y])).toEqual([[1, 0], [1.5, 0.9]]);
  });
});
