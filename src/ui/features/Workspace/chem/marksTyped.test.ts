import { describe, expect, it, vi } from "vitest";
import { forgetLaidOut } from "../../../../lib/layout/engine";
import { MENO } from "../../../../lib/chem/style";
import { readSmiles } from "../../../../lib/chem/smiles";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID } from "../utils/arrangement";
import { metalPairsIn } from "./fromSmiles";

// A typed SMILES's mark at a metal (lib/chem/smiles `pairsMarked`, chem/fromSmiles `metalPairsIn`, `marksKept`) through the typed
// route itself, the plugin stood in for: what it answers is a block each test sets (found in review).

/** What the plugin answers to a SMILES: a block set by the test. */
let blockOf = "";
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: async () => ({
    request: async (op: string) => (op === "from_smiles" ? { molblock: blockOf } : { read: true, elements: [] }),
  }),
}));

function spokeBlock(spokes: ([string, number] | "metal")[], metal: string, charge = 0, extra: [number, number][] = []): string {
  const f = (v: number) => v.toFixed(4).padStart(10);
  const at = spokes.findIndex((s) => s === "metal");
  const atoms = spokes.map((s) => (s === "metal" ? `${f(0)}${f(0)}${f(0)} ${metal.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0` : `${f(1.5 * Math.cos((s[1] * Math.PI) / 180))}${f(1.5 * Math.sin((s[1] * Math.PI) / 180))}${f(0)} ${s[0].padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`));
  const bonds = [...spokes.flatMap((s, k) => (s === "metal" ? [] : [`${String(at + 1).padStart(3)}${String(k + 1).padStart(3)}  1  0`])), ...extra.map(([a, b]) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}  1  0`)];
  return ["", "  test", "", `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, ...(charge ? [`M  CHG  1 ${String(at + 1).padStart(3)}${String(charge).padStart(4)}`] : []), "M  END", ""].join("\n");
}
const metalMarked = (m: Model, metal: string) => readMarks(m).atoms.get(m.atoms.find((a) => a.el === metal)!.id);

describe("a typed SMILES's mark at a metal, through structureFromSmiles itself", () => {
  it("a marked metal the finished drawing has the pairs of is given (no mark); one it has other pairs of is marked not given", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const { structureFromSmiles } = await import("./fromSmiles");
    // (trans-[CoCl2(NH3)4]+, the mark says the Cl across each other; drawn so)
    blockOf = spokeBlock([["Cl", 180], "metal", ["N", 60], ["N", 120], ["N", 240], ["N", 300], ["Cl", 0]], "Co", 1);
    const kept = await structureFromSmiles("Cl[Co@OH1+]([NH3])([NH3])([NH3])([NH3])Cl", MENO);
    expect(metalMarked(kept, "Co")).toBeUndefined();
    // (the mark says the first Cl is across an N; the plugin's picture has the two Cl across each other)
    blockOf = spokeBlock([["Cl", 180], "metal", ["Cl", 0], ["N", 60], ["N", 120], ["N", 240], ["N", 300]], "Co", 1);
    const wrong = await structureFromSmiles("Cl[Co@OH1+](Cl)([NH3])([NH3])([NH3])[NH3]", MENO);
    expect(metalMarked(wrong, "Co")).toBe(ARRANGEMENT_SAID);
  });
});

describe("metalPairsIn reads the pairs only of a block that is the SMILES's own atoms and bonds", () => {
  it("a block with the same atoms and one more bond: none", () => {
    const smiles = "Cl[Co@OH1+]([NH3])([NH3])([NH3])([NH3])Cl";
    const spokes: ([string, number] | "metal")[] = [["Cl", 180], "metal", ["N", 60], ["N", 120], ["N", 240], ["N", 300], ["Cl", 0]];
    expect(metalPairsIn(smiles, spokeBlock(spokes, "Co", 1))).toHaveLength(1);
    expect(metalPairsIn(smiles, spokeBlock(spokes, "Co", 1, [[2, 3]]))).toEqual([]);
    expect(metalPairsIn(smiles, spokeBlock(spokes, "Co", 1, [[0, 6]]))).toEqual([]);
  });
});

describe("the largest chelate ring a mark cannot put across (seven atoms with the metal)", () => {
  it("a ring of seven is refused, of eight read", () => {
    expect(() => readSmiles("[Co@OH1+]123456.[NH2]1CCCC[NH2]6.Cl2.Cl3.[NH3]4.[NH3]5", { metalMarks: true })).toThrow(/two ends of one chelate across/);
    expect(readSmiles("[Co@OH1+]123456.[NH2]1CCCCC[NH2]6.Cl2.Cl3.[NH3]4.[NH3]5", { metalMarks: true }).arrangements).toHaveLength(1);
  });
});

describe("a chelated metal the mark gives the pairs of, through structureFromSmiles itself", () => {
  it("cis-[Co(en)2Cl2]+ in the plugin's earlier picture (the N an X, the Cl side by side) is given, not marked", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const { structureFromSmiles } = await import("./fromSmiles");
    const f = (v: number) => v.toFixed(4).padStart(10);
    const at = (deg: number, r = 1.5) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
    const places = [[0, 0], at(75), at(105), at(45), at(25, 2.6), at(335, 2.6), at(315), at(135), at(155, 2.6), at(205, 2.6), at(225)];
    const els = ["Co", "Cl", "Cl", "N", "C", "C", "N", "N", "C", "C", "N"];
    const bonds = [[0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [5, 6], [0, 6], [0, 7], [7, 8], [8, 9], [9, 10], [0, 10]];
    blockOf = ["", "  test", "", `${String(els.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
      ...els.map((el, k) => `${f(places[k][0])}${f(places[k][1])}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
      ...bonds.map(([a, b]) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}  1  0`), "M  CHG  1   1   1", "M  END", ""].join("\n");
    const kept = await structureFromSmiles("[Co@OH1+]123456.Cl1.Cl2.[NH2]3CC[NH2]4.[NH2]5CC[NH2]6", MENO);
    expect(metalMarked(kept, "Co")).toBeUndefined();
  });
});
