import { describe, expect, it } from "vitest";
import { readSmiles } from "./smiles";
import { protonated, protonationSites, startingForms, chargesFor, type ProtonAtom, type ProtonBond, type Site } from "./protonation";

// Each molecule written as a Kekulé SMILES and read without its hydrogens -
// a skeleton whose orders and charges are known - and each form's molecule
// told by its formula and charge, the known answer.

function skeleton(smiles: string): { atoms: ProtonAtom[]; bonds: ProtonBond[] } {
  const s = readSmiles(smiles);
  return { atoms: s.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), bonds: s.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })) };
}

const label = (atoms: readonly ProtonAtom[]) => (i: number) => `${atoms[i].el}${i + 1}`;

/** A molecule's formula in Hill's order, with its charge: C2H3O2−. */
function formulaOf(atoms: readonly ProtonAtom[], charges: readonly number[], hydrogens: readonly number[]): string {
  const n = new Map<string, number>();
  atoms.forEach((a, i) => {
    n.set(a.el, (n.get(a.el) ?? 0) + 1);
    if (hydrogens[i]) n.set("H", (n.get("H") ?? 0) + hydrogens[i]);
  });
  const els = [...n.keys()].sort((p, q) => (p === "C" ? -1 : q === "C" ? 1 : p === "H" ? -1 : q === "H" ? 1 : p.localeCompare(q)));
  const charge = charges.reduce((s, c) => s + c, 0);
  const sign = charge === 0 ? "" : `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "−"}`;
  return els.map((e) => `${e}${n.get(e)! > 1 ? n.get(e) : ""}`).join("") + sign;
}

/** Each form of the one site of a molecule: its name, where its hydrogens are, and the formula and charge of the molecule in it. */
function formsOf(smiles: string, kind: Site["kind"]): { name: string; where: string; formula: string }[] {
  const { atoms, bonds } = skeleton(smiles);
  const sites = protonationSites(atoms, bonds, label(atoms));
  expect(sites.map((s) => s.kind)).toEqual([kind]);
  return sites[0].forms.map((_, k) => {
    const r = protonated(atoms, bonds, sites, { forms: [k], charges: new Map() });
    if ("why" in r) throw new Error(r.why);
    // (the bonds as they are then: every atom's valence met by its bonds and its hydrogens)
    return { name: sites[0].forms[k].name, where: sites[0].forms[k].where, formula: formulaOf(atoms, r.charges, r.hydrogens) };
  });
}

describe("each site in each of its forms, by the formula and charge of the molecule in it", () => {
  it("a carboxylic acid, its hydrogen on either oxygen, and its anion", () => {
    expect(formsOf("CC(=O)O", "carboxyl")).toEqual([
      { name: "Carboxylic acid", where: "H on O3", formula: "C2H4O2" },
      { name: "Carboxylic acid", where: "H on O4", formula: "C2H4O2" },
      { name: "Carboxylate", where: "no H", formula: "C2H3O2−" },
    ]);
  });

  it("an amine and its ammonium", () => {
    expect(formsOf("CN", "amine")).toEqual([
      { name: "Ammonium", where: "3 H on N2", formula: "CH6N+" },
      { name: "Amine", where: "2 H on N2", formula: "CH5N" },
    ]);
  });

  it("a ring nitrogen and its pyridinium", () => {
    expect(formsOf("C1=CC=NC=C1", "ring nitrogen")).toEqual([
      { name: "Pyridinium", where: "H on N4", formula: "C5H6N+" },
      { name: "Pyridine", where: "no H", formula: "C5H5N" },
    ]);
  });

  it("imidazole: its hydrogen on one nitrogen or the other, each a form; its cation and its anion", () => {
    expect(formsOf("C1=CN=CN1", "azole")).toEqual([
      { name: "Imidazolium", where: "H on N3, H on N5", formula: "C3H5N2+" },
      { name: "Imidazole", where: "H on N3", formula: "C3H4N2" },
      { name: "Imidazole", where: "H on N5", formula: "C3H4N2" },
      { name: "Imidazolate", where: "no H", formula: "C3H3N2−" },
    ]);
  });

  it("an amidine's two tautomers and its amidinium", () => {
    expect(formsOf("CC(=N)N", "amidine")).toEqual([
      { name: "Amidinium", where: "2 H on N3, 2 H on N4", formula: "C2H7N2+" },
      { name: "Amidine", where: "2 H on N3, H on N4", formula: "C2H6N2" },
      { name: "Amidine", where: "H on N3, 2 H on N4", formula: "C2H6N2" },
    ]);
  });

  it("a guanidine's three tautomers and its guanidinium", () => {
    expect(formsOf("NC(=N)N", "guanidine")).toEqual([
      { name: "Guanidinium", where: "2 H on N1, 2 H on N3, 2 H on N4", formula: "CH6N3+" },
      { name: "Guanidine", where: "2 H on N1, 2 H on N3, H on N4", formula: "CH5N3" },
      { name: "Guanidine", where: "2 H on N1, H on N3, 2 H on N4", formula: "CH5N3" },
      { name: "Guanidine", where: "H on N1, 2 H on N3, 2 H on N4", formula: "CH5N3" },
    ]);
  });

  it("2-pyridone and 2-hydroxypyridine, each a form; its cation and its anion", () => {
    expect(formsOf("O=C1NC=CC=C1", "lactam")).toEqual([
      { name: "Protonated", where: "H on O1, H on N3", formula: "C5H6NO+" },
      { name: "Lactim", where: "H on O1", formula: "C5H5NO" },
      { name: "Lactam", where: "H on N3", formula: "C5H5NO" },
      { name: "Deprotonated", where: "no H", formula: "C5H4NO−" },
    ]);
  });

  it("a phosphate monoester: no hydrogen, one on any of its three oxygens, or two", () => {
    const forms = formsOf("COP(=O)(O)O", "phosphate");
    expect(forms.map((f) => f.formula)).toEqual(["CH5O4P", "CH5O4P", "CH5O4P", "CH4O4P−", "CH4O4P−", "CH4O4P−", "CH3O4P2−"]);
    expect(forms.slice(3, 6).map((f) => f.where)).toEqual(["H on O4", "H on O5", "H on O6"]);
  });

  it("a sulfonic acid, its hydrogen on any of its three oxygens, and its anion", () => {
    const forms = formsOf("CS(=O)(=O)O", "sulfonate");
    expect(forms.map((f) => [f.name, f.formula])).toEqual([
      ["Sulfonic acid", "CH4O3S"],
      ["Sulfonic acid", "CH4O3S"],
      ["Sulfonic acid", "CH4O3S"],
      ["Sulfonate", "CH3O3S−"],
    ]);
  });

  it("a phenol and its phenolate; a thiol and its thiolate", () => {
    expect(formsOf("OC1=CC=CC=C1", "phenol").map((f) => [f.name, f.formula])).toEqual([
      ["Phenol", "C6H6O"],
      ["Phenolate", "C6H5O−"],
    ]);
    expect(formsOf("CS", "thiol").map((f) => [f.name, f.formula])).toEqual([
      ["Thiol", "CH4S"],
      ["Thiolate", "CH3S−"],
    ]);
  });
});

describe("the bonds follow the form", () => {
  it("imidazolium's and each imidazole's double bonds where their hydrogens leave room for them", () => {
    const { atoms, bonds } = skeleton("C1=CN=CN1");
    const sites = protonationSites(atoms, bonds, label(atoms));
    const doubles = (k: number) => {
      const r = protonated(atoms, bonds, sites, { forms: [k], charges: new Map() });
      if ("why" in r) throw new Error(r.why);
      return bonds.flatMap((b, j) => (r.orders[j] === 2 ? [`${b.a1 + 1}-${b.a2 + 1}`] : [])).sort();
    };
    // (H on N3: C4=N5 and C1=C2; H on N5: N3=C4 and C1=C2)
    expect(doubles(1)).toEqual(["1-2", "4-5"]);
    expect(doubles(2)).toEqual(["1-2", "3-4"]);
    // (imidazolium: one C=N, the nitrogen at its end charged)
    const r = protonated(atoms, bonds, sites, { forms: [0], charges: new Map() });
    if ("why" in r) throw new Error(r.why);
    expect(r.charges.filter((c) => c === 1)).toHaveLength(1);
  });

  it("a carboxylate's one C=O; the acid's on the oxygen without the hydrogen", () => {
    const { atoms, bonds } = skeleton("CC(=O)O");
    const sites = protonationSites(atoms, bonds, label(atoms));
    const drawn = (k: number) => {
      const r = protonated(atoms, bonds, sites, { forms: [k], charges: new Map() });
      if ("why" in r) throw new Error(r.why);
      // (each oxygen's bond to the carbon, its charge and its hydrogens)
      return [2, 3].map((o) => [r.orders[bonds.findIndex((b) => b.a2 === o)], r.charges[o], r.hydrogens[o]]);
    };
    expect(drawn(0)).toEqual([
      [1, 0, 1],
      [2, 0, 0],
    ]);
    expect(drawn(1)).toEqual([
      [2, 0, 0],
      [1, 0, 1],
    ]);
    expect(drawn(2)).toEqual([
      [1, -1, 0],
      [2, 0, 0],
    ]);
  });

  it("glycine as its zwitterion: ammonium and carboxylate together", () => {
    const { atoms, bonds } = skeleton("NCC(=O)O");
    const sites = protonationSites(atoms, bonds, label(atoms));
    expect(sites.map((s) => s.kind)).toEqual(["carboxyl", "amine"]);
    const carboxylate = sites[0].forms.findIndex((f) => f.name === "Carboxylate");
    const ammonium = sites[1].forms.findIndex((f) => f.name === "Ammonium");
    const r = protonated(atoms, bonds, sites, { forms: [carboxylate, ammonium], charges: new Map() });
    if ("why" in r) throw new Error(r.why);
    expect(formulaOf(atoms, r.charges, r.hydrogens)).toBe("C2H5NO2");
  });
});

describe("what is not a site", () => {
  it("an amide's nitrogen, a nitro group's, an aminopyridine's amino group, benzene", () => {
    for (const smiles of ["CC(=O)N", "C[N+](=O)[O-]", "C1=CC=CC=C1"]) {
      const { atoms, bonds } = skeleton(smiles);
      expect(protonationSites(atoms, bonds, label(atoms))).toEqual([]);
    }
    const { atoms, bonds } = skeleton("NC1=NC=CC=C1");
    expect(protonationSites(atoms, bonds, label(atoms)).map((s) => [s.kind, s.atoms])).toEqual([["ring nitrogen", [2]]]);
  });
});

describe("where the card starts", () => {
  const { atoms, bonds } = skeleton("CC(=O)[O-]");
  const sites = protonationSites(atoms, bonds, label(atoms));

  it("knows the form a molecule is drawn in", () => {
    expect(sites[0].forms[sites[0].now!].name).toBe("Carboxylate");
  });

  it("from the form its orders and charges draw, where a definition gave them (the CCD's, a SMILES', its own file's); else from none", () => {
    expect(startingForms("dictionary", sites)).toEqual([sites[0].now]);
    expect(startingForms("assigned", sites)).toEqual([sites[0].now]);
    expect(startingForms(undefined, sites)).toEqual([sites[0].now]);
    expect(startingForms("estimated", sites)).toEqual([null]);
  });

  it("adds no hydrogen until each site is chosen", () => {
    expect(protonated(atoms, bonds, sites, { forms: [null], charges: new Map() })).toEqual({ why: "Choose how each site is protonated." });
  });
});

describe("an atom outside the sites", () => {
  it("takes the charges its valence has room for, its hydrogens following", () => {
    // (an alcohol's oxygen: -1, 0 or +1 - an alkoxide, the alcohol, an oxonium; an ether's: 0 or +1)
    expect(chargesFor({ el: "O" }, 1)).toEqual([-1, 0, 1]);
    expect(chargesFor({ el: "O" }, 2)).toEqual([0, 1]);
    expect(chargesFor({ el: "C" }, 1)).toEqual([]);
    const { atoms, bonds } = skeleton("CO");
    const r = protonated(atoms, bonds, [], { forms: [], charges: new Map([[1, -1]]) });
    if ("why" in r) throw new Error(r.why);
    expect(formulaOf(atoms, r.charges, r.hydrogens)).toBe("CH3O−");
  });
});
