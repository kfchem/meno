// The atoms the menu offers R/S on, of cage structures, every assignment of @ and @@: each cage bridgehead offered where the CIP labels it as drawn, none where it says alike or nothing is drawn (quinuclidin-3-ol's C4 and N).
import { describe, expect, it } from "vitest";
import { candidatesDrawn } from "./candidatesDrawn";
import { drawnFromSmiles } from "./testdata/identityCases";

/** [SMILES, its atoms offered, by element and place among the atoms]. */
const OFFERED: [string, string][] = [
  ["O[C@H]1C[C@H]2CC[C@H]1CC2", "C1,C3,C6"],
  ["O[C@@H]1C[C@H]2CC[C@H]1CC2", "C1,C3,C6"],
  ["O[C@H]1C[C@@H]2CC[C@H]1CC2", "C1,C3,C6"],
  ["O[C@@H]1C[C@@H]2CC[C@H]1CC2", "C1,C3,C6"],
  ["O[C@H]1C[C@H]2CC[C@@H]1CC2", "C1,C3,C6"],
  ["O[C@@H]1C[C@H]2CC[C@@H]1CC2", "C1,C3,C6"],
  ["O[C@H]1C[C@@H]2CC[C@@H]1CC2", "C1,C3,C6"],
  ["O[C@@H]1C[C@@H]2CC[C@@H]1CC2", "C1,C3,C6"],
  ["O[C@H]1CN2CC[C@H]1CC2", "C1"],
  ["O[C@@H]1CN2CC[C@H]1CC2", "C1"],
  ["O[C@H]1CN2CC[C@@H]1CC2", "C1"],
  ["O[C@@H]1CN2CC[C@@H]1CC2", "C1"],
  ["O[C@H]1[C@H](O)[C@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@H](O)[C@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@@H](O)[C@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@@H](O)[C@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@H](O)[C@@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@H](O)[C@@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@@H](O)[C@@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@@H](O)[C@@H]2CC[C@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@H](O)[C@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@H](O)[C@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@@H](O)[C@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@@H](O)[C@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@H](O)[C@@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@H](O)[C@@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@@H](O)[C@@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@@H]1[C@@H](O)[C@@H]2CC[C@@H]1CC2", "C1,C2,C4,C7"],
  ["O[C@H]1[C@H]2CCC[C@H]1CCC2", "C2,C6"],
  ["O[C@@H]1[C@H]2CCC[C@H]1CCC2", "C2,C6"],
  ["O[C@H]1[C@@H]2CCC[C@H]1CCC2", "C2,C6"],
  ["O[C@@H]1[C@@H]2CCC[C@H]1CCC2", "C2,C6"],
  ["O[C@H]1[C@H]2CCC[C@@H]1CCC2", "C2,C6"],
  ["O[C@@H]1[C@H]2CCC[C@@H]1CCC2", "C2,C6"],
  ["O[C@H]1[C@@H]2CCC[C@@H]1CCC2", "C2,C6"],
  ["O[C@@H]1[C@@H]2CCC[C@@H]1CCC2", "C2,C6"],
  ["O1C[C@H]2CC[C@H]1CC2", "C2,C5"],
  ["O1C[C@@H]2CC[C@H]1CC2", "C2,C5"],
  ["O1C[C@H]2CC[C@@H]1CC2", "C2,C5"],
  ["O1C[C@@H]2CC[C@@H]1CC2", "C2,C5"],
  ["[C@H]12OC[C@H](CO1)CC2", "C0,C3"],
  ["[C@@H]12OC[C@H](CO1)CC2", "C0,C3"],
  ["[C@H]12OC[C@@H](CO1)CC2", "C0,C3"],
  ["[C@@H]12OC[C@@H](CO1)CC2", "C0,C3"],
];

describe("a cage's bridgehead is offered on the menu, whatever identity's turning says (found in review)", () => {
  it("every structure of the cage families: the atoms offered", () => {
    const wrong = OFFERED.filter(([smiles, said]) => {
      const m = drawnFromSmiles(smiles);
      const ask = candidatesDrawn(m);
      return m.atoms.flatMap((a, i) => (ask.atom(a.id) ? [`${a.el}${i}`] : [])).join(",") !== said;
    }).map(([smiles]) => smiles);
    expect(wrong).toEqual([]);
  }, 300_000);
});
