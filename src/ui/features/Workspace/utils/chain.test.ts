import { describe, expect, it } from "vitest";
import { followChain, startChain, trailShown, type Chain } from "./chain";
import { cellOf } from "./honeycomb";
import type { Pt } from "./honeycomb";

const L = 1.8;

/** The pointer led along points, a little at a time. */
function lead(c: Chain, points: Pt[], steps = 12): Chain {
  let at = c.trail[c.trail.length - 1];
  for (const p of points) {
    for (let i = 1; i <= steps; i++) c = followChain(c, { x: at.x + ((p.x - at.x) * i) / steps, y: at.y + ((p.y - at.y) * i) / steps });
    at = p;
  }
  return c;
}

/** The ring the walk closed, as many members as the way round is bonds; none where it came round to no point again. */
function closedRing(c: Chain): number | null {
  const again = c.walk.findIndex((k, i) => c.walk.indexOf(k) !== i);
  return again < 0 ? null : again - c.walk.indexOf(c.walk[again]);
}

/** Points round a circle about `centre`, from the angle `from`, `turns` of the way round. */
const round = (centre: Pt, r: number, from: number, turns: number, n = 48): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + (2 * Math.PI * turns * i) / n;
    return { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
  });

describe("a chain traced on its honeycomb", () => {
  it("zigzags along it towards the pointer, a bond a step", () => {
    const c = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 4 * L * Math.cos(Math.PI / 6), y: 0 }]);
    expect(c.walk.length).toBeGreaterThanOrEqual(4);
    const pts = c.walk.map((k) => cellOf(c.honeycomb, k));
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeCloseTo(L, 9);
    // across, up and down by half a bond
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeCloseTo(L / 2, 9);
  });

  it("takes its bonds back when led back the way it came, and draws no ring for that", () => {
    const out = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 3 * L, y: 0 }]);
    const back = lead(out, [{ x: 0.2 * L, y: 0 }]);
    expect(back.walk).toEqual(["0,0,A"]);
  });

  it("takes its bonds back when led back a little beside the way it came, and closes no ring for that", () => {
    // (as led in the app: from a methyl, its bond up and a little right, out
    // and back again a little lower; the way back as near going on beside
    // the chain as going back along it)
    const k = L / 98;
    const at = (x: number, y: number): Pt => ({ x: (x - 824) * k, y: -(y - 1146) * k });
    for (const steps of [7, 20, 40]) {
      const c0 = startChain(at(824, 1146), [at(843, 1050)], L);
      const out = lead(c0, [at(1324, 1180)], steps);
      const back = lead(out, [at(1060, 1160)], steps);
      expect(closedRing(back)).toBeNull();
      expect(out.walk.slice(0, back.walk.length)).toEqual(back.walk);
    }
  });

  it("closes a six-membered ring when led round a hexagon of it", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    // the hexagon above the start: its centre one bond straight up
    const centre = { x: 0, y: L };
    const c = lead(c0, round(centre, L, -Math.PI / 2, 1.02, 60), 3);
    expect(c.walk[0]).toBe("0,0,A");
    expect(c.walk[c.walk.length - 1]).toBe("0,0,A");
    expect(closedRing(c)).toBe(6);
  });

  it("closes a ten-membered ring when led round two hexagons of it - the honeycomb's ring, not a six", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    // round the hexagon above the start and the one to its right, along their outside
    const h = (Math.sqrt(3) / 2) * L;
    const way = [
      { x: -h, y: 0.5 * L },
      { x: -h, y: 1.5 * L },
      { x: 0, y: 2 * L },
      { x: h, y: 1.5 * L },
      { x: 2 * h, y: 2 * L },
      { x: 3 * h, y: 1.5 * L },
      { x: 3 * h, y: 0.5 * L },
      { x: 2 * h, y: 0 },
      { x: h, y: 0.5 * L },
      { x: 0, y: 0 },
    ];
    const c = lead(c0, way, 8);
    expect(c.walk).toHaveLength(11);
    expect(c.walk[10]).toBe(c.walk[0]);
    expect(closedRing(c)).toBe(10);
  });

  it("closes the ring along the honeycomb for a loop back round to the chain, however long the loop", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    for (const [bonds, members] of [
      [5, 6],
      [9, 10],
      [12, 14],
    ]) {
      // round a loop about as long as that many bonds, from the start and back to it
      const rr = (bonds * L) / (2 * Math.PI);
      const centre = { x: 0.2 * rr, y: Math.sqrt(1 - 0.04) * rr };
      const from = Math.atan2(-centre.y, -centre.x);
      const c = lead(c0, round(centre, rr, from, -1, 90), 3);
      // (a ring of the honeycomb: six members round one hexagon, ten round two, fourteen round three)
      expect(closedRing(c)).toBe(members);
      // on the loop's side: above the start
      const cells = c.walk.map((k) => cellOf(c.honeycomb, k));
      expect(cells.reduce((y, p) => y + p.y, 0)).toBeGreaterThan(0);
    }
  });

  it("closes the hexagon's ring for a loop traced with a trembling hand too", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    const rr = (5 * L) / (2 * Math.PI);
    const centre = { x: 0.2 * rr, y: Math.sqrt(1 - 0.04) * rr };
    const from = Math.atan2(-centre.y, -centre.x);
    // each point of the way a little off it, to one side and back
    const shaky = round(centre, rr, from, -1, 60).flatMap((p) => [{ x: p.x - 0.08 * L, y: p.y }, p]);
    const c = lead(c0, shaky, 1);
    expect(closedRing(c)).toBe(6);
  });

  it("draws no ring for a small loop that comes round to no point of the chain", () => {
    const out = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 2 * L, y: 0 }]);
    const head = cellOf(out.honeycomb, out.walk[out.walk.length - 1]);
    // round, inside the hexagon by the head: once a ring as long as the loop, now none
    const c = lead(out, round({ x: head.x, y: head.y + 0.4 * L }, 0.4 * L, -Math.PI / 2, 1, 40), 2);
    expect(closedRing(c)).toBeNull();
  });

  it("draws no ring for a way out and back that encloses only a sliver", () => {
    const out = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 3 * L, y: 0 }]);
    const back = lead(out, [{ x: 3 * L, y: -0.35 * L }, { x: 0.1 * L, y: -0.35 * L }]);
    expect(closedRing(back)).toBeNull();
  });

  it("keeps a ring the chain goes on from, and lets it go when led back past it", () => {
    let c = startChain({ x: 0, y: 0 }, [], L);
    const out = lead(c, [{ x: 2 * L, y: 0 }]);
    const head = cellOf(out.honeycomb, out.walk[out.walk.length - 1]);
    const centre = { x: head.x, y: head.y + L * 0.9 };
    c = lead(out, round(centre, L * 0.9, -Math.PI / 2, 1.0, 60), 3);
    c = lead(c, [{ x: head.x + 2 * L, y: head.y - 0.2 * L }]);
    // round the hexagon at the head: the walk comes back to it, and goes on
    expect(closedRing(c)).toBe(6);
    const back = lead(c, [{ x: 0, y: 0 }]);
    expect(closedRing(back)).toBeNull();
  });

  it("keeps a ring it has closed when led back over the bond that closed it, as onto a ring fused there", () => {
    const centre = { x: 0, y: L };
    const ring = lead(startChain({ x: 0, y: 0 }, [], L), round(centre, L, -Math.PI / 2, 1.0, 60), 3);
    expect(closedRing(ring)).toBe(6);
    // the bond that closed it came from the point up and to the left: back over it, and on past that point
    const before = cellOf(ring.honeycomb, ring.walk[ring.walk.length - 2]);
    const c = lead(ring, [before, { x: before.x - 0.9 * L, y: before.y - 0.4 * L }]);
    expect(closedRing(c)).toBe(6);
    expect(c.walk.slice(0, 7)).toEqual(ring.walk);
  });

  it("takes back a ring it has just closed when led straight back round the whole of it", () => {
    const centre = { x: 0, y: L };
    const ring = lead(startChain({ x: 0, y: 0 }, [], L), round(centre, L, -Math.PI / 2, 1.0, 60), 3);
    expect(closedRing(ring)).toBe(6);
    const back = lead(ring, round(centre, L, -Math.PI / 2, -1.0, 60), 3);
    expect(closedRing(back)).toBeNull();
    expect(back.walk.length).toBeLessThanOrEqual(2);
  });

  it("takes back a chain gone on from fused rings when led back along it, and keeps the rings", () => {
    const h = (Math.sqrt(3) / 2) * L;
    // round the hexagon above the start, then round the one to its right
    let c = lead(startChain({ x: 0, y: 0 }, [], L), round({ x: 0, y: L }, 0.85 * L, -Math.PI / 2, 1.0, 60), 3);
    c = lead(c, round({ x: 2 * h, y: L }, 0.85 * L, Math.PI, -1.0, 60), 3);
    const rings = c.walk.length;
    // on, out to the right and down, and back again
    const head = cellOf(c.honeycomb, c.walk[c.walk.length - 1]);
    const out = lead(c, [{ x: 4 * h, y: 0 }, { x: 6 * h, y: -0.2 * L }]);
    expect(out.walk.length).toBeGreaterThan(rings);
    const back = lead(out, [{ x: 4 * h, y: 0 }, { x: head.x, y: head.y }]);
    expect(back.walk.length).toBeLessThanOrEqual(rings);
    expect(new Set(back.walk).size).toBe(10);
  });
});

describe("a chain come round to a point it went through, to close a ring", () => {
  const h = (Math.sqrt(3) / 2) * L;
  /** The pointer led as `lead` leads it, and each time the walk got shorter. */
  function leadNoting(c: Chain, points: Pt[], steps: number, shorter: number[][]): Chain {
    let at = c.trail[c.trail.length - 1];
    for (const p of points)
      for (let i = 1; i <= steps; i++) {
        const next = followChain(c, { x: at.x + ((p.x - at.x) * i) / steps, y: at.y + ((p.y - at.y) * i) / steps });
        if (next.walk.length < c.walk.length) shorter.push([c.walk.length, next.walk.length]);
        c = next;
        if (i === steps) at = p;
      }
    return c;
  }
  /** The walk's atoms and bonds, each once. */
  const drawnOf = (c: Chain) => ({
    atoms: new Set(c.walk).size,
    bonds: new Set(c.walk.slice(1).map((k, i) => [k, c.walk[i]].sort().join(" "))).size,
  });
  /** Round a circle with a hand that trembles a little. */
  const shaky = (centre: Pt, r: number, from: number, turns: number) =>
    round(centre, r, from, turns, 48).map((p, i) => ({ x: p.x + 0.04 * L * Math.sin(7 * i), y: p.y + 0.04 * L * Math.cos(5 * i) }));

  it("closes the ring at the atom it started from, however wide the hand goes round and either way", () => {
    for (const r of [0.6, 0.85, 1.1])
      for (const way of [1, -1]) {
        const shorter: number[][] = [];
        const c = leadNoting(startChain({ x: 0, y: 0 }, [], L), shaky({ x: 0, y: L }, r * L, -Math.PI / 2, way * 1.02), 2, shorter);
        expect(closedRing(c)).toBe(6);
        expect(shorter).toEqual([]);
      }
  });

  it("closes the ring onto an atom some way back along the chain, after the hand went on past it and came back", () => {
    for (const past of [2, 3])
      for (const r of [0.7, 0.85, 1.0]) {
        // out along the zigzag, on past where the ring goes and back; then round the hexagon above
        let c = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 2 * h, y: 0 }]);
        c = lead(c, [{ x: (2 + past) * h, y: 0.25 * L }, { x: 2 * h, y: 0.1 * L }], 4);
        const chain = c.walk.slice();
        const shorter: number[][] = [];
        c = leadNoting(c, shaky({ x: 2 * h, y: L }, r * L, -Math.PI / 2, 1.0), 2, shorter);
        // (it went to the atom it closes onto: once, it was taken back there)
        expect(shorter).toEqual([]);
        expect(c.walk.slice(0, chain.length)).toEqual(chain);
        expect(drawnOf(c)).toEqual({ atoms: 7, bonds: 7 });
      }
  });

  it("closes the ring onto an atom of a ring drawn earlier in the stroke", () => {
    for (const r of [0.7, 0.85, 1.0])
      for (const way of [1, -1])
        for (const past of [1, 2]) {
          // round the hexagon above the start; on along its bond to the right, along the next ring's bottom and past it, back
          let c = lead(startChain({ x: 0, y: 0 }, [], L), shaky({ x: 0, y: L }, r * L, -Math.PI / 2, 1.0), 2);
          c = lead(c, [{ x: h, y: 0.5 * L }, { x: 2 * h, y: 0 }, { x: (2 + past) * h, y: 0.3 * L }, { x: 2 * h, y: 0.1 * L }], 4);
          // round the hexagon to the right, either way, to the first ring's atom
          const shorter: number[][] = [];
          c = leadNoting(c, shaky({ x: 2 * h, y: L }, r * L, -Math.PI / 2, way * 1.1), 2, shorter);
          // (going round to the left, it first goes back over the bond it last laid: that one, and no more)
          expect(shorter.every(([from, to]) => from - to === 1)).toBe(true);
          expect(drawnOf(c)).toEqual({ atoms: 10, bonds: 11 });
        }
  });
});

describe("the trail a chain leaves, as it is drawn", () => {
  const L = 1.8;
  const start = { x: 0, y: 0 };
  // (Quick Add's Chain icon, up and to the right of where the double-click was)
  const icon = { x: 1.4, y: 1.1 };
  const path = [{ x: 2.2, y: 1.0 }, { x: 3.0, y: 0.8 }, { x: 3.8, y: 0.9 }];

  it("does not join the chain's start to the icon the press was on, whether the pointer is heard there before the press or after", () => {
    // (the icon's point first - a move there - or none: the first point is then the first move on)
    for (const heard of [[icon, ...path], [...path]]) {
      let c = startChain(start, [], L);
      for (const p of heard) c = followChain(c, p);
      const shown = trailShown(c.trail);
      expect(shown.some((p) => p.x === start.x && p.y === start.y)).toBe(false);
      expect(shown[0]).toEqual(heard[0]);
    }
  });

  it("is none until the pointer has two points of its own", () => {
    const c = startChain(start, [], L);
    expect(trailShown(c.trail)).toEqual([]);
    expect(trailShown(followChain(c, icon).trail)).toEqual([]);
  });
});
