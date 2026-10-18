import { describe, expect, it } from "vitest";
import { placedAbbreviation } from "../chem/abbreviationPlace";
import { ABBREVIATIONS } from "../chem/abbreviations";
import { LIGANDS } from "../chem/ligands";
import { REAGENTS } from "../chem/reagents";

/**
 * What the dictionary names, each written out as the editor writes a label
 * out - laid out by the engine, as Clean-up lays it out: none of it may
 * throw. A representative set, not the whole dictionary (every label and
 * picture, and complexes put together from its ligands, take minutes): its
 * groups; its complexes; and each ligand bound by two donors or more set on
 * a metal beside a cod, the metal in the ligand's ring (Rh(cod)(acac) threw).
 */
describe("the dictionary's structures", () => {
  const written = (label: string, attached: boolean) => {
    let error = "";
    let read = false;
    try {
      read = !!placedAbbreviation(label, attached ? { x: -1, y: 0 } : null, 1);
    } catch (e) {
      error = String(e);
    }
    return { label, read, error };
  };

  it("are laid out without throwing: the groups, the complexes, and a tub beside each chelating ligand", () => {
    const tried = [
      ...ABBREVIATIONS.map((a) => written(a.label, true)),
      // (Stryker's reagent, the cluster, has its own tests and takes many seconds)
      ...REAGENTS.filter((r) => r.complex && r.label !== "Stryker's reagent").map((r) => written(r.label, false)),
      // (DTBM-SEGPHOS is SEGPHOS's chelate with larger aryls: many seconds more for nothing new)
      ...LIGANDS.filter((l) => /:2\]/.test(l.smiles) && l.label !== "DTBM-SEGPHOS").map((l) => written(`Rh(cod)(${l.label})`, false)),
      written("[Rh(cod)(dppe)]BF4", false),
      written("Ir(cod)(acac)", false),
    ];
    expect(tried.filter((t) => t.error)).toEqual([]);
    expect(tried.filter((t) => !t.read).map((t) => t.label)).toEqual([]);
    expect(tried.length).toBeGreaterThan(140);
    // (about 10 s here; slower on CI's runners)
  }, 60_000);
});
