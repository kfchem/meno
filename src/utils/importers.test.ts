import { describe, expect, it } from "vitest";
import {
  parseRXNGroups,
  readMoleculesFromText,
  buildEditorModelFromRXN,
  moleculesToEditorModel,
} from "./importers";
import { NOMINAL_BOND_LENGTH } from "../lib/chem/acs";
import { layoutMolecule } from "../lib/chem/layout2d";
import { layoutOptionsFor, MENO } from "../lib/chem/style";
import sampleSdf from "../samples/cholesterol.sdf?raw";
import sampleRxn from "../samples/diels-alder.rxn?raw";
import sampleRxn2 from "../samples/esterification.rxn?raw";

// Ethane (CH3-CH3) as a V2000 molfile. The title line is a bare number, as in
// PubChem SDF downloads where it holds the compound id.
const numericTitleMol = [
  "6324",
  "  -OEChem-09162612002D",
  "",
  "  2  1  0     0  0  0  0  0  0999 V2000",
  "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  1  0  0  0  0",
  "M  END",
].join("\n");

describe("readMoleculesFromText", () => {
  it("parses a numeric-title molfile as a molfile", () => {
    const mols = readMoleculesFromText(numericTitleMol, "sdf");
    expect(mols).toHaveLength(1);
    expect(mols[0].atoms.map((a) => a.el)).toEqual(["C", "C"]);
    expect(mols[0].bonds).toEqual([
      { a1: 0, a2: 1, order: 1 },
    ]);
  });

  it("parses the SDF sample", () => {
    const mols = readMoleculesFromText(sampleSdf, "sdf");
    expect(mols).toHaveLength(1);
    expect(mols[0].atoms).toHaveLength(28);
    expect(mols[0].bonds).toHaveLength(31);
  });
});

/** A V2000 block: atoms as [x, y, element], bonds as [from, to, order], 1-based. */
function molBlock(name: string, atoms: [number, number, string][], bonds: [number, number, number][]): string[] {
  const n = (v: number) => v.toFixed(4).padStart(10);
  return [
    name,
    "  Meno",
    "",
    `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([x, y, el]) => `${n(x)}${n(y)}${n(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([a, b, o]) => `${String(a).padStart(3)}${String(b).padStart(3)}${String(o).padStart(3)}  0`),
    "M  END",
  ];
}

// Acetic acid and ethanol to ethyl acetate and water: each reactant ends in
// an OH on its right, the side the arrow is on.
const c = 1.299;
const esterification = [
  "$RXN",
  "Fischer esterification",
  "  Meno",
  "",
  "  2  2",
  "$MOL",
  ...molBlock("acetic acid", [[0, 0, "C"], [c, 0.75, "C"], [c, 2.25, "O"], [2 * c, 0, "O"]], [[1, 2, 1], [2, 3, 2], [2, 4, 1]]),
  "$MOL",
  ...molBlock("ethanol", [[0, 0, "C"], [c, 0.75, "C"], [2 * c, 0, "O"]], [[1, 2, 1], [2, 3, 1]]),
  "$MOL",
  ...molBlock(
    "ethyl acetate",
    [[0, 0, "C"], [c, 0.75, "C"], [c, 2.25, "O"], [2 * c, 0, "O"], [3 * c, 0.75, "C"], [4 * c, 0, "C"]],
    [[1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1], [5, 6, 1]],
  ),
  "$MOL",
  ...molBlock("water", [[0, 0, "O"]], []),
].join("\n");

describe("a large drawing on import", () => {
  it("reads a 2D file of 130 000 atoms, more than one call's arguments can be", () => {
    // (a chain, in V3000: where the importer spread a record's atoms into
    // one push, a record this large threw - in a worker of WebKit's, past
    // about 48 000 atoms)
    const n = 130_000;
    const lines = ["chain", "  Meno            2D", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB", `M  V30 COUNTS ${n} ${n - 1} 0 0 0`, "M  V30 BEGIN ATOM"];
    for (let i = 1; i <= n; i++) lines.push(`M  V30 ${i} C ${(i * 0.866).toFixed(4)} ${i % 2 ? "0.5000" : "0.0000"} 0 0`);
    lines.push("M  V30 END ATOM", "M  V30 BEGIN BOND");
    for (let i = 1; i < n; i++) lines.push(`M  V30 ${i} 1 ${i} ${i + 1}`);
    lines.push("M  V30 END BOND", "M  V30 END CTAB", "M  END", "");
    const { model } = moleculesToEditorModel(readMoleculesFromText(lines.join("\n"), "mol"));
    expect(model.atoms).toHaveLength(n);
    expect(model.bonds).toHaveLength(n - 1);
    expect(new Set(model.atoms.map((a) => a.id)).size).toBe(n);
  }, 60_000);
});

describe("parseRXNGroups", () => {
  it("splits the RXN samples by their counts line", () => {
    const g1 = parseRXNGroups(sampleRxn);
    expect([g1.reactants.length, g1.products.length, g1.agents.length]).toEqual(
      [2, 1, 0]
    );
    const g2 = parseRXNGroups(sampleRxn2);
    expect([g2.reactants.length, g2.products.length, g2.agents.length]).toEqual(
      [2, 2, 0]
    );
  });

  it("reads counts from line 5 even if the reaction name contains numbers", () => {
    const mol = numericTitleMol.split("\n").slice(1).join("\n");
    const rxn = [
      "$RXN",
      "step 1 of 2",
      "  -INDIGO- 0704251239",
      "",
      "  2  1",
      "$MOL",
      "A",
      mol,
      "$MOL",
      "B",
      mol,
      "$MOL",
      "C",
      mol,
    ].join("\n");
    const g = parseRXNGroups(rxn);
    expect([g.reactants.length, g.products.length]).toEqual([2, 1]);
  });

  it("keeps the arrow and each structure clear of one another, labels and all", () => {
    const { model, arrow } = buildEditorModelFromRXN(esterification);
    expect(arrow).not.toBeNull();
    const L = NOMINAL_BOND_LENGTH;
    // each structure's atoms, as the RXN listed them, and how far it reaches as drawn
    const sizes = [4, 3, 6, 1];
    const drawn = sizes.map((size, k) => {
      const from = sizes.slice(0, k).reduce((s, v) => s + v, 0);
      const atoms = model.atoms.slice(from, from + size);
      const ids = new Set(atoms.map((a) => a.id));
      const index = new Map(atoms.map((a, i) => [a.id, i]));
      const bonds = model.bonds
        .filter((b) => ids.has(b.a) && ids.has(b.b))
        .map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order }));
      const opts = layoutOptionsFor(MENO, L, { units: "world" });
      return layoutMolecule(atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el })), bonds, opts, 50).bounds;
    });
    const [acid, ethanol, ester, water] = drawn;
    // ethanol's OH, the last thing before the arrow, half a bond clear of it
    expect(arrow!.x1 - ethanol.max.x).toBeGreaterThan(L / 2 - 1e-6);
    // and the product after it the same
    expect(ester.min.x - arrow!.x2).toBeGreaterThan(L / 2 - 1e-6);
    // a bond between two structures on one side, for a "+"
    expect(ethanol.min.x - acid.max.x).toBeGreaterThan(L - 1e-6);
    expect(water.min.x - ester.max.x).toBeGreaterThan(L - 1e-6);
  });

  it("lays out reactants left of the arrow and products right of it", () => {
    const { model, arrow } = buildEditorModelFromRXN(sampleRxn2);
    expect(arrow).not.toBeNull();
    expect(model.atoms.length).toBeGreaterThan(0);
    const ids = new Set(model.atoms.map((a) => a.id));
    for (const b of model.bonds) {
      expect(ids.has(b.a)).toBe(true);
      expect(ids.has(b.b)).toBe(true);
    }
  });
});

// Pyridine with its ring bonds marked aromatic (MDL bond type 4), as some
// programs write it, rather than as alternating single and double bonds.
const aromaticPyridine = [
  "pyridine",
  "  aromatic bonds",
  "",
  "  6  6  0     0  0  0  0  0  0999 V2000",
  "    1.2990    0.7500    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.0000   -1.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -1.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.0000    1.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  4  0  0  0  0",
  "  2  3  4  0  0  0  0",
  "  3  4  4  0  0  0  0",
  "  4  5  4  0  0  0  0",
  "  5  6  4  0  0  0  0",
  "  6  1  4  0  0  0  0",
  "M  END",
].join("\n");

describe("aromatic bonds on import", () => {
  it("come in as a Kekulé ring, not as triple bonds", () => {
    const { model } = moleculesToEditorModel(
      readMoleculesFromText(aromaticPyridine, "mol"),
    );
    const orders = model.bonds.map((b) => b.order);
    expect(orders).not.toContain(3);
    expect(orders.filter((o) => o === 2)).toHaveLength(3);
    // every ring atom, the N included, carries one of them
    for (const a of model.atoms) {
      const doubles = model.bonds.filter(
        (b) => b.order === 2 && (b.a === a.id || b.b === a.id),
      );
      expect(doubles).toHaveLength(1);
    }
  });
});

describe("coordination bonds on import", () => {
  it("come in as dative single bonds, from the first atom to the second", () => {
    // ammonia borane, H3N->BH3, with the MOL bond type for a coordination bond
    const mol = [
      "",
      "  test",
      "",
      "  2  1  0     0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  9  0  0  0  0",
      "M  END",
    ].join("\n");
    const { model } = moleculesToEditorModel(readMoleculesFromText(mol, "mol"));
    expect(model.bonds).toHaveLength(1);
    const [b] = model.bonds;
    expect(b.order).toBe(1);
    expect(b.dative).toBe(true);
    const n = model.atoms.find((a) => a.el === "N")!;
    expect(b.a).toBe(n.id);
  });
});
