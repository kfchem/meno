import { describe, expect, it } from "vitest";
import { isComponentId, readComponent } from "./ccd";

// A component made up for the test, written as the dictionary's files are:
// its atoms, a name with a prime quoted, the bond orders in capitals, and a
// charge; a text field among its items.
const ZZA = `data_ZZA
#
_chem_comp.id          ZZA
_chem_comp.name
;made-up acid anion
;
_chem_comp.type        NON-POLYMER
#
loop_
_chem_comp_atom.comp_id
_chem_comp_atom.atom_id
_chem_comp_atom.type_symbol
_chem_comp_atom.charge
_chem_comp_atom.pdbx_aromatic_flag
ZZA C1   C  0 N
ZZA O1   O  0 N
ZZA "O2'" O -1 N
ZZA CL1  CL ? N
#
loop_
_chem_comp_bond.comp_id
_chem_comp_bond.atom_id_1
_chem_comp_bond.atom_id_2
_chem_comp_bond.value_order
_chem_comp_bond.pdbx_aromatic_flag
ZZA C1 O1    DOUB N
ZZA C1 "O2'" SING N
ZZA C1 CL1   ?    N
`;

describe("a chemical component, as the dictionary's file defines it", () => {
  it("has its atoms by name, element and charge, and its bonds' orders", () => {
    expect(readComponent(ZZA)).toEqual({
      id: "ZZA",
      atoms: [
        { name: "C1", element: "C", charge: 0 },
        { name: "O1", element: "O", charge: 0 },
        { name: "O2'", element: "O", charge: -1 },
        // (an element as Meno writes it; no charge given, none)
        { name: "CL1", element: "Cl", charge: 0 },
      ],
      bonds: [
        { a: "C1", b: "O1", order: 2 },
        { a: "C1", b: "O2'", order: 1 },
        // (no order given: single, the dictionary's default)
        { a: "C1", b: "CL1", order: 1 },
      ],
    });
  });

  it("keeps an aromatic or delocalised bond as none of single, double and triple", () => {
    expect(readComponent(ZZA.replace("DOUB", "AROM"))!.bonds[0].order).toBeNull();
  });

  it("is named as the dictionary names components", () => {
    expect(["BTN", "HOH", "A1AB2", "ZN"].every(isComponentId)).toBe(true);
    expect(["", "btn", "ABCDEF", "A B"].some(isComponentId)).toBe(false);
  });
});
