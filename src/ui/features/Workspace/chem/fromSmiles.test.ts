import { describe, expect, it, vi } from "vitest";
import { WILEY } from "../../../../lib/chem/style";
import { measured } from "../../../../testing/timeouts";
import { openDoublesOf } from "./fromSmiles";

// (the plugin's drawing of ethanol, and the engine's layout, stood in for: what is asked of each is what is looked at)
const ETHANOL = "\n  Meno\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.2990    0.7500    0.0000 C   0  0\n    2.5981    0.0000    0.0000 O   0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n";
vi.mock("../../../../lib/roles/worker", () => ({ chemWorker: async () => ({ request: async () => ({ molblock: ETHANOL }) }) }));
const laidOut = vi.fn(async (m: unknown) => m);
vi.mock("./cleanUp", () => ({ laidOut: (...a: unknown[]) => laidOut(...(a as [unknown])) }));

describe("a structure from its SMILES", () => {
  it("is laid out in the style of the drawing it goes into, where one is given", async () => {
    const { structureFromSmiles } = await import("./fromSmiles");
    const drawn = await structureFromSmiles("CCO", WILEY);
    expect(drawn.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
    expect(laidOut).toHaveBeenLastCalledWith(expect.objectContaining({ atoms: expect.any(Array) }), WILEY, undefined, undefined);
    // (none given: the layout's own default, the app's style)
    await structureFromSmiles("CCO");
    expect(laidOut).toHaveBeenLastCalledWith(expect.objectContaining({ atoms: expect.any(Array) }), undefined, undefined, undefined);
  }, measured(390));
});

describe("the open double bonds of a SMILES, on the plugin's drawing of it (openDoublesOf)", () => {
  /** A V2000 MOL block of `atoms` (by element) and `bonds` ([a, b, order], 0-based), its places all 0: only its graph is read here. */
  const block = (atoms: string[], bonds: [number, number, number][]) =>
    "\n  Meno\n\n" +
    `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000\n` +
    atoms.map((el) => `    0.0000    0.0000    0.0000 ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0\n`).join("") +
    bonds.map(([a, b, o]) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}${String(o).padStart(3)}  0\n`).join("") +
    "M  END\n";
  // (3-methylpent-2-ene from CC=C(C)CC: atoms C0..C5, its C1=C2 left open with an end of two groups - "either")
  const SMILES = "CC=C(C)CC";
  const C6 = ["C", "C", "C", "C", "C", "C"];
  const BONDS: [number, number, number][] = [[0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1], [4, 5, 1]];

  it("maps the bond to the block's own index where the block is the SMILES's atoms and bonds, in whatever order its bonds come", () => {
    const reordered: [number, number, number][] = [[4, 5, 1], [2, 3, 1], [0, 1, 1], [2, 4, 1], [2, 1, 2]];
    expect(openDoublesOf(SMILES, block(C6, reordered))).toEqual({ straight: [], either: [4] });
    expect(openDoublesOf(SMILES, block(C6, BONDS))).toEqual({ straight: [], either: [1] });
    expect([...(openDoublesOf("CC=CC", block(["C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 1]]))?.straight ?? [])].sort()).toEqual([1, 2]);
  });

  it("gives nothing - the structure drawn as the plugin has it - where the block's atoms are not the SMILES's: an H added, an atom moved", () => {
    expect(openDoublesOf(SMILES, block([...C6, "H"], [...BONDS, [0, 6, 1]]))).toBeNull();
    // (OCC=C(C)CC with its O written last: as many atoms, not the same in order)
    const o: [number, number, number][] = [[6, 0, 1], [0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1], [4, 5, 1]];
    expect(openDoublesOf("OCC=C(C)CC", block([...C6, "O"], o))).toBeNull();
    // (the same bonds, an atom of another element: CC=C(C)CO's O a C in the block; and an atom more, bonded to nothing - a counter-ion)
    expect(openDoublesOf("CC=C(C)CO", block(C6, BONDS))).toBeNull();
    expect(openDoublesOf(SMILES, block([...C6, "Na"], BONDS))).toBeNull();
  });

  it("gives nothing where the block's bonds are not the SMILES's", () => {
    expect(openDoublesOf(SMILES, block(C6, [[0, 1, 1], [1, 2, 2], [2, 3, 1], [2, 4, 1], [3, 5, 1]]))).toBeNull();
    expect(openDoublesOf(SMILES, block(C6, BONDS.slice(0, 4)))).toBeNull();
  });
});
