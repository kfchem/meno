import { describe, expect, it } from "vitest";
import { ABBREVIATIONS } from "./abbreviations";
import { aromaticRefusal, kekulized } from "./kekulize";
import { COUNTER_IONS, LIGANDS } from "./ligands";
import { REAGENTS } from "./reagents";
import { readSmiles } from "./smiles";
import { typedRingRefused } from "./smilesWhy";
import { smilesInput } from "../layout/smilesInput";

/** A SMILES's aromatic ring refused as typed - its ring's atoms by place - or none. */
const refused = (smiles: string) => {
  const r = readSmiles(smiles);
  return aromaticRefusal(r.atoms, r.bonds);
};

describe("an aromatic SMILES that cannot be given single and double bonds as written", () => {
  it("is refused as typed, its ring named - an H nobody wrote never added in silence", () => {
    // (cyclopentadiene's ring written aromatic: its fifth carbon has no double bond - read so, an H was added)
    expect(refused("c1cccc1")).toEqual([0, 1, 2, 3, 4]);
    // (pyrrole without its [nH]: the n would carry an H nobody wrote)
    expect(refused("c1ccnc1")).toEqual([0, 1, 2, 3, 4]);
    // (imidazole without its [nH]: which n carries it is not written - refused too)
    expect(refused("c1cncn1")).toEqual([0, 1, 2, 3, 4]);
    // (only the ring at fault named: a phenyl beside it is not)
    expect(refused("c1ccccc1-c1cccc1")).toEqual([6, 7, 8, 9, 10]);
    expect(typedRingRefused([0, 1, 2, 3, 4])).toBe("its aromatic ring of 5 atoms (1, 2, 3, 4 and 5) cannot have alternating double bonds: is a charge or an H missing?");
  });

  it("is read as written where it can be: every H and charge it needs written", () => {
    for (const smiles of ["c1ccccc1", "c1ccncc1", "c1cc[nH]c1", "c1cc[cH-]c1", "c1ccoc1", "c1ccsc1", "c1cnc[nH]1", "c1ccc2ccccc2c1", "C[n+]1ccccc1", "c1cc[o+]cc1", "O=c1cc[nH]cc1", "c1ccc2[nH]ccc2c1"]) expect(refused(smiles), smiles).toBeNull();
  });

  it("is still read leniently from a file's aromatic bonds - the atoms left without their double bond said, the orders as before", () => {
    // (as a MOL file's bond type 4 gives c1ccnc1: the n read as an N-H, and named left)
    const r = readSmiles("c1ccnc1");
    const k = kekulized(r.atoms, r.bonds);
    expect(k.left).toEqual([3]);
    expect(k.orders.filter((o) => o === 2)).toHaveLength(2);
    // (an imidazole's: Meno's choice of which n, as before - and left, as typed input would be refused)
    const im = readSmiles("c1cncn1");
    expect(kekulized(im.atoms, im.bonds)).toMatchObject({ hChosen: [4], left: [4] });
  });

  it("is refused where Meno lays a typed SMILES out, in smilesWhy's words", () => {
    expect(() => smilesInput("c1cccc1")).toThrow("This SMILES could not be read: its aromatic ring of 5 atoms (1, 2, 3, 4 and 5) cannot have alternating double bonds: is a charge or an H missing?");
    expect(() => smilesInput("c1ccccc1")).not.toThrow();
  });
});

describe("Meno's own tables", () => {
  it("hold no SMILES that would now be refused: every abbreviation, reagent, ligand and counter-ion", () => {
    const tables: [string, string][] = [
      ...ABBREVIATIONS.map((a): [string, string] => [`abbreviation ${a.label}`, a.smiles]),
      ...REAGENTS.flatMap((r): [string, string][] => (r.smiles ? [[`reagent ${r.label}`, r.smiles]] : [])),
      ...LIGANDS.map((l): [string, string] => [`ligand ${l.label}`, l.smiles]),
      ...Object.entries(COUNTER_IONS).map(([label, c]): [string, string] => [`counter-ion ${label}`, c.smiles]),
    ];
    expect(tables.length).toBeGreaterThan(300);
    const now = tables.flatMap(([what, smiles]) => {
      let r;
      try {
        r = readSmiles(smiles);
      } catch {
        return [];
      }
      return aromaticRefusal(r.atoms, r.bonds) ? [`${what}: ${smiles}`] : [];
    });
    expect(now).toEqual([]);
  });
});
