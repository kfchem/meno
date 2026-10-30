import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import {
  bondSide,
  exitDistance,
  markIndex,
  MARK_MIN_PX,
  marksReadAt,
  MARKS_LEAST_PX,
  MarkObstacles,
  marksOf,
  placeMark,
  segmentHitsRect,
  shownMarks,
  stereoAskedOf,
  type Rect,
  stereoTextEms,
  stereoWaysOut,
  type ChemMarks,
  valenceMessage,
  waysOut,
} from "./marks";

const atom = (id: number, x: number, y: number, el = "C") => ({
  id,
  x,
  y,
  r: 0.9,
  el,
});
const bond = (id: number, a: number, b: number, order: 1 | 2 | 3 = 1) => ({
  id,
  a,
  b,
  order,
});

// but-2-ene, drawn trans, with ids that are not positions
const butene: Model = {
  atoms: [atom(10, 0, 0), atom(11, 1.3, 0.75), atom(12, 2.6, 0), atom(13, 3.9, 0.75)],
  bonds: [bond(20, 10, 11), bond(21, 11, 12, 2), bond(22, 12, 13)],
};

describe("marksOf", () => {
  it("puts RDKit's answer on the atoms and bonds it is about, by id", () => {
    const marks = marksOf(butene, {
      atoms: [
        { index: 0, hydrogens: 3 },
        { index: 1, hydrogens: 1, cip: "R" },
        { index: 2, hydrogens: 0, valenceError: { valence: 5, most: 4 } },
        { index: 3, hydrogens: 3 },
      ],
      bonds: [{ index: 1, cip: "E" }],
    });
    expect([...marks.centres]).toEqual([[11, "R"]]);
    expect([...marks.valence]).toEqual([[12, { valence: 5, most: 4 }]]);
    expect([...marks.doubleBonds]).toEqual([[21, "E"]]);
  });

  it("leaves a halogen bridging metals unmarked - μ-Cl in [Pd(allyl)Cl]2 drawn with plain bonds - and marks a real overload", () => {
    // ([Pd(allyl)Cl]2: two Pd bridged by two Cl, each Pd with its allyl drawn by three plain bonds)
    const dimer: Model = {
      atoms: [atom(1, -1, 0, "Pd"), atom(2, 1, 0, "Pd"), atom(3, 0, 1, "Cl"), atom(4, 0, -1, "Cl"), atom(5, -2, 1), atom(6, -2.5, 0), atom(7, -2, -1), atom(8, 2, 1), atom(9, 2.5, 0), atom(10, 2, -1)],
      bonds: [
        bond(1, 1, 3), bond(2, 1, 4), bond(3, 2, 3), bond(4, 2, 4),
        bond(5, 5, 6, 2), bond(6, 6, 7), bond(7, 1, 5), bond(8, 1, 6), bond(9, 1, 7),
        bond(10, 8, 9, 2), bond(11, 9, 10), bond(12, 2, 8), bond(13, 2, 9), bond(14, 2, 10),
      ],
    };
    // (as the checks plugin answers: each Cl two bonds where it can have one)
    const said = marksOf(dimer, {
      atoms: [
        { index: 2, hydrogens: 0, valenceError: { valence: 2, most: 1 } },
        { index: 3, hydrogens: 0, valenceError: { valence: 2 } },
      ],
      bonds: [],
    });
    expect([...said.valence]).toEqual([]);
    // (a Cl on a metal and a carbon, as a halide bonded on as usual and to a metal: unmarked too)
    const onBoth: Model = { atoms: [atom(1, 0, 0, "Pd"), atom(2, 1, 0, "Cl"), atom(3, 2, 0)], bonds: [bond(1, 1, 2), bond(2, 2, 3)] };
    expect(marksOf(onBoth, { atoms: [{ index: 1, hydrogens: 0, valenceError: { valence: 2, most: 1 } }], bonds: [] }).valence.size).toBe(0);
    // (a Cl with two bonds to carbons - CH2Cl2 drawn wrong, Cl between two C - is marked; and one with two to carbons as well
    // as one to a metal)
    const overload: Model = { atoms: [atom(1, 0, 0), atom(2, 1, 0, "Cl"), atom(3, 2, 0)], bonds: [bond(1, 1, 2), bond(2, 2, 3)] };
    expect([...marksOf(overload, { atoms: [{ index: 1, hydrogens: 0, valenceError: { valence: 2, most: 1 } }], bonds: [] }).valence]).toEqual([[2, { valence: 2, most: 1 }]]);
    const both: Model = { atoms: [...overload.atoms, atom(4, 1, 1, "Pd")], bonds: [...overload.bonds, bond(3, 2, 4)] };
    expect(marksOf(both, { atoms: [{ index: 1, hydrogens: 0, valenceError: { valence: 3, most: 1 } }], bonds: [] }).valence.size).toBe(1);
    // (an atom of another element bridging metals is marked as the plugin says: the rule is the halogens')
    const carbon: Model = { atoms: [atom(1, 0, 0, "Pd"), atom(2, 1, 0, "C"), atom(3, 2, 0, "Pd")], bonds: [bond(1, 1, 2), bond(2, 2, 3)] };
    expect(marksOf(carbon, { atoms: [{ index: 1, hydrogens: 0, valenceError: { valence: 5, most: 4 } }], bonds: [] }).valence.size).toBe(1);
  });

  it("leaves an atom a dative bond is drawn into unmarked - BH3 in H3N→BH3 - and marks a real overload", () => {
    // (H3N→BH3 with its hydrogens written in the labels: the arrow from N to B, which the checks plugin counts on B)
    const adduct = (more: Model["bonds"] = []): Model => ({
      atoms: [atom(1, 0, 0, "N"), atom(2, 1.5, 0, "B"), atom(3, 3, 0)],
      bonds: [{ ...bond(1, 1, 2), dative: true }, ...more],
    });
    const at = (valence: number) => ({ atoms: [{ index: 1, hydrogens: 3, valenceError: { valence, most: 3 } }], bonds: [] });
    expect([...marksOf(adduct(), at(4)).valence]).toEqual([]);
    // (a coordination bond drawn as a plain line, from N to B as it was drawn: alike)
    const plain: Model = { ...adduct(), bonds: [{ ...bond(1, 1, 2), coordination: true }] };
    expect([...marksOf(plain, at(4)).valence]).toEqual([]);
    // (a B with four bonds besides the arrow - BH4 drawn with an arrow in - is marked; so is one the arrow leaves)
    expect([...marksOf(adduct([bond(2, 2, 3)]), at(5)).valence]).toEqual([[2, { valence: 5, most: 3 }]]);
    const outOf: Model = { ...adduct(), bonds: [{ ...bond(1, 2, 1), dative: true }] };
    expect([...marksOf(outOf, at(4)).valence]).toEqual([[2, { valence: 4, most: 3 }]]);
  });

  it("says an axis of chirality's M or P as Ra or Sa, as a label says (R)-BINAP", () => {
    const axis = (cip: "M" | "P") => marksOf(butene, { atoms: [], bonds: [{ index: 0, cip }] }).doubleBonds.get(20);
    expect(axis("M")).toBe("Ra");
    expect(axis("P")).toBe("Sa");
  });
});

describe("valenceMessage", () => {
  it("says what is wrong in words", () => {
    expect(valenceMessage("C", { valence: 5, most: 4 })).toBe(
      "Too many bonds: a valence of 5, where carbon takes at most 4.",
    );
    expect(valenceMessage("Fe", { valence: 9 })).toBe(
      "Too many bonds: a valence of 9 is more than iron takes.",
    );
  });
});

describe("where marks go", () => {
  it("leaves an atom by the widest gap between its bonds first", () => {
    // the middle of a zigzag: bonds down-left and down-right, so up
    const [up, down] = waysOut(butene, 11);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(1, 6);
    expect(down.y).toBeCloseTo(-1, 6);
    // the end of a chain: straight back from its one bond
    const [back] = waysOut(butene, 10);
    expect(back.x).toBeCloseTo(-Math.cos(Math.PI / 6), 2);
    // an atom on its own: below it, then round the compass
    const lone = waysOut({ atoms: [atom(1, 0, 0)], bonds: [] }, 1);
    expect(lone).toHaveLength(12);
    expect(lone[0].x).toBeCloseTo(0, 9);
    expect(lone[0].y).toBeCloseTo(-1, 9);
  });

  it("puts a mark where it covers no bond, label or other mark", () => {
    const from = { x: 0, y: 0 };
    const half = { x: 0.4, y: 0.2 };
    const common = { from, start: () => 0.1, half, step: 0.3 };
    // nothing in the way: the first way out, as close as it goes
    const up = placeMark({
      ...common,
      dirs: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
      obstacles: new MarkObstacles([], []),
    });
    expect(up.minY).toBeCloseTo(0.1, 9);
    // a bond across the way up: down instead
    const down = placeMark({
      ...common,
      dirs: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
      obstacles: new MarkObstacles([[{ x: -2, y: 0.4 }, { x: 2, y: 0.4 }]], [{ minX: -1, maxX: 1, minY: -1.5, maxY: -1.2 }]),
    });
    expect(down.maxY).toBeCloseTo(-0.1, 9);
  });

  it("counts what is in a mark's way as checking every bond, label and mark would", () => {
    // a page of bonds and boxes, some huge, some far out, some not numbers
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const pt = () => ({ x: rnd() * 40 - 20, y: rnd() * 40 - 20 });
    const box = (w = 2): Rect => {
      const c = pt();
      return { minX: c.x - rnd() * w, maxX: c.x + rnd() * w, minY: c.y - rnd() * w, maxY: c.y + rnd() * w };
    };
    const segments: [{ x: number; y: number }, { x: number; y: number }][] = [];
    for (let i = 0; i < 400; i++) {
      const p = pt();
      segments.push([p, { x: p.x + rnd() * 3 - 1.5, y: p.y + rnd() * 3 - 1.5 }]);
    }
    // (records drawn on top of one another: the same bonds again)
    for (let i = 0; i < 300; i++) segments.push(segments[i % 40]);
    segments.push([{ x: -500, y: -3 }, { x: 500, y: 4 }]); // across the page
    segments.push([{ x: NaN, y: 0 }, { x: 1, y: 1 }]);
    segments.push([{ x: 0, y: 0 }, { x: Infinity, y: 2 }]);
    const rects: Rect[] = Array.from({ length: 60 }, () => box());
    rects.push({ minX: -1e9, maxX: 1e9, minY: -1, maxY: 1 });
    const obstacles = new MarkObstacles(segments, rects, 1.5);
    const all = [...rects];
    for (let k = 0; k < 500; k++) {
      const r = k % 50 === 0 ? { minX: -Infinity, maxX: 0, minY: 0, maxY: 1 } : box(k % 7 === 0 ? 30 : 1.5);
      const expected =
        segments.filter((s) => segmentHitsRect(s, r)).length +
        all.filter((o) => r.minX < o.maxX && o.minX < r.maxX && r.minY < o.maxY && o.minY < r.maxY).length;
      expect(obstacles.count(r), `box ${k}`).toBe(expected);
      // (and the marks placed as they go, some in the same place again)
      if (k % 3 === 0) {
        obstacles.add(r);
        all.push(r);
      }
      if (k % 5 === 0) {
        const again = all[(k * 7) % all.length];
        obstacles.add({ ...again });
        all.push(again);
      }
    }
  });

  it("finds the same ways out with one index of the structure for every mark", () => {
    const index = markIndex(butene);
    for (const a of butene.atoms) {
      expect(waysOut(butene, a.id, index)).toEqual(waysOut(butene, a.id));
      expect(stereoWaysOut(butene, a.id, index)).toEqual(stereoWaysOut(butene, a.id));
    }
    for (const b of butene.bonds) expect(bondSide(butene, b.id, index)).toEqual(bondSide(butene, b.id));
  });

  it("knows when a line passes through a box", () => {
    const box = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    expect(segmentHitsRect([{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }], box)).toBe(true);
    expect(segmentHitsRect([{ x: 0.5, y: 0.5 }, { x: 5, y: 5 }], box)).toBe(true);
    expect(segmentHitsRect([{ x: -1, y: 2 }, { x: 2, y: 2 }], box)).toBe(false);
  });

  it("puts a double bond's mark on the side with fewer of its neighbours", () => {
    // trans: one neighbour either side - above, then
    const s = bondSide(butene, 21)!;
    expect(s.at.x).toBeCloseTo(1.95, 9);
    expect(s.at.y).toBeCloseTo(0.375, 9);
    expect(s.out.y).toBeGreaterThan(0);
    // cis, both neighbours below: above
    const cis: Model = {
      atoms: [atom(1, -0.75, -1.3), atom(2, 0, 0), atom(3, 1.5, 0), atom(4, 2.25, -1.3)],
      bonds: [bond(5, 1, 2), bond(6, 2, 3, 2), bond(7, 3, 4)],
    };
    expect(bondSide(cis, 6)!.out.y).toBe(1);
    // both above: below
    const flipped: Model = {
      ...cis,
      atoms: cis.atoms.map((a) => ({ ...a, y: -a.y })),
    };
    expect(bondSide(flipped, 6)!.out.y).toBe(-1);
  });

  it("finds where a line from an atom leaves its label", () => {
    const box = { left: 0.2, right: 1, top: 0.5, bottom: 0.5 };
    expect(exitDistance(box, { x: 1, y: 0 })).toBe(1);
    expect(exitDistance(box, { x: -1, y: 0 })).toBe(0.2);
    expect(exitDistance(box, { x: 0, y: -1 })).toBe(0.5);
  });
});

describe("R and S as the canvas writes them", () => {
  // butan-2-ol: its stereocentre, two chain bonds below it and the OH wedged up
  const butanol: Model = {
    atoms: [atom(1, 0, 0), atom(2, -1.3, -0.75), atom(3, 1.3, -0.75), atom(4, 0, 1.5, "O")],
    bonds: [bond(10, 1, 2), bond(11, 1, 3), { ...bond(12, 1, 4), stereo: "up" as const }],
  };

  it("stands opposite a wedge first, as IUPAC's recommendations for diagrams put it", () => {
    const [first] = stereoWaysOut(butanol, 1);
    expect(first.x).toBeCloseTo(0, 9);
    expect(first.y).toBeCloseTo(-1, 9);
    // then the ways out between its bonds, as any mark's
    expect(stereoWaysOut(butanol, 1).slice(1)).toEqual(waysOut(butanol, 1));
  });

  it("goes the ways out between its bonds when it has no wedge", () => {
    expect(stereoWaysOut(butene, 11)).toEqual(waysOut(butene, 11));
  });

  it("is as wide as its letters and its parentheses", () => {
    expect(stereoTextEms("R", true)).toBeGreaterThan(stereoTextEms("R", false));
    expect(stereoTextEms("r", false)).toBeLessThan(stereoTextEms("R", false));
    expect(stereoTextEms("Ra", false)).toBeGreaterThan(stereoTextEms("R", false));
  });
});

describe("R and S, E and Z shown", () => {
  // (three centres and a double bond, all worked out; centres 1 and 2 and the bond asked for when they were)
  const marks: ChemMarks = {
    valence: new Map(),
    centres: new Map([[1, "R"], [2, "S"], [3, "R"]]),
    doubleBonds: new Map([[10, "E"]]),
  };
  const model = (shown: number[], bondShown: boolean): Model => ({
    atoms: [1, 2, 3, 4].map((id) => ({ ...atom(id, id, 0), ...(shown.includes(id) ? { stereoShown: true as const } : {}) })),
    bonds: [{ ...bond(10, 3, 4, 2), ...(bondShown ? { stereoShown: true as const } : {}) }],
  });
  const then = stereoAskedOf(model([1, 2], true));

  it("shows those asked for now that were asked for as the marks were worked out", () => {
    const s = shownMarks(marks, model([1, 2], true), then, () => false);
    expect([...s.centres.keys()]).toEqual([1, 2]);
    expect([...s.doubleBonds.keys()]).toEqual([10]);
  });

  it("keeps one asked for since a change to the structure back until marks worked out after it come", () => {
    const s = shownMarks(marks, model([1, 2, 3], true), then, () => false);
    expect([...s.centres.keys()]).toEqual([1, 2]);
    // (worked out again, with 3 asked for: all three)
    const again = shownMarks(marks, model([1, 2, 3], true), stereoAskedOf(model([1, 2, 3], true)), () => false);
    expect([...again.centres.keys()]).toEqual([1, 2, 3]);
  });

  it("shows those asked for since at once, all together, where the marks are for the structure as it is", () => {
    const s = shownMarks(marks, model([1, 2, 3], true), stereoAskedOf(model([], false)), () => true);
    expect([...s.centres.keys()]).toEqual([1, 2, 3]);
    expect([...s.doubleBonds.keys()]).toEqual([10]);
  });

  it("shows nothing from marks worked out for another structure before any was asked for", () => {
    const s = shownMarks(marks, model([1, 2, 3], true), stereoAskedOf(model([], false)), () => false);
    expect(s.centres.size).toBe(0);
    expect(s.doubleBonds.size).toBe(0);
  });

  it("asks whether the marks are for the structure as it is only where something has been asked for since", () => {
    let asked = 0;
    shownMarks(marks, model([1, 2], true), then, () => (asked++, true));
    expect(asked).toBe(0);
  });

  it("takes away at once those no longer asked for, all of them together", () => {
    const s = shownMarks(marks, model([], false), then, () => false);
    expect(s.centres.size).toBe(0);
    expect(s.doubleBonds.size).toBe(0);
  });
});

describe("R and S, E and Z at a far zoom", () => {
  it("are seen while their letters would be three quarters of the least size, switched past it a little either way, never half there at a zoom", () => {
    expect(MARKS_LEAST_PX).toBe(0.75 * MARK_MIN_PX);
    expect(marksReadAt(false, 40)).toBe(true);
    expect(marksReadAt(true, 1)).toBe(false);
    // (between the two edges of the switch: as they were)
    expect(marksReadAt(true, MARKS_LEAST_PX)).toBe(true);
    expect(marksReadAt(false, MARKS_LEAST_PX)).toBe(false);
    expect(marksReadAt(true, MARKS_LEAST_PX / 1.06)).toBe(false);
    expect(marksReadAt(false, MARKS_LEAST_PX * 1.06)).toBe(true);
  });
});
