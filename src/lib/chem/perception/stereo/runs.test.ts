import { describe, expect, it } from "vitest";
import { cumulatedRuns, runsOf, runsThrough, type RunGraph } from "./runs";

/** A chain of `els` joined by `orders` (one fewer), with `extra` bonds (a group, a ring's closing bond) after it. */
const chain = (els: string[], orders: number[], extra: { a: number; b: number; order: number }[] = [], charges: Record<number, number> = {}): RunGraph => ({
  atoms: els.map((el, i) => (charges[i] ? { el, charge: charges[i] } : { el })),
  bonds: [...orders.map((order, i) => ({ a: i, b: i + 1, order })), ...extra],
});

/** Each run's atoms, doubles and oddness, as plain values. */
const shown = (g: RunGraph, middle?: Parameters<typeof cumulatedRuns>[1]) => cumulatedRuns(g, middle).map((r) => ({ atoms: [...r.atoms], doubles: r.doubles, odd: r.odd }));

describe("a run of cumulated double bonds, end to end", () => {
  it("an allene, CH3-CH=C=CH-CH3: one run of two double bonds, even (an axis)", () => {
    expect(shown(chain(["C", "C", "C", "C", "C"], [1, 2, 2, 1]))).toEqual([{ atoms: [1, 2, 3], doubles: 2, odd: false }]);
  });

  it("a butatriene, C=C=C=C with a methyl on each end: one run of three, odd (a cis or trans)", () => {
    expect(shown(chain(["C", "C", "C", "C", "C", "C"], [1, 2, 2, 2, 1]))).toEqual([{ atoms: [1, 2, 3, 4], doubles: 3, odd: true }]);
  });

  it("a pentatetraene, C=C=C=C=C: one run of four, even", () => {
    expect(shown(chain(["C", "C", "C", "C", "C"], [2, 2, 2, 2]))).toEqual([{ atoms: [0, 1, 2, 3, 4], doubles: 4, odd: false }]);
  });

  it("a ketene, CH2=C=O: a run of two ending on its O - reported; that its O end carries nothing is the caller's rule", () => {
    expect(shown(chain(["C", "C", "O"], [2, 2]))).toEqual([{ atoms: [0, 1, 2], doubles: 2, odd: false }]);
  });

  it("a carbodiimide, CH3-N=C=N-CH3: an even run with N ends, reported as a run", () => {
    expect(shown(chain(["C", "N", "C", "N", "C"], [1, 2, 2, 1]))).toEqual([{ atoms: [1, 2, 3], doubles: 2, odd: false }]);
  });

  it("a run in a ring, cyclonona-1,2-diene: reported whatever ring it is in", () => {
    const ring = chain(["C", "C", "C", "C", "C", "C", "C", "C", "C"], [2, 2, 1, 1, 1, 1, 1, 1], [{ a: 8, b: 0, order: 1 }]);
    expect(shown(ring)).toEqual([{ atoms: [0, 1, 2], doubles: 2, odd: false }]);
  });

  it("each run once, its lower-numbered end first, in order of that end: two runs in one structure", () => {
    // (C=C=C-C-C=C=C=C, numbered from the far end of the second so that the first run's ends are not the lowest)
    const g = chain(["C", "C", "C", "C", "C", "C", "C", "C"], [2, 2, 2, 1, 1, 2, 2]);
    expect(shown(g)).toEqual([
      { atoms: [0, 1, 2, 3], doubles: 3, odd: true },
      { atoms: [5, 6, 7], doubles: 2, odd: false },
    ]);
  });

  it("a lone double bond, or two that do not share an atom, is no run", () => {
    expect(shown(chain(["C", "C", "C", "C"], [2, 1, 2]))).toEqual([]);
  });
});

describe("what a run goes on through", () => {
  it("the reader's: a carbon or an N+ - a sulfur's C=S=C is bent, no run; any atom bonded by two double bonds alone, in 3D", () => {
    const sulfur = chain(["C", "C", "S", "C", "C"], [1, 2, 2, 1]);
    expect(shown(sulfur)).toEqual([]);
    expect(shown(sulfur, "bondedByTwo")).toEqual([{ atoms: [1, 2, 3], doubles: 2, odd: false }]);
    const nPlus = chain(["C", "C", "N", "C", "C"], [1, 2, 2, 1], [], { 2: 1 });
    expect(shown(nPlus)).toEqual([{ atoms: [1, 2, 3], doubles: 2, odd: false }]);
    const nNeutral = chain(["C", "C", "N", "C", "C"], [1, 2, 2, 1]);
    expect(shown(nNeutral)).toEqual([]);
  });

  it("an atom bonded to something besides its two double bonds is no middle but by the CIP marks' rule", () => {
    // (C=C(-C)=C: a middle C with a third neighbour)
    const g = chain(["C", "C", "C"], [2, 2], [{ a: 1, b: 3, order: 1 }]);
    (g.atoms as { el: string }[]).push({ el: "C" });
    expect(shown(g)).toEqual([]);
    expect(shown(g, "bondedByTwo")).toEqual([]);
    expect(shown(g, "twoDoubles")).toEqual([{ atoms: [0, 1, 2], doubles: 2, odd: false }]);
  });

  it("an atom of three double bonds is no middle by any rule: a run goes on through two", () => {
    // (C=S(=C)=O, a sulfur with three double bonds)
    const g: RunGraph = { atoms: [{ el: "C" }, { el: "S" }, { el: "C" }, { el: "O" }], bonds: [{ a: 0, b: 1, order: 2 }, { a: 1, b: 2, order: 2 }, { a: 1, b: 3, order: 2 }] };
    expect(shown(g, "bondedByTwo")).toEqual([]);
    expect(shown(g, "twoDoubles")).toEqual([]);
  });

  it("a run starts at a double bond only, not at a single bond into its middle (the CIP marks' rule, whose middle may have one)", () => {
    // (a methyl, atom 0, on the middle of the allene 1=2=3)
    const g: RunGraph = { atoms: [{ el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }], bonds: [{ a: 1, b: 2, order: 2 }, { a: 2, b: 3, order: 2 }, { a: 0, b: 2, order: 1 }] };
    expect(shown(g, "twoDoubles")).toEqual([{ atoms: [1, 2, 3], doubles: 2, odd: false }]);
  });

  it("a bond listed twice is one bond", () => {
    const once = chain(["C", "C", "C", "C", "C"], [1, 2, 2, 1]);
    const twice = { ...once, bonds: [...once.bonds, { a: 2, b: 1, order: 2 }] };
    expect(shown(twice)).toEqual(shown(once));
  });

  it("the run a double bond is in, from whichever of its bonds: a butatriene's middle bond gives the whole run", () => {
    const runs = runsOf(chain(["C", "C", "C", "C", "C", "C"], [1, 2, 2, 2, 1]));
    for (const [a, b] of [[1, 2], [2, 3], [3, 2], [4, 3]]) expect(runs.of(a, b).atoms).toEqual([1, 2, 3, 4]);
    expect(runs.of(2, 3).odd).toBe(true);
    // (a plain double bond's run is itself)
    expect(runsOf(chain(["C", "C", "C"], [1, 2])).of(2, 1)).toEqual({ atoms: [1, 2], doubles: 1, odd: true });
  });

  it("an end with a second bond of order two or more besides the double bond: a double's, or a triple's (an azide's middle N)", () => {
    // (C=C=C: the middle's other double bond; C=N=N with its N=N as a triple; a lone C=C has none)
    expect(runsOf(chain(["C", "C", "C"], [2, 2])).cumulatedAt(1, 0)).toBe(true);
    expect(runsOf(chain(["C", "N", "N"], [2, 3])).cumulatedAt(1, 0)).toBe(true);
    const lone = runsOf(chain(["C", "C", "C", "C"], [1, 2, 1]));
    expect(lone.cumulatedAt(1, 2)).toBe(false);
    expect(lone.cumulatedAt(2, 1)).toBe(false);
  });

  it("from an end on: the atoms through the run to its far end", () => {
    const runs = runsOf(chain(["C", "C", "C", "C", "C"], [1, 2, 2, 1]));
    expect(runs.from(1, 2)).toEqual([1, 2, 3]);
    expect(runs.from(3, 2)).toEqual([3, 2, 1]);
    expect(runs.middle(2)).toBe(true);
    expect(runs.middle(1)).toBe(false);
  });
});

describe("the atom an end runs on through", () => {
  // penta-2,3-diene, CH3-CH=C=CH-CH3: atoms 0 to 4, its ends 1 and 3
  const around = (g: RunGraph, x: number) => g.bonds.flatMap((b) => (b.a === x ? [{ to: b.b, order: b.order }] : b.b === x ? [{ to: b.a, order: b.order }] : []));
  const diene = chain(["C", "C", "C", "C", "C"], [1, 2, 2, 1]);

  it("an allene's end: across its cumulated double bond, so that its own groups are the rest", () => {
    expect(runsThrough(around(diene, 1), 3)).toBe(2);
    expect(runsThrough(around(diene, 3), 1)).toBe(2);
    expect(around(diene, 1).filter((e) => e.to !== runsThrough(around(diene, 1), 3)).map((e) => e.to)).toEqual([0]);
  });

  it("a biaryl's end: the other end, bonded to it", () => {
    // (two atoms joined by a single bond, each with an aromatic bond besides)
    const g = chain(["C", "C", "C", "C"], [4, 1, 4]);
    expect(runsThrough(around(g, 1), 2)).toBe(2);
  });

  it("an end whose bond on is a triple one: the atom across it, as across a double (any order of two or more)", () => {
    // (C-C#C-C: from atom 1, which is not bonded to atom 3, on across its triple bond to atom 2)
    const g = chain(["C", "C", "C", "C"], [1, 3, 1]);
    expect(runsThrough(around(g, 1), 3)).toBe(2);
  });

  it("none where the end has neither: each caller says what stands in", () => {
    expect(runsThrough(around(chain(["C", "C"], [1]), 0))).toBeUndefined();
  });
});
