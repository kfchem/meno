import { describe, expect, it } from "vitest";
import "../store";
import { processFileContent, editorModelOf } from "../utils/io";
import { undrawnHydrogens } from "./drawing";
import { setValenceOrder } from "../../../../lib/chem/molecule";

// (hand-written V3000 blocks, in the shape a SMILES of a metal complex is read to: its ligands' bonds to the metal as
//  coordination bonds, type 9, and the metal's valence set, VAL - the coordinates set by hand)
const block = (atoms: string[], bonds: string[]) =>
  [
    "",
    "     hand",
    "",
    "  0  0  0  0  0  0  0  0  0  0999 V3000",
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`,
    "M  V30 BEGIN ATOM",
    ...atoms.map((a, i) => `M  V30 ${i + 1} ${a}`),
    "M  V30 END ATOM",
    "M  V30 BEGIN BOND",
    ...bonds.map((b, i) => `M  V30 ${i + 1} ${b}`),
    "M  V30 END BOND",
    "M  V30 END CTAB",
    "M  END",
  ].join("\n");

/** Each atom's element, charge and the H Meno gives it, read as Quick Add reads the plugin's block. */
async function readAs(mol: string): Promise<string[]> {
  const m = editorModelOf((await processFileContent("drawing.mol", mol)).model);
  const hs = undrawnHydrogens(m);
  return m.atoms.map((a) => `${a.el}${a.charge ? `(${a.charge})` : ""} H${hs.get(a.id)}`);
}

describe("a metal whose valence its file sets, bound by coordination bonds", () => {
  it("is given no H its coordination bonds take the place of - cisplatin's Pt none, each NH3 three", async () => {
    // (cis-[PtCl2(NH3)2]: Pt VAL=4 - two bonds to Cl, two coordination bonds from NH3)
    const cisplatin = block(["N 0.87 -0.65 0 0", "Pt 0 -0.15 0 0 VAL=4", "N -0.87 -0.65 0 0", "Cl 0.5 0.72 0 0", "Cl -0.5 0.72 0 0"], ["9 1 2", "9 3 2", "1 2 4", "1 2 5"]);
    expect(await readAs(cisplatin)).toEqual(["N H3", "Pt H0", "N H3", "Cl H0", "Cl H0"]);
    // ([Pt(NH3)4]2+: Pt(2+) VAL=4, four coordination bonds - none)
    const tetraammine = block(["N 1 0 0 0", "Pt 0 0 0 0 CHG=2 VAL=4", "N -1 0 0 0", "N 0 1 0 0", "N 0 -1 0 0"], ["9 1 2", "9 3 2", "9 4 2", "9 5 2"]);
    expect(await readAs(tetraammine)).toEqual(["N H3", "Pt(2) H0", "N H3", "N H3", "N H3"]);
    // (the metal listed first in its coordination bonds: its end counted alike)
    const metalFirst = block(["N 0.87 -0.65 0 0", "Pt 0 -0.15 0 0 VAL=4", "N -0.87 -0.65 0 0", "Cl 0.5 0.72 0 0", "Cl -0.5 0.72 0 0"], ["9 2 1", "9 2 3", "1 2 4", "1 2 5"]);
    expect(await readAs(metalFirst)).toEqual(["N H3", "Pt H0", "N H3", "Cl H0", "Cl H0"]);
    // (the same with Zn and Cu)
    expect(await readAs(cisplatin.replace("Pt 0", "Zn 0"))).toEqual(["N H3", "Zn H0", "N H3", "Cl H0", "Cl H0"]);
    expect(await readAs(tetraammine.replace("Pt 0", "Cu 0"))).toEqual(["N H3", "Cu(2) H0", "N H3", "N H3", "N H3"]);
  });

  it("counts a coordination bond toward a set valence at a metal alone: a non-metal's, an NH3 given VAL=3, as before", async () => {
    // (each NH3 with its own valence set, 3: its coordination bond takes none of it - three H, as on main)
    const setN = block(["N 0.87 -0.65 0 0 VAL=3", "Pt 0 -0.15 0 0 VAL=4", "N -0.87 -0.65 0 0 VAL=3", "Cl 0.5 0.72 0 0", "Cl -0.5 0.72 0 0"], ["9 1 2", "9 3 2", "1 2 4", "1 2 5"]);
    expect(await readAs(setN)).toEqual(["N H3", "Pt H0", "N H3", "Cl H0", "Cl H0"]);
    // (by element: a metal counts its order; a non-metal, or a label that is no element, as valenceOrder has it)
    const coordination = { order: 1, coordination: true };
    expect([setValenceOrder(coordination, "Pt"), setValenceOrder(coordination, "Zn"), setValenceOrder(coordination, "N"), setValenceOrder(coordination, "Me"), setValenceOrder(coordination, "C")]).toEqual([1, 1, 0, 0, 2]);
  });

  it("keeps an H a set valence leaves where its bonds do not take it all - a metal hydride", async () => {
    // (Pt VAL=4 with one Cl, one H left over beside two NH3: one H, as its file says)
    const hydride = block(["N 0.87 -0.65 0 0", "Pt 0 -0.15 0 0 VAL=4", "N -0.87 -0.65 0 0", "Cl 0.5 0.72 0 0"], ["9 1 2", "9 3 2", "1 2 4"]);
    expect(await readAs(hydride)).toEqual(["N H3", "Pt H1", "N H3", "Cl H0"]);
  });
});
