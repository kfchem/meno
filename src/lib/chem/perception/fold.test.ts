/**
 * The one test of a plain hydrogen (perception/fold `plainHydrogen`): an H folded into the atom it is on, as a structure drawn without it
 * has it, only where it carries nothing of its own - no charge, isotope, unpaired electrons, map or hydrogens; one single bond, to an atom
 * that is no H and no metal; no part of a pi system bound to a metal, nor an axis's end.
 */
import { describe, expect, it } from "vitest";
import { hydrogensFolded, plainHydrogen, type FoldedAtom, type FoldedInput } from "./fold";

/** A carbon (0) with an H (1) on it, the H as `h` says; and a second carbon (2) bonded to the first, `more` bonds besides. */
function onCarbon(h: Partial<FoldedAtom> = {}, order = 1, more: FoldedInput["bonds"] = []): FoldedInput {
  return {
    atoms: [{ el: "C" }, { el: "H", ...h }, { el: "C" }],
    bonds: [{ a: 0, b: 1, order }, { a: 0, b: 2, order: 1 }, ...more],
  };
}

describe("a plain hydrogen", () => {
  it("is an H of one single bond to a carbon, carrying nothing", () => {
    expect(plainHydrogen(onCarbon(), 1)).toBe(true);
    expect(plainHydrogen(onCarbon(), 0)).toBe(false);
  });

  it("is none where it carries a charge, one isotope in particular, unpaired electrons, a map number or hydrogens of its own", () => {
    for (const h of [{ charge: 1 }, { isotope: 2 }, { radical: "doublet" as const }, { mapped: true as const }, { hs: 1 }]) expect(plainHydrogen(onCarbon(h), 1)).toBe(false);
  });

  it("is none bonded by anything but one single bond, to more than one atom, to none, or to another H", () => {
    expect(plainHydrogen(onCarbon({}, 2), 1)).toBe(false);
    expect(plainHydrogen(onCarbon({}, 1, [{ a: 1, b: 2, order: 1 }]), 1)).toBe(false);
    expect(plainHydrogen({ atoms: [{ el: "H" }], bonds: [] }, 0)).toBe(false);
    expect(plainHydrogen({ atoms: [{ el: "H" }, { el: "H" }], bonds: [{ a: 0, b: 1, order: 1 }] }, 0)).toBe(false);
  });

  it("is none on a metal: a hydride is a ligand, kept an atom", () => {
    expect(plainHydrogen({ atoms: [{ el: "Pt" }, { el: "H" }], bonds: [{ a: 0, b: 1, order: 1 }] }, 1)).toBe(false);
  });

  it("is none that is itself a centre, part of a pi system bound to a metal, or an axis's end (found in review)", () => {
    // (an H given a configuration of its own: as drawn, never folded)
    expect(plainHydrogen(onCarbon({ tetra: { neighbours: [0, -1, -1], volume: 1 } as never }), 1)).toBe(false);
    // (an H among a star's pi system: the system's atom, not a plain H)
    const star: FoldedInput = { atoms: [{ el: "Fe" }, { el: "*", pi: [2, 3] }, { el: "C" }, { el: "H" }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 2, b: 3, order: 1 }] };
    expect(plainHydrogen(star, 3)).toBe(false);
    // (an H at an axis's end)
    const axis: FoldedInput = { ...onCarbon(), axes: [{ atoms: [1, 0], refs: [0, 2], sense: 1 }] };
    expect(plainHydrogen(axis, 1)).toBe(false);
  });
});

describe("the fold", () => {
  it("counts each plain hydrogen as one of its neighbour's, and keeps the rest atoms", () => {
    const input: FoldedInput = { atoms: [{ el: "C" }, { el: "H" }, { el: "H", isotope: 2 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };
    expect(hydrogensFolded(input)).toEqual({ atoms: [{ el: "C", hs: 1 }, { el: "H", isotope: 2 }], bonds: [{ a: 0, b: 1, order: 1 }] });
  });

  it("drops an axis whose folded hydrogen has no other neighbour at its end to stand in for it (found in review)", () => {
    // (an allene C1=C2=C3: C1 with a plain H (3) as its reference and a second H (4); C3 with two carbons, 5 and 6)
    const input: FoldedInput = {
      atoms: [{ el: "C" }, { el: "C" }, { el: "C" }, { el: "H" }, { el: "H" }, { el: "C" }, { el: "C" }],
      bonds: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 2 },
        { a: 0, b: 3, order: 1 },
        { a: 0, b: 4, order: 1 },
        { a: 2, b: 5, order: 1 },
        { a: 2, b: 6, order: 1 },
      ],
      axes: [{ atoms: [0, 2], refs: [3, 5], sense: 1 }],
    };
    // (both of C1's hydrogens folded: nothing is left to carry the reference, and there was no configuration)
    expect(hydrogensFolded(input).axes).toEqual([]);
  });

  it("gives back the very structure where nothing is plain", () => {
    const input: FoldedInput = { atoms: [{ el: "C" }, { el: "O" }], bonds: [{ a: 0, b: 1, order: 2 }] };
    expect(hydrogensFolded(input)).toBe(input);
  });
});
