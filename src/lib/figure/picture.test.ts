import { describe, expect, it } from "vitest";
import type { PictureFitted } from "./inkFit";
import { pictureFigure, scaledFigure, UNCLEAR } from "./picture";
import { structureOf, type LabelReader } from "./structure";

/** Labels read as the tests have them: elements, and one group. */
const reads: LabelReader = (label) => (/^(C|N|O|H)$/.test(label) ? { el: label } : label === "OTBS" ? { el: label } : null);

// Menthol's ring carbon C1 (where its isopropyl is) and the isopropyl's CH,
// 30 pixels a bond, y down: the ring's three other carbons round C1, the two
// methyls round the CH.
const atoms: PictureFitted["atoms"] = [
  { x: 100, y: 100, el: "C" }, // 0: C1, in the ring
  { x: 130, y: 100, el: "C" }, // 1: the isopropyl's CH
  { x: 85, y: 74, el: "C" }, // 2
  { x: 85, y: 126, el: "C" }, // 3
  { x: 145, y: 74, el: "C" }, // 4: a methyl
  { x: 145, y: 126, el: "C" }, // 5: a methyl
];
const round = [
  { a: 0, b: 2, order: 1 as const },
  { a: 0, b: 3, order: 1 as const },
  { a: 1, b: 4, order: 1 as const },
  { a: 1, b: 5, order: 1 as const },
];

describe("a picture read by a plugin", () => {
  it("is a figure read: atoms where the picture has them, an element as it is or a label to be read, bonds as long as most are drawn", () => {
    const r = pictureFigure({
      atoms: [
        { x: 0, y: 0, el: "C" },
        { x: 30, y: 0, el: "N", charge: 1 },
        { x: 45, y: 26, label: "OTBS" },
        { x: 60, y: 0, el: "Xx" },
      ],
      bonds: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 1 },
        { a: 1, b: 3, order: 1 },
      ],
    })!;
    expect(r.atoms).toEqual([
      { x: 0, y: 0, el: "C" },
      { x: 30, y: 0, el: "N", charge: 1 },
      { x: 45, y: 26, label: "OTBS" },
      // (no element by that name, and no label: a carbon, its symbol not taken)
      { x: 60, y: 0 },
    ]);
    expect(r.bond).toBe(30);
    expect(r.bonds.map((b) => [b.a, b.b, b.order])).toEqual([
      [0, 1, 2],
      [1, 2, 1],
      [1, 3, 1],
    ]);
  });

  it("takes what the plugin said as data: what is not as the contract says is left out", () => {
    const r = pictureFigure({
      atoms: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 30, y: 0 }, null as never],
      bonds: [
        { a: 0, b: 1, order: 1 }, // (to an atom left out)
        { a: 0, b: 2, order: 4 as never },
        { a: 0, b: 0, order: 1 },
        { a: 0, b: 2, order: 1 },
        { a: 2, b: 0, order: 2 }, // (the same bond again)
        { a: 0, b: 9, order: 1 },
      ],
    })!;
    expect(r.atoms.map((a) => a.x)).toEqual([0, 30]);
    expect(r.bonds).toEqual([{ a: 0, b: 1, order: 1 }]);
    expect(pictureFigure({ atoms: [{ x: 0, y: 0 }], bonds: [] })).toBeNull();
    expect(pictureFigure({} as PictureFitted)).toBeNull();
  });

  it("says what the plugin was unsure of in words, never as a number", () => {
    const r = pictureFigure({
      atoms: [
        { x: 0, y: 0, el: "C", unsure: true },
        { x: 30, y: 0, el: "Si" },
      ],
      bonds: [{ a: 0, b: 1, order: 1, unsure: true }],
    })!;
    expect(r.atoms[0].unsure).toEqual([UNCLEAR]);
    expect(r.atoms[1].unsure).toBeUndefined();
    expect(r.bonds[0].unsure).toEqual([UNCLEAR]);
    expect(UNCLEAR).not.toMatch(/\d/);
  });

  it("draws a wedge narrow where the picture does, nearer and farther as the plugin read them", () => {
    // (narrow at b: seen from b, a lies farther - a hash narrow at b)
    const r = pictureFigure({ atoms, bonds: [...round, { a: 1, b: 0, order: 1, stereo: "up", narrow: "b" }] })!;
    expect(r.bonds[4]).toEqual({ a: 0, b: 1, order: 1, stereo: "down" });
    expect(structureOf(r, reads).bonds[4]).toMatchObject({ a: 0, b: 1, stereo: "down" });
    // (narrow at a: as given)
    const kept = pictureFigure({ atoms, bonds: [...round, { a: 0, b: 1, order: 1, stereo: "up", narrow: "a" }] })!;
    expect(kept.bonds[4]).toEqual({ a: 0, b: 1, order: 1, stereo: "up" });
  });

  it("never draws a wedge narrow at an end with no other bond, however the picture seems to draw it", () => {
    // (C1 with its ring and the CH, and a methyl on C1 by a wedge seen narrow at the methyl - a label or the wide end's
    // short run misleading what is measured: a methyl is never a stereocentre)
    const wedged = [...round, { a: 0, b: 1, order: 1 as const }, { a: 0, b: 5, order: 1 as const, stereo: "up" as const, narrow: "b" as const }];
    const r = pictureFigure({ atoms: atoms.map((a, i) => (i === 5 ? { ...a, x: 100, y: 70 } : a)), bonds: wedged.filter((b) => !(b.a === 1 && b.b === 5)) })!;
    const wedge = r.bonds.find((b) => b.stereo)!;
    // (taken as a wedge whose narrow end is not seen: the plugin's nearer and farther kept, from C1)
    expect(wedge).toMatchObject({ a: 0, b: 5, stereo: "up", facing: true });
    expect(structureOf(r, reads).bonds.find((b) => b.stereo)).toMatchObject({ a: 0, b: 5, stereo: "up" });
    // (two ends with other bonds: as the picture draws it)
    const between = pictureFigure({ atoms, bonds: [...round, { a: 0, b: 1, order: 1, stereo: "up", narrow: "b" }] })!;
    expect(between.bonds[4]).toEqual({ a: 1, b: 0, order: 1, stereo: "down" });
  });

  it("where the picture does not say which end is narrow, draws it narrow at the end that can be a stereocentre", () => {
    // (C1 has three bonds and a hydrogen: a stereocentre; a methyl cannot be one)
    const methyl = [...round.slice(0, 2), { a: 1, b: 4, order: 1 as const }];
    const r = pictureFigure({ atoms, bonds: [...methyl, { a: 1, b: 0, order: 1, stereo: "down" }] })!;
    expect(r.bonds[3]).toMatchObject({ a: 1, b: 0, stereo: "down", facing: true });
    // (b = C1 the stereocentre, a = the CH with two bonds: turned - C1 nearer than the CH, so the CH farther from C1)
    expect(structureOf(r, reads).bonds[3]).toMatchObject({ a: 0, b: 1, stereo: "up" });
    // (both ends can be one: as given)
    const both = pictureFigure({ atoms, bonds: [...round, { a: 1, b: 0, order: 1, stereo: "down" }] })!;
    expect(structureOf(both, reads).bonds[4]).toMatchObject({ a: 1, b: 0, stereo: "down" });
  });

  it("takes an element as given: its hydrogens not looked for in a label, as a figure's drawn labels are", () => {
    // (an OH drawn: the plugin gives the oxygen, which a label "O" would have said has no hydrogen)
    const r = pictureFigure({
      atoms: [
        { x: 0, y: 0, el: "C" },
        { x: 30, y: 0, el: "O" },
      ],
      bonds: [{ a: 0, b: 1, order: 1 }],
    })!;
    expect(structureOf(r, reads).atoms.map((a) => [a.el, a.unsure])).toEqual([
      ["C", undefined],
      ["O", undefined],
    ]);
    // (a group's label read as a figure's is)
    const group = pictureFigure({ atoms: [{ x: 0, y: 0 }, { x: 30, y: 0, label: "OTBS" }], bonds: [{ a: 0, b: 1, order: 1 }] })!;
    expect(structureOf(group, reads).atoms[1].el).toBe("OTBS");
  });

  it("is moved to a PDF's page: its pixels made points, from the box's top left", () => {
    const r = pictureFigure({ atoms: [{ x: 0, y: 0 }, { x: 200, y: 100 }], bonds: [{ a: 0, b: 1, order: 1 }] })!;
    const onPage = scaledFigure(r, 72 / 200, 50, 300);
    expect(onPage.atoms.map((a) => [a.x, a.y])).toEqual([
      [50, 300],
      [122, 336],
    ]);
    expect(onPage.bond).toBeCloseTo(Math.hypot(200, 100) * 0.36);
  });
});
