import { describe, expect, it } from "vitest";
import { readSmiles } from "../../../../lib/chem/smiles";
import { readStereo } from "../../../../lib/layout/drawn";
import { MENO } from "../../../../lib/chem/style";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import type { Model } from "../store/types";
import { laidOut } from "./cleanUp";
import { drawingOf } from "./drawing";
import { givenRunsOf, specified } from "./fromSmiles";
import { stereoGraphOf } from "../../../../lib/chem/stereoOpen";

/**
 * A SMILES's allene axis and odd cumulene's cis or trans through the plugin's hop (a MOL block cannot say them): the drawing a plugin gives,
 * laid out with what the SMILES's own reading gives, says them as the SMILES does - SMILES, drawing, marks.
 */

/** The plugin's drawing of a structure as it cannot say its allene or cumulene: the atoms and bonds as they are, no wedge, the run drawn straight and trans. */
const pluginDrawing = (smiles: string): Model => {
  const m = drawnFromSmiles(smiles.replace(/\[C@+\]/, "C").replace(/\//g, "").replace(/\\/g, ""));
  return { ...m, bonds: m.bonds.map(({ stereo: _s, narrow: _n, display: _d, ...b }) => b) as Model["bonds"] };
};

const own = (smiles: string) => readSmiles(smiles);
const given = (smiles: string) => ({ axes: own(smiles).axes ?? [], cumulated: own(smiles).cumulated ?? [] });

describe("a SMILES's allene axis, through a plugin's drawing", () => {
  it("is drawn with the wedge that says it, and read from the drawing as the SMILES gives it: each handedness its own, the two different", async () => {
    const senses = [];
    for (const smi of ["OC(C)=[C@]=C(Cl)C", "OC(C)=[C@@]=C(Cl)C"]) {
      const g = given(smi);
      expect(g.axes).toHaveLength(1);
      const model = await laidOut(pluginDrawing(smi), MENO, g);
      const d = drawingOf(model);
      const read = readStereo(d.atoms, d.bonds).axes;
      expect(read, smi).toHaveLength(1);
      senses.push(read[0].sense);
      // (and the drawing is the one the engine draws from the SMILES itself)
      const direct = drawingOf(drawnFromSmiles(smi));
      expect(readStereo(direct.atoms, direct.bonds).axes[0].sense).toBe(read[0].sense);
    }
    expect(senses[0]).toBe(-senses[1]);
  });

  it("is lost where nothing is given (the drawing a plugin makes says none)", async () => {
    const model = await laidOut(pluginDrawing("OC(C)=[C@]=C(Cl)C"), MENO);
    const d = drawingOf(model);
    expect(readStereo(d.atoms, d.bonds).axes).toHaveLength(0);
  });
});

describe("a SMILES's butatriene, through a plugin's drawing", () => {
  it("is drawn cis where the SMILES says cis, and trans where it says trans - one cis or trans for the run, none for each of its bonds", async () => {
    for (const [smi, cis] of [["C/C=C=C=C/C", false], ["C/C=C=C=C\\C", true]] as const) {
      const g = given(smi);
      expect(g.cumulated).toHaveLength(1);
      expect(g.cumulated[0].cis).toBe(cis);
      const model = await laidOut(pluginDrawing(smi), MENO, g);
      const d = drawingOf(model);
      const read = readStereo(d.atoms, d.bonds);
      expect(read.cumulated.map((x) => x.cis), smi).toEqual([cis]);
      expect(read.cisTrans.size).toBe(0);
    }
  });
});

/** A MOL block of the atoms and bonds given, with no coordinates of any use: what a plugin gives a SMILES whose allene it cannot say. */
function molblock(elements: string[], bonds: [number, number, number][]): string {
  const atoms = elements.map((el) => `    0.0000    0.0000    0.0000 ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  const bs = bonds.map(([a, b, o]) => `${String(a).padStart(3)}${String(b).padStart(3)}${String(o).padStart(3)}  0`);
  return ["", "", "", `${String(elements.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bs, "M  END"].join("\n");
}

describe("what the plugin leaves open of a run the SMILES gives", () => {
  // OC(C)=[C@]=C(Cl)C: O1 C2 C3 C4 C5 Cl6 C7, C2=C4 and C4=C5 the allene
  const block = molblock(["O", "C", "C", "C", "C", "Cl", "C"], [[1, 2, 1], [2, 3, 1], [2, 4, 2], [4, 5, 2], [5, 6, 1], [5, 7, 1]]);

  it("are the double bonds of the allene the SMILES gives its axis: both, from one end to the other", () => {
    const g = givenRunsOf("OC(C)=[C@]=C(Cl)C", block);
    expect(g?.runs.axes).toHaveLength(1);
    expect(g?.bonds.sort()).toEqual([2, 3]);
  });

  it("are none where the plugin's atoms are not the SMILES's, or the SMILES gives none", () => {
    expect(givenRunsOf("OC(C)=[C@]=C(Cl)C", molblock(["O", "C", "C"], [[1, 2, 1]]))).toBeNull();
    expect(givenRunsOf("OC(C)=[C@]=C(Cl)C", block.replace(" Cl", " Br"))).toBeNull();
    expect(givenRunsOf("OC(C)=C=C(Cl)C", block)).toBeNull();
  });

  it("are none where the block's atoms are the SMILES's elements in order but its bonds are not: no hand is drawn that was not read", () => {
    // (the same seven atoms, the allene's ends' groups joined otherwise: the Cl and the methyl on the other end's carbon)
    const other = molblock(["O", "C", "C", "C", "C", "Cl", "C"], [[1, 2, 1], [2, 3, 1], [2, 4, 2], [4, 5, 2], [2, 6, 1], [5, 7, 1]]);
    expect(givenRunsOf("OC(C)=[C@]=C(Cl)C", other)).toBeNull();
    // (the SMILES's bonds and one more, between two atoms it does not join - the Cl and the last methyl: sorted last, so only the count says it)
    const extra = molblock(["O", "C", "C", "C", "C", "Cl", "C"], [[1, 2, 1], [2, 3, 1], [2, 4, 2], [4, 5, 2], [5, 6, 1], [5, 7, 1], [6, 7, 1]]);
    expect(givenRunsOf("OC(C)=[C@]=C(Cl)C", extra)).toBeNull();
    // (the same bonds, one a Kekule form's other order: still the structure)
    const kekule = molblock(["O", "C", "C", "C", "C", "Cl", "C"], [[1, 2, 1], [2, 3, 1], [2, 4, 2], [4, 5, 2], [5, 6, 1], [5, 7, 1]]);
    expect(givenRunsOf("OC(C)=[C@]=C(Cl)C", kekule)).not.toBeNull();
  });

  it("are no longer open once given: the axis the plugin left open is not said not specified", () => {
    const graph = stereoGraphOf([block])!;
    const open = { atoms: [], bonds: [2, 3], cumulenes: [2, 3], cumulated: [[2, 3]], notEnumerated: [], said: null };
    const left = specified(open, givenRunsOf("OC(C)=[C@]=C(Cl)C", block)!.bonds, block);
    expect(left.bonds).toEqual([]);
    expect(left.cumulated).toEqual([]);
    expect(graph.bonds).toHaveLength(6);
  });
});
