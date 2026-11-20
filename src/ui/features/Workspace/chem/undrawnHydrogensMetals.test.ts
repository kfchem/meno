/**
 * A phosphine on a metal carries no H, read from SMILES or drawn: its valence step is chosen by its bonds to non-metals (lib/chem/
 * perception/hydrogens `implicitHydrogens`), so PdCl2(PPh3)2's and Grubbs' first catalyst's P stay P(III); a P(V) of four bonds to
 * non-metals, dimethyl phosphite's, carries its H - found in review, the chemistry check's ruling.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import { drawnFromSmiles } from "./testdata/identityCases";
import { undrawnHydrogens } from "./drawing";

const PH3P = "P(c1ccccc1)(c1ccccc1)c1ccccc1";
const CY = "C1CCCCC1";
const COMPLEXES = [`Cl[Pd](Cl)(${PH3P})${PH3P}`, `Cl[Ru](Cl)(=Cc1ccccc1)(P(${CY})(${CY})${CY})P(${CY})(${CY})${CY}`];

describe("a P on a metal carries no H; a P(V) of four bonds to non-metals one", () => {
  it("read from SMILES: every P of PdCl2(PPh3)2 and of Grubbs' first catalyst 0 H; dimethyl phosphite's P 1", () => {
    for (const smiles of COMPLEXES) {
      const g = smilesInput(smiles);
      expect(g.atoms.flatMap((a) => (a.el === "P" ? [a.hs] : [])), smiles).toEqual([0, 0]);
    }
    expect(smilesInput("P(=O)(OC)OC").atoms[0].hs).toBe(1);
  });

  it("drawn: every P of PdCl2(PPh3)2 and of Grubbs' first catalyst 0 H; dimethyl phosphite's P 1", () => {
    for (const smiles of COMPLEXES) {
      const m = drawnFromSmiles(smiles);
      const hs = undrawnHydrogens(m);
      expect(m.atoms.flatMap((a) => (a.el === "P" ? [hs.get(a.id)] : [])), smiles).toEqual([0, 0]);
    }
    const phosphite = drawnFromSmiles("P(=O)(OC)OC");
    expect(undrawnHydrogens(phosphite).get(phosphite.atoms.find((a) => a.el === "P")!.id)).toBe(1);
  }, 60_000);
});
