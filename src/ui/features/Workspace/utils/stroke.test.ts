import { describe, expect, it } from "vitest";
import {
  advanceStroke,
  finishStroke,
  holdStroke,
  NEW_ATOM,
  startStroke,
  strokeTarget,
  type StrokeNode,
} from "./stroke";
import type { Pt } from "./extendSnap";
import { chairDrawing, seenPlaces } from "../projections/chair";
import { measured } from "../../../../testing/timeouts";

const L = 1;
// one carbon, and a second to the left of it
const methyl = {
  atoms: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: -1, y: 0 },
  ],
  bonds: [{ a: 1, b: 2 }],
};

describe("a bond stroke", () => {
  it("points 120 degrees from the bond already there", () => {
    const s = startStroke("bond", 1);
    const t = strokeTarget(methyl, s, { x: 0.4, y: 0.9 }, L)!;
    expect(t.end.x).toBeCloseTo(0.5, 6);
    expect(t.end.y).toBeCloseTo(Math.sqrt(3) / 2, 6);
    expect(t.trigonalTo).toBeDefined();
    // released: one bond, to a new atom there
    expect(finishStroke(methyl, s, { x: 0.4, y: 0.9 }, L)).toHaveLength(1);
  });

  it("goes exactly where the pointer is after a pause", () => {
    const s = holdStroke(methyl, startStroke("bond", 1), { x: 0.3, y: 0.3 }, L);
    expect(strokeTarget(methyl, s, { x: 0.7, y: 0.2 }, L)!.end).toEqual({
      x: 0.7,
      y: 0.2,
    });
  });

  it("closes onto the atom the pointer is on, however far away", () => {
    // an atom two bonds off, the pointer on it: a long bond closes the ring
    const far = {
      atoms: [...methyl.atoms, { id: 3, x: 1.2, y: 1.5 }],
      bonds: methyl.bonds,
    };
    const t = strokeTarget(far, startStroke("bond", 1), { x: 1.25, y: 1.45 }, L)!;
    expect(t.atomId).toBe(3);
    expect(t.end).toEqual({ x: 1.2, y: 1.5 });
  });

  it("closes onto an atom within reach", () => {
    const three = {
      atoms: [...methyl.atoms, { id: 3, x: 0.5, y: 0.9 }],
      bonds: methyl.bonds,
    };
    const t = strokeTarget(three, startStroke("bond", 1), { x: 0.4, y: 0.9 }, L)!;
    expect(t.atomId).toBe(3);
    expect(t.end).toEqual({ x: 0.5, y: 0.9 });
  });
});

describe("a chain stroke", () => {
  it("runs on a honeycomb turned to the bond its atom has, and takes back what it is led back over", () => {
    let s = startStroke("chain", 1, methyl, undefined, L);
    // off to the right, four bond lengths, a little at a time
    for (let x = 0.1; x <= 4; x += 0.05) s = advanceStroke(methyl, s, { x, y: 0.1 }, L);
    expect(s.nodes.length).toBeGreaterThanOrEqual(3);
    let prev = { x: 0, y: 0 };
    for (const n of s.nodes) {
      expect(Math.hypot(n.x - prev.x, n.y - prev.y)).toBeCloseTo(1, 6);
      prev = n;
    }
    // every bond 120 degrees from the methyl's
    const first = s.nodes[0];
    const methylWay = Math.atan2(methyl.atoms[1].y, methyl.atoms[1].x);
    const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(first.y, first.x) - methylWay), Math.cos(Math.atan2(first.y, first.x) - methylWay)));
    expect(angle).toBeCloseTo((2 * Math.PI) / 3, 6);
    // led back to its start: nothing
    for (let x = 4; x >= 0.05; x -= 0.05) s = advanceStroke(methyl, s, { x, y: 0.1 }, L);
    expect(finishStroke(methyl, s, { x: 0.05, y: 0.1 }, L)).toEqual([]);
  });

  it("starts on empty space from a new atom, across at 30 degrees", () => {
    let s = startStroke("chain", NEW_ATOM, methyl, { x: 10, y: 10 }, L);
    for (let x = 10.05; x <= 12.2; x += 0.05) s = advanceStroke(methyl, s, { x, y: 10.2 }, L);
    expect(s.nodes.length).toBeGreaterThanOrEqual(2);
    expect(Math.atan2(s.nodes[0].y - 10, s.nodes[0].x - 10)).toBeCloseTo(Math.PI / 6, 6);
  });

  it("goes onto an atom already there where the honeycomb meets it", () => {
    // the methyl's carbon is a point of the honeycomb: led to it, the walk takes that atom
    let s = startStroke("chain", 1, methyl, undefined, L);
    for (let t = 0.05; t <= 1; t += 0.05) s = advanceStroke(methyl, s, { x: -t, y: 0.02 }, L);
    expect(s.nodes.some((n) => n.atomId === 2)).toBe(true);
  });

  it("goes onto an atom already there only where the ring that closes lies along the honeycomb, or where it closes none", () => {
    // the hexagon round the methyl's bond: from its carbon up and round
    const h = Math.sqrt(3) / 2;
    const way = [
      { x: 0.5, y: h },
      { x: 0, y: 2 * h },
      { x: -1, y: 2 * h },
      { x: -1.5, y: h },
    ];
    const lead = (model: typeof methyl, to: number) => {
      let s = startStroke("chain", 1, model, undefined, L);
      let at = { x: 0, y: 0 };
      for (const p of way.slice(0, to)) {
        for (let t = 0.05; t <= 1.001; t += 0.05) s = advanceStroke(model, s, { x: at.x + (p.x - at.x) * t, y: at.y + (p.y - at.y) * t }, L);
        at = p;
      }
      return s;
    };
    // an atom bonded to the methyl's other carbon along the honeycomb, where
    // the chain's fourth point falls: taken, closing its hexagon
    const six = { atoms: [...methyl.atoms, { id: 3, x: -1.5, y: h }], bonds: [...methyl.bonds, { a: 2, b: 3 }] };
    expect(lead(six, 4).nodes.some((n) => n.atomId === 3)).toBe(true);
    // one where its third falls, bonded off the honeycomb: it would close a
    // ring of five - not taken, an atom of the chain's own
    const five = { atoms: [...methyl.atoms, { id: 3, x: -1, y: 2 * h }], bonds: [...methyl.bonds, { a: 2, b: 3 }] };
    const s = lead(five, 3);
    expect(s.nodes.length).toBe(3);
    expect(s.nodes.some((n) => n.atomId === 3)).toBe(false);
    // and one bonded to nothing of the chain's: taken, closing no ring
    const apart = { atoms: [...methyl.atoms, { id: 3, x: -1, y: 2 * h }], bonds: methyl.bonds };
    expect(lead(apart, 3).nodes.some((n) => n.atomId === 3)).toBe(true);
  });
});

describe("a chain stroke traced round fused rings", () => {
  // (a drawing's bond length: the honeycomb's hexagons, their centres one bond above the start and on from there)
  const B = 1.8;
  const empty = { atoms: [], bonds: [] };
  const r3 = Math.sqrt(3);
  const a = { x: 0, y: B };
  const b = { x: r3 * B, y: B };
  // (phenanthrene's third ring, up and to the right of the second; anthracene's, straight on)
  const angular = { x: 1.5 * r3 * B, y: 2.5 * B };
  const linear = { x: 2 * r3 * B, y: B };

  /** The atoms and bonds a stroke adds, the start among them. */
  function drawn(nodes: StrokeNode[]) {
    const bonds = new Set<string>();
    let prev = -1;
    nodes.forEach((n, i) => {
      const from = n.from ?? prev;
      const to = n.pathIndex ?? i;
      bonds.add(`${Math.min(from, to)}:${Math.max(from, to)}`);
      prev = to;
    });
    return { atoms: 1 + nodes.filter((n) => n.pathIndex == null && n.atomId == null).length, bonds: bonds.size };
  }

  /** The pointer led through points, a few moves between each. */
  function trace(way: Pt[], start: Pt = { x: 0, y: 0 }) {
    let s = startStroke("chain", NEW_ATOM, empty, start, B);
    let at = start;
    for (const p of way) {
      for (let i = 1; i <= 3; i++) s = advanceStroke(empty, s, { x: at.x + ((p.x - at.x) * i) / 3, y: at.y + ((p.y - at.y) * i) / 3 }, B);
      at = p;
    }
    return { s, end: at };
  }

  /** Once round a ring about `centre`, from the side toward `from`, with a hand that trembles a little. */
  function roundRing(centre: Pt, from: Pt, way: 1 | -1, r = 0.85 * B): Pt[] {
    const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
    return Array.from({ length: 49 }, (_, i) => {
      const t = a0 + (way * 2 * Math.PI * i) / 48;
      const shake = 0.04 * B * Math.sin(7 * i);
      return { x: centre.x + (r + shake) * Math.cos(t), y: centre.y + (r + shake) * Math.sin(t) };
    });
  }

  /** Rings traced one after another, each from the side of the one before. */
  function ringsTraced(centres: Pt[], ways: (1 | -1)[]) {
    const way: Pt[] = [];
    centres.forEach((c, i) => way.push(...roundRing(c, i ? centres[i - 1] : { x: 0, y: 0 }, ways[i])));
    const { s, end } = trace(way);
    return drawn(finishStroke(empty, s, end, B));
  }

  it("draws naphthalene round one ring and on round the next, either way round each", () => {
    for (const first of [1, -1] as const)
      for (const second of [1, -1] as const) expect(ringsTraced([a, b], [first, second])).toEqual({ atoms: 10, bonds: 11 });
  });

  it("draws phenanthrene and anthracene ring after ring, however each is gone round", () => {
    for (const third of [angular, linear])
      for (const ways of [
        [1, 1, 1],
        [-1, -1, -1],
        [1, -1, 1],
        [-1, 1, -1],
      ] as (1 | -1)[][])
        expect(ringsTraced([a, b, third], ways)).toEqual({ atoms: 14, bonds: 16 });
  }, measured(700));

  it("draws phenanthrene traced along its bonds, over the bonds the rings share", () => {
    const at = (c: Pt, k: number): Pt => ({ x: c.x + B * Math.cos(((60 * k - 90) * Math.PI) / 180), y: c.y + B * Math.sin(((60 * k - 90) * Math.PI) / 180) });
    const first = [1, 2, 3, 4, 5, 0, 1, 2].map((k) => at(a, k));
    for (const way of [
      // round the first ring and on over the bond it shares with the second;
      // round the second; back over two of its bonds, and round the third
      [...first, ...[3, 2, 1, 0, 5, 4, 3].map((k) => at(b, k)), ...[4, 3, 2, 1, 0].map((k) => at(angular, k))],
      // round the second the same way; back over the bond that closed it and on to the third, and round that
      [...first, ...[3, 2, 1, 0, 5, 0, 1, 2].map((k) => at(b, k)), ...[1, 2, 3, 4, 5].map((k) => at(angular, k))],
    ]) {
      const { s, end } = trace(way);
      expect(drawn(finishStroke(empty, s, end, B))).toEqual({ atoms: 14, bonds: 16 });
    }
  });
});

describe("a chain stroke beside a large drawing", () => {
  it("takes no longer a step for the drawing's 28 000 atoms: it is gone over once, not at every step", () => {
    // (a thousand chains of 28 atoms, well away from where the stroke is drawn)
    const atoms: { id: number; x: number; y: number }[] = [];
    const bonds: { a: number; b: number }[] = [];
    for (let m = 0; m < 1000; m++)
      for (let k = 0; k < 28; k++) {
        const id = m * 28 + k + 1;
        atoms.push({ id, x: 100 + (m % 40) * 30 + k * 0.87, y: 100 + Math.floor(m / 40) * 3 + (k % 2) * 0.5 });
        if (k) bonds.push({ a: id - 1, b: id });
      }
    const drawing = { atoms, bonds };
    const cpu = () => process.cpuUsage().user / 1000;
    const t0 = cpu();
    let s = startStroke("chain", NEW_ATOM, drawing, { x: 0, y: 0 }, L);
    for (let x = 0.05; x <= 2.5; x += 0.05) s = advanceStroke(drawing, s, { x, y: 0.2 }, L);
    const spent = cpu() - t0;
    expect(s.nodes.length).toBeGreaterThanOrEqual(2);
    // (gone over once: about 70 ms of CPU; gone over at every step, about 950)
    expect(spent).toBeLessThan(350);
  });
});

describe("a bond stroke out of an atom of a chair", () => {
  const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const model = { atoms: d.atoms, bonds: d.bonds };
  const [axial, equatorial] = [seenPlaces(d, 3).find((p) => p.free.kind === "axial")!, seenPlaces(d, 3).find((p) => p.free.kind === "equatorial")!];
  const at = d.atoms[3];
  const toward = (p: { place: { x: number; y: number } }, turn = 0) => {
    const dx = p.place.x - at.x;
    const dy = p.place.y - at.y;
    return { x: at.x + 4 * (dx * Math.cos(turn) - dy * Math.sin(turn)), y: at.y + 4 * (dx * Math.sin(turn) + dy * Math.cos(turn)) };
  };

  it("ends at the free position nearest the pointer, named, and never between two", () => {
    const s = startStroke("bond", d.ring[3]);
    for (const turn of [-0.2, 0, 0.2]) {
      const t = strokeTarget(model, s, toward(axial, turn), L)!;
      expect(t.position).toBe("axial");
      expect(t.end.x).toBeCloseTo(axial.place.x, 9);
      expect(t.end.y).toBeCloseTo(axial.place.y, 9);
    }
    expect(strokeTarget(model, s, toward(equatorial), L)!.position).toBe("equatorial");
    // (a pause does not let it go: held, it is still at a free position)
    const held = holdStroke(model, s, toward(equatorial), L);
    expect(strokeTarget(model, held, { x: at.x + 0.3, y: at.y + 0.1 }, L)!.position).toBeDefined();
  });

  it("is laid down there: one bond, its new atom at the place", () => {
    const [node] = finishStroke(model, startStroke("bond", d.ring[3]), toward(axial), L);
    expect(node.x).toBeCloseTo(axial.place.x, 9);
    expect(node.y).toBeCloseTo(axial.place.y, 9);
  });
});

describe("a bond stroke out of an atom of a Haworth ring", () => {
  it("joins another atom only where the pointer is let go ON it, never by the join's reach: up from C-3 and from C-2 along the vertical, a group until the pointer is on the atom above (at the ring's scale and at 1.25)", async () => {
    const { haworthDrawing, HAWORTH_SCALE } = await import("../projections/haworth");
    expect(HAWORTH_SCALE).toBeGreaterThanOrEqual(1.25);
    for (const scale of [HAWORTH_SCALE, 1.25]) {
      const d = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1, length: scale * L });
      const model = { atoms: d.atoms, bonds: d.bonds };
      // (C-3 up: the vertical through C-5 above it; C-2 up: through the ring O - atoms 3 and 5, 2 and 0)
      for (const [k, above] of [[3, 5], [2, 0]]) {
        const at = d.atoms[k];
        const top = d.atoms[above];
        // (and just short of the atom above and just past it, within the join's reach of it but not on it: 0.35 of a bond either side)
        for (const y of [...[0.3, 0.6, 1, 1.33, 1.6].map((f) => at.y + f * L), top.y - 0.35 * L, top.y + 0.35 * L]) {
          // (a point that is ON the atom above - within its pick radius - is let go on it: that one joins, rightly)
          if (Math.abs(y - top.y) < 0.3 * L) continue;
          const t = strokeTarget(model, startStroke("bond", d.ring[k]), { x: at.x, y }, L)!;
          expect(t.atomId, `${scale} from ${k} at ${y.toFixed(2)}`).toBeUndefined();
          expect(t.position).toBe("up");
        }
        // (let go on the atom above: a bond to it)
        expect(strokeTarget(model, startStroke("bond", d.ring[k]), { x: top.x, y: top.y }, L)!.atomId).toBe(top.id);
      }
    }
  }, measured(400));

  it("goes, from every atom of the ring of six and of five, to each of its two places - a new atom there, never joined onto another ring atom - however far the pointer is led", async () => {
    const { haworthDrawing } = await import("../projections/haworth");
    for (const size of [6, 5] as const) {
      const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
      const model = { atoms: d.atoms, bonds: d.bonds };
      for (let k = 0; k < size; k++) {
        const at = d.atoms[k];
        for (const p of seenPlaces(d, k)) {
          // (the pointer led a little, to the place, and on past it - up to three style bonds, past the ring atom above an inside place)
          const reach = Math.hypot(p.place.x - at.x, p.place.y - at.y);
          for (const share of [0.5, 1, 1.5, (2 * L) / reach, (3 * L) / reach]) {
            const t = strokeTarget(model, startStroke("bond", d.ring[k]), { x: at.x + (p.place.x - at.x) * share, y: at.y + (p.place.y - at.y) * share }, L)!;
            expect(t.atomId, `${size}: atom ${k} ${p.free.kind} at ${share}`).toBeUndefined();
            expect(t.position, `${size}: atom ${k} ${p.free.kind}`).toBe(p.free.kind);
            expect(t.end.x).toBeCloseTo(p.place.x, 9);
            expect(t.end.y).toBeCloseTo(p.place.y, 9);
          }
        }
      }
    }
  }, measured(400));
});

describe("a bond stroke out of a projection's group", () => {
  /** A projection with one group - its first atom, id 900 - at atom k's `kind` place. */
  async function withGroup(kind: "up" | "down" | "axial" | "equatorial", k: number, size: 5 | 6 = 6) {
    const { haworthDrawing } = await import("../projections/haworth");
    const d = kind === "up" || kind === "down" ? haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 }) : chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
    const p = seenPlaces(d, k).find((f) => f.free.kind === kind)!;
    const atoms = [...d.atoms, { ...d.atoms[k], id: 900, el: "C", x: p.place.x, y: p.place.y }];
    const plain = d.bonds.find((b) => !b.display && b.stereo == null) ?? d.bonds[0];
    const bonds = [...d.bonds, { ...plain, id: 900, a: d.ring[k], b: 900, display: undefined, narrow: undefined, stereo: undefined }];
    return { model: { atoms, bonds }, at: atoms[atoms.length - 1], root: d.atoms[k] };
  }
  const angleAt = (at: Pt, a: Pt, b: Pt) => {
    const u = Math.atan2(a.y - at.y, a.x - at.x);
    const v = Math.atan2(b.y - at.y, b.x - at.x);
    return Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v)));
  };

  it("bends 120 degrees from the group's bond wherever the pointer is - straight on, held still or not - never on along its line, a style bond long, to the pointer's side", async () => {
    // (C-5's CH2OH up and the L-sugar's down, inside; a furanose's C-4 up; a chair's axial and equatorial)
    const cases = [await withGroup("up", 5), await withGroup("down", 5), await withGroup("up", 4, 5), await withGroup("axial", 3), await withGroup("equatorial", 3)];
    for (const { model, at, root } of cases) {
      const line = { x: at.x + 3 * (at.x - root.x), y: at.y + 3 * (at.y - root.y) };
      const across = { x: -(at.y - root.y), y: at.x - root.x };
      for (const side of [-0.3, -0.01, 0, 0.01, 0.3]) {
        const pointer = { x: line.x + side * across.x * 3, y: line.y + side * across.y * 3 };
        for (const s of [startStroke("bond", 900), holdStroke(model, startStroke("bond", 900), pointer, L)]) {
          const t = strokeTarget(model, s, pointer, L)!;
          expect(t.atomId).toBeUndefined();
          expect(angleAt(at, root, t.end)).toBeCloseTo((2 * Math.PI) / 3, 9);
          expect(Math.hypot(t.end.x - at.x, t.end.y - at.y)).toBeCloseTo(L, 9);
          expect(t.trigonalTo).toBeDefined();
          // (to the pointer's side of the group's line, where it is off it)
          const sideOf = (q: Pt) => Math.sign((at.x - root.x) * (q.y - at.y) - (at.y - root.y) * (q.x - at.x));
          if (Math.abs(side) > 0.005) expect(sideOf(t.end)).toBe(sideOf(pointer));
        }
      }
      // (laid down there too)
      const [node] = finishStroke(model, startStroke("bond", 900), line, L);
      expect(angleAt(at, root, node)).toBeCloseTo((2 * Math.PI) / 3, 9);
    }
  });

  it("goes as any bond from an atom that is not a group at a free place: one moved off it, or one with two bonds", async () => {
    const { model, at, root } = await withGroup("up", 5);
    const moved = { ...model, atoms: model.atoms.map((a) => (a.id === 900 ? { ...a, x: a.x + 0.4 } : a)) };
    const off = moved.atoms.find((a) => a.id === 900)!;
    const t = strokeTarget(moved, startStroke("bond", 900), { x: off.x + 3 * (off.x - root.x), y: off.y + 3 * (off.y - root.y) }, L)!;
    expect(t.trigonalTo).toBeUndefined();
    const more = { atoms: [...model.atoms, { ...at, id: 901, x: at.x + 0.87, y: at.y + 0.5 }], bonds: [...model.bonds, { ...model.bonds[model.bonds.length - 1], id: 901, a: 900, b: 901 }] };
    const u = strokeTarget(more, startStroke("bond", 900), { x: at.x + 3 * (at.x - root.x), y: at.y + 3 * (at.y - root.y) }, L)!;
    expect(angleAt(at, root, u.end)).not.toBeCloseTo((2 * Math.PI) / 3, 3);
  });

  it("and a chain out of the group zigzags from it: its first bond 120 degrees from the group's", async () => {
    const { model, at, root } = await withGroup("up", 5);
    let s = startStroke("chain", 900, model, undefined, L);
    for (let f = 0.1; f <= 2.5; f += 0.1) s = advanceStroke(model, s, { x: at.x + f * (at.x - root.x), y: at.y + f * (at.y - root.y) * 2 }, L);
    expect(s.nodes.length).toBeGreaterThanOrEqual(1);
    expect(angleAt(at, root, s.nodes[0])).toBeCloseTo((2 * Math.PI) / 3, 6);
  });
});
