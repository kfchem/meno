import { describe, expect, it, vi } from "vitest";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { MENO } from "../../../../lib/chem/style";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawingOf } from "./drawing";

/**
 * A SMILES's allene axis and butatriene's cis or trans, through `structureFromSmiles` itself - what Quick Add and a paste call - with the
 * plugin stood in for: its drawing of the SMILES (a MOL block, which cannot say them: no wedge, the run straight and trans), and the double
 * bonds it perceives as left open. Meno's own layout is not stood in for.
 */
let blockOf: (smiles: string) => string = () => "";
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: async () => ({
    request: async (op: string, args: { smiles?: string }) => {
      if (op === "from_smiles") return { molblock: blockOf(args.smiles ?? "") };
      // (the double bonds of the run the plugin cannot read the configuration of, left open)
      return { read: true, elements: openBonds.map((at) => ({ kind: "double", at, state: "unspecified" })) };
    },
  }),
}));
let openBonds: number[] = [];

/** What a plugin makes of a SMILES with an allene or cumulene: the same atoms and bonds, placed flat, the run's handedness gone. */
function pluginBlock(smi: string): string {
  const plain = smi.replace(/\[C@+\]/, "C").replace(/[/\\]/g, "");
  const m = drawnFromSmiles(plain);
  return writeMolfile({ atoms: m.atoms.map(({ id, x, y, el }) => ({ id, x, y, el })), bonds: m.bonds.map(({ id, a, b, order }) => ({ id, a, b, order })) });
}

describe("structureFromSmiles, for a SMILES with an allene's axis or a cumulene's cis or trans", () => {
  blockOf = pluginBlock;

  it("draws the allene with the axis the SMILES says - each handedness its own - and does not say its axis is left open", async () => {
    const { structureFromSmiles } = await import("./fromSmiles");
    const senses: number[] = [];
    for (const smi of ["OC(C)=[C@]=C(Cl)C", "OC(C)=[C@@]=C(Cl)C"]) {
      // (OC(C)=C=C(Cl)C: O1 C2 C3 C4 C5 Cl6 C7 - the allene's double bonds the block's bonds 2 and 3)
      openBonds = [2, 3];
      const drawn = await structureFromSmiles(smi, MENO);
      const d = drawingOf(drawn);
      const axes = readStereo(d.atoms, d.bonds).axes;
      expect(axes, smi).toHaveLength(1);
      senses.push(axes[0].sense);
      expect(drawn.stereoOpen, smi).toBeUndefined();
    }
    expect(senses[0]).toBe(-senses[1]);
  });

  it("draws a butatriene cis where the SMILES says cis and trans where it says trans, and does not say its cis or trans is left open", async () => {
    const { structureFromSmiles } = await import("./fromSmiles");
    for (const [smi, cis] of [["C/C=C=C=C/C", false], ["C/C=C=C=C\\C", true]] as const) {
      openBonds = [1, 2, 3];
      const drawn = await structureFromSmiles(smi, MENO);
      const d = drawingOf(drawn);
      expect(readStereo(d.atoms, d.bonds).cumulated.map((x) => x.cis), smi).toEqual([cis]);
      expect(drawn.stereoOpen, smi).toBeUndefined();
    }
  });

  it("says the run is left open where the plugin's drawing is not of the SMILES's own bonds - nothing is carried, and no hand is drawn", async () => {
    const { structureFromSmiles } = await import("./fromSmiles");
    const real = blockOf;
    // (the same atoms in order, an end's groups joined to the other end's carbon)
    blockOf = (smi) => real(smi).replace("  5  6  1  0", "  2  6  1  0");
    try {
      openBonds = [2, 3];
      const drawn = await structureFromSmiles("OC(C)=[C@]=C(Cl)C", MENO);
      expect(drawn.stereoOpen?.axes).toBe(1);
    } finally {
      blockOf = real;
    }
  });
});
