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
});

describe("the fold", () => {
  it("counts each plain hydrogen as one of its neighbour's, and keeps the rest atoms", () => {
    const input: FoldedInput = { atoms: [{ el: "C" }, { el: "H" }, { el: "H", isotope: 2 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };
    expect(hydrogensFolded(input)).toEqual({ atoms: [{ el: "C", hs: 1 }, { el: "H", isotope: 2 }], bonds: [{ a: 0, b: 1, order: 1 }] });
  });

  it("gives back the very structure where nothing is plain", () => {
    const input: FoldedInput = { atoms: [{ el: "C" }, { el: "O" }], bonds: [{ a: 0, b: 1, order: 2 }] };
    expect(hydrogensFolded(input)).toBe(input);
  });
});
