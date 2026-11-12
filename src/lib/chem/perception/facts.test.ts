import { describe, expect, it } from "vitest";
import { expectTypeOf } from "vitest";
import type { IdentityInput } from "../identity";
import type { LayoutInput } from "../../layout/perceive";
import type { ChemGraph } from "./graph";
import { factsOf } from "./facts";

// Graphs worked out by hand: each atom's neighbours and bonds in bond order, the bond between two atoms, the connected pieces in the order found
// from atom 0 up.

const graph = (els: string[], bonds: [number, number][], more: Partial<ChemGraph> = {}): ChemGraph => ({ atoms: els.map((el) => ({ el })), bonds: bonds.map(([a, b]) => ({ a, b, order: 1 })), ...more });

describe("a graph's facts, by hand", () => {
  it("ethane: each carbon's neighbour and bond, the bond between them either way, one piece", () => {
    const f = factsOf(graph(["C", "C"], [[0, 1]]));
    expect(f.around).toEqual([[1], [0]]);
    expect(f.bondsAt).toEqual([[0], [0]]);
    expect(f.bondBetween(0, 1)).toBe(0);
    expect(f.bondBetween(1, 0)).toBe(0);
    expect(f.pieces).toEqual([[0, 1]]);
  });

  it("cyclopropane: three atoms, each with two neighbours in the order of its bonds - atom 0's bond 2 comes after its bond 0 - and one piece in the order walked out from atom 0", () => {
    const f = factsOf(graph(["C", "C", "C"], [[0, 1], [1, 2], [2, 0]]));
    expect(f.around).toEqual([[1, 2], [0, 2], [1, 0]]);
    expect(f.bondsAt).toEqual([[0, 2], [0, 1], [1, 2]]);
    expect(f.bondBetween(2, 0)).toBe(2);
    expect(f.bondBetween(0, 2)).toBe(2);
    expect(f.pieces).toEqual([[0, 1, 2]]);
  });

  it("a salt of two ions and a molecule: one piece each, in the order of their first atoms", () => {
    // (Na+ 0, Cl- 1, then ethane's two carbons 2 and 3)
    const f = factsOf(graph(["Na", "Cl", "C", "C"], [[2, 3]]));
    expect(f.pieces).toEqual([[0], [1], [2, 3]]);
    expect(f.around).toEqual([[], [], [3], [2]]);
    expect(f.bondBetween(0, 1)).toBe(-1);
  });

  it("a bond to itself, or listed again - the other way round, or the same - counts once, by its first: a graph with a doubled bond index order", () => {
    // (bond 0: 0-1; bond 1: 1-0 again; bond 2: 1-1, a bond to itself; bond 3: 1-2)
    const f = factsOf(graph(["C", "C", "C"], [[0, 1], [1, 0], [1, 1], [1, 2]]));
    expect(f.around).toEqual([[1], [0, 2], [1]]);
    expect(f.bondsAt).toEqual([[0], [0, 3], [3]]);
    expect(f.bondBetween(1, 0)).toBe(0);
    expect(f.bondBetween(1, 1)).toBe(-1);
    expect(f.bondBetween(2, 1)).toBe(3);
  });

  it("a ring bound face-on to a metal: the star and its pi system are one piece with the metal, the star reaching its atoms and each reaching its star", () => {
    // (Fe 0, the star 1 bonded to it, and a cyclopentadienyl's five atoms 2-6 joined only by the star's pi: no bond holds it to the star)
    const g = graph(["Fe", "*", "C", "C", "C", "C", "C"], [[0, 1]], { atoms: [{ el: "Fe" }, { el: "*", pi: [2, 3, 4, 5, 6] }, ...[2, 3, 4, 5, 6].map(() => ({ el: "C" }))] });
    expect(factsOf(g).pieces).toEqual([[0, 1, 2, 3, 4, 5, 6]]);
    // (without the star's bond to the metal the ring and its star are still one piece, the metal another)
    const apart = { ...g, bonds: [] };
    expect(factsOf(apart).pieces).toEqual([[0], [1, 2, 3, 4, 5, 6]]);
  });

  it("an empty graph has nothing", () => {
    const f = factsOf(graph([], []));
    expect([f.around, f.bondsAt, f.pieces]).toEqual([[], [], []]);
    expect(f.bondBetween(0, 1)).toBe(-1);
  });
});

describe("a graph's facts are worked out once per graph object", () => {
  it("gives the same arrays for the same object asked twice - and the same pieces, made on the first asking", () => {
    const g = graph(["C", "C", "C"], [[0, 1], [1, 2]]);
    const a = factsOf(g);
    expect(factsOf(g)).toBe(a);
    expect(factsOf(g).around).toBe(a.around);
    expect(a.pieces).toBe(a.pieces);
  });

  it("gives two equal graphs that are different objects each their own", () => {
    const [g, h] = [graph(["C", "C"], [[0, 1]]), graph(["C", "C"], [[0, 1]])];
    expect(factsOf(g)).not.toBe(factsOf(h));
    expect(factsOf(g).around).not.toBe(factsOf(h).around);
    expect(factsOf(g).around).toEqual(factsOf(h).around);
  });
});

describe("the layout's input and identity's are the core's graph", () => {
  it("is a change of names only: each is assignable to a ChemGraph (checked by the compiler)", () => {
    expectTypeOf<LayoutInput>().toExtend<ChemGraph>();
    expectTypeOf<IdentityInput>().toExtend<ChemGraph>();
    expect(true).toBe(true);
  });
});
