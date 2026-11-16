import { describe, expect, it } from "vitest";
import { openDoubleBonds } from "./drawn";
import { smilesInput } from "./smilesInput";
import { unspecifiedDoubles, type Atom, type Bond } from "../chem/layout2d";

const open = (smiles: string) => openDoubleBonds(smilesInput(smiles));

describe("what a run goes on through - a carbon, or an N+ - and what it does not", () => {
  it("opens an odd run through an N+ as it does one through carbons (the reader's own test of a run)", () => {
    expect(open("CC=[N+]=C=CC").straight.sort()).toEqual([1, 4]);
    expect(open("CC=C=[N+]=CC").straight.sort()).toEqual([1, 4]);
  });

  it("leaves as it is a run that would go on through a sulfur: a C=S=C is bent, no run", () => {
    expect(open("CC=C=S=CC")).toEqual({ straight: [], either: [] });
    expect(open("CC=S=C=CC")).toEqual({ straight: [], either: [] });
  });

  /** Hexa-2,3,4-triene's run C1=C2=C3=C4 along x, C1 with two groups, C4's one group bent off the run; C1=C2 marked either; atom 1 as given. */
  const wavy = (middle: Partial<Atom>) => {
    const atoms: Atom[] = [[0, 0], [1, 0], [2, 0], [3, 0], [-0.7, 1.1], [-0.7, -1.1], [3.7, 1.1]].map(([x, y], i) => ({ id: i, x, y, el: "C", ...(i === 1 ? middle : {}) }));
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "either" },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 2 },
      { a1: 0, a2: 4, order: 1 },
      { a1: 0, a2: 5, order: 1 },
      { a1: 3, a2: 6, order: 1 },
    ];
    return unspecifiedDoubles(atoms, bonds).flatMap((b, k) => (b.stereo === "wavy" ? [k] : []));
  };
  it("takes the run's wavy bond through an N+ to the far end's group, and through no neutral N", () => {
    expect(wavy({ el: "C" })).toEqual([5]);
    expect(wavy({ el: "N", charge: 1 })).toEqual([5]);
    expect(wavy({ el: "N" })).toEqual([]);
  });
});
