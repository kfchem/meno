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

describe("rings and groups with more to them: every form the molecule's own hydrogens, less its charge", () => {
  /** How many forms of each formula a site has. */
  const counted = (forms: { formula: string }[]) => Object.fromEntries([...new Set(forms.map((f) => f.formula))].map((x) => [x, forms.filter((f) => f.formula === x).length]));

  it("a tetrazole: its hydrogen on any of its four nitrogens, two of them in its cation - never two more, nor a hydrogen on its anion", () => {
    const forms = formsOf("CC1=NN=NN1", "azole");
    expect(counted(forms)).toEqual({ "C2H5N4+": 6, C2H4N4: 4, "C2H3N4−": 1 });
    expect(forms.filter((f) => f.formula === "C2H4N4").map((f) => [f.name, f.where])).toEqual([
      ["Tetrazole", "H on N3"],
      ["Tetrazole", "H on N4"],
      ["Tetrazole", "H on N5"],
      ["Tetrazole", "H on N6"],
    ]);
  });

  it("a 1,2,3-triazole likewise", () => {
    expect(counted(formsOf("C1=CN=NN1", "azole"))).toEqual({ "C2H4N3+": 3, C2H3N3: 3, "C2H2N3−": 1 });
  });

  it("a triazolone: its lactams and lactims all of its formula - none with its ring drawn as an azo compound", () => {
    const forms = formsOf("O=C1NN=CN1", "lactam");
    expect(counted(forms)).toEqual({ "C2H4N3O+": 4, C2H3N3O: 5, "C2H2N3O−": 4 });
    expect(forms.filter((f) => f.name === "Lactam").map((f) => f.where)).toEqual(["H on N3, H on N4", "H on N3, H on N6"]);
  });

  it("metformin: its two guanidines one site, sharing a nitrogen - each tautomer, and its cation and dication", () => {
    const forms = formsOf("CN(C)C(=N)NC(=N)N", "guanidine");
    expect(counted(forms)).toEqual({ "C4H13N52+": 1, "C4H12N5+": 4, C4H11N5: 5 });
    expect(new Set(forms.map((f) => f.name))).toEqual(new Set(["Biguanidium", "Biguanide"]));
  });

  it("2-aminopyridine: its amino and imino forms, and its cation", () => {
    expect(formsOf("NC1=NC=CC=C1", "cyclic amidine")).toEqual([
      { name: "Amidinium", where: "2 H on N1, H on N3", formula: "C5H7N2+" },
      { name: "Amino form", where: "2 H on N1", formula: "C5H6N2" },
      { name: "Imino form", where: "H on N1, H on N3", formula: "C5H6N2" },
    ]);
  });

  it("2-aminothiazole likewise; thiazole's nitrogen and its cation", () => {
    expect(formsOf("NC1=NC=CS1", "cyclic amidine").map((f) => [f.name, f.formula])).toEqual([
      ["Amidinium", "C3H5N2S+"],
      ["Amino form", "C3H4N2S"],
      ["Imino form", "C3H4N2S"],
    ]);
    expect(formsOf("C1=CSC=N1", "ring nitrogen")).toEqual([
      { name: "Thiazolium", where: "H on N5", formula: "C3H4NS+" },
      { name: "Thiazole", where: "no H", formula: "C3H3NS" },
    ]);
  });

  it("cytosine: its lactam and its amino group one site - amino and imino, lactam and lactim, all of its formula", () => {
    const forms = formsOf("NC1=NC(=O)NC=C1", "lactam");
    expect(counted(forms)).toEqual({ "C4H6N3O+": 4, C4H5N3O: 6, "C4H4N3O−": 3 });
    expect(forms.filter((f) => f.formula === "C4H5N3O").map((f) => f.name)).toEqual(["Lactam", "Lactim", "Lactam", "Imino lactim", "Imino lactam", "Imino lactim"]);
  });

  it("an imine and its iminium", () => {
    expect(formsOf("CC=NC", "imine")).toEqual([
      { name: "Iminium", where: "H on N3", formula: "C3H8N+" },
      { name: "Imine", where: "no H", formula: "C3H7N" },
    ]);
  });

  it("an atom that can give a metal a pair of its own: its bond in place of a hydrogen as drawn, or not - each a form", () => {
    expect(formsOf("[Zn]NC", "metal bond")).toEqual([
      { name: "Covalent bond to Zn", where: "H on N2", formula: "CH4NZn" },
      { name: "Dative bond to Zn", where: "2 H on N2", formula: "CH5NZn" },
    ]);
    expect(formsOf("CC(=O)O[Na]", "metal bond")).toEqual([
      { name: "Covalent bond to Na", where: "no H", formula: "C2H3NaO2" },
      { name: "Dative bond to Na", where: "H on O4", formula: "C2H4NaO2" },
    ]);
    // (a pyrrolide on iron, its nitrogen with no double bond: as heme's are, drawn neutral)
    expect(formsOf("[Fe]N1C=CC=C1", "metal bond").map((f) => f.formula)).toEqual(["C4H4FeN", "C4H5FeN"]);
  });

  it("an atom that cannot: its bond to the metal in its valence, no site - methylmercury chloride, butyllithium, tributyltin chloride", () => {
    for (const [smiles, formula] of [
      ["C[Hg]Cl", "CH3ClHg"],
      ["[Li]CCCC", "C4H9Li"],
      ["CCCC[Sn](Cl)(CCCC)CCCC", "C12H27ClSn"],
      ["O=[As](O)(O)C1=CC=CC=C1", "C6H7AsO3"],
    ]) {
      const { atoms, bonds } = skeleton(smiles);
      const sites = protonationSites(atoms, bonds, label(atoms));
      expect(sites).toEqual([]);
      const r = protonated(atoms, bonds, sites, { forms: [], charges: new Map() });
      if ("why" in r) throw new Error(r.why);
      expect(formulaOf(atoms, r.charges, r.hydrogens)).toBe(formula);
    }
  });

  it("a pyridine bonded to a metal: its nitrogen no site - its hydrogens none either way", () => {
    const { atoms, bonds } = skeleton("C1=CC=N([Zn])C=C1");
    expect(protonationSites(atoms, bonds, label(atoms))).toEqual([]);
  });

  it("cytosine drawn as its imine: the same site and forms as drawn as its amine", () => {
    const amine = formsOf("NC1=NC(=O)NC=C1", "lactam");
    const imine = formsOf("N=C1NC(=O)NC=C1", "lactam");
    expect(imine.map((f) => [f.name, f.where, f.formula])).toEqual(amine.map((f) => [f.name, f.where, f.formula]));
  });

  it("an N-oxide's oxygen: not a lactam's - pyrimidine N-oxide's other nitrogen a ring nitrogen", () => {
    const { atoms, bonds } = skeleton("C1=CN=C[N+]([O-])=C1");
    expect(protonationSites(atoms, bonds, label(atoms)).map((s) => s.kind)).toEqual(["ring nitrogen"]);
  });

  it("imidazolide on zinc: its nitrogen's bond covalent, the ring's bonds found again with it - its other nitrogen's forms", () => {
    const { atoms, bonds } = skeleton("[Zn]N1C=NC=C1");
    const sites = protonationSites(atoms, bonds, label(atoms));
    expect(sites.map((s) => s.kind)).toEqual(["metal bond", "azole"]);
    const neutral = sites[1].forms.findIndex((f) => !f.charge);
    const r = protonated(atoms, bonds, sites, { forms: [0, neutral], charges: new Map() });
    if ("why" in r) throw new Error(r.why);
    expect(formulaOf(atoms, r.charges, r.hydrogens)).toBe("C3H3N2Zn");
  });

  it("a ring carbon bonded to a metal: its bond in its valence as the ring's bonds are found again - 2-(chloromercurio)imidazole", () => {
    expect(formsOf("Cl[Hg]C1=NC=CN1", "azole").map((f) => [f.name, f.formula])).toEqual([
      ["Imidazolium", "C3H4ClHgN2+"],
      ["Imidazole", "C3H3ClHgN2"],
      ["Imidazole", "C3H3ClHgN2"],
      ["Imidazolate", "C3H2ClHgN2−"],
    ]);
  });
});

describe("what a site is called, by what it is made of", () => {
  const titles = (smiles: string) => {
    const { atoms, bonds } = skeleton(smiles);
    return protonationSites(atoms, bonds, label(atoms)).map((s) => s.title);
  };

  it("an azole by the atoms round its ring, a ring nitrogen by its ring's", () => {
    expect(titles("C1=NN=CO1")).toEqual(["Oxadiazole"]);
    expect(titles("C1=NC=NO1")).toEqual(["Oxadiazole"]);
    expect(titles("C1=NN=CS1")).toEqual(["Thiadiazole"]);
    expect(titles("C1=CN=CN1")).toEqual(["Imidazole"]);
    expect(titles("C1=CC=NN1")).toEqual(["Pyrazole"]);
    expect(titles("C1=COC=N1")).toEqual(["Oxazole nitrogen"]);
    expect(titles("C1=CON=C1")).toEqual(["Isoxazole nitrogen"]);
    expect(titles("C1=CN=CN=C1")).toEqual(["Pyrimidine nitrogen", "Pyrimidine nitrogen"]);
    expect(titles("C1=CN=NC=C1")).toEqual(["Pyridazine nitrogen", "Pyridazine nitrogen"]);
    expect(titles("C1=CN=CC=N1")).toEqual(["Pyrazine nitrogen", "Pyrazine nitrogen"]);
  });

  it("a phosphorus's or sulfur's acid by what else it carries", () => {
    expect(titles("COP(=O)(O)O")).toEqual(["Phosphate"]);
    expect(titles("CP(=O)(O)O")).toEqual(["Phosphonate"]);
    expect(titles("CP(C)(=O)O")).toEqual(["Phosphinate"]);
    expect(titles("CS(=O)(=O)O")).toEqual(["Sulfonate"]);
    expect(titles("COS(=O)(=O)O")).toEqual(["Sulfate"]);
    expect(titles("CNS(=O)(=O)O")).toEqual(["Sulfamate"]);
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
  it("an amide's nitrogen, a nitro group's, benzene, an oxime's nitrogen, pyrrole's", () => {
    for (const smiles of ["CC(=O)N", "C[N+](=O)[O-]", "C1=CC=CC=C1", "CC=NO", "C1=CNC=C1"]) {
      const { atoms, bonds } = skeleton(smiles);
      expect(protonationSites(atoms, bonds, label(atoms))).toEqual([]);
    }
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

  it("from none for a bond to a metal, whatever gave its orders: a water on a zinc drawn with a single bond, beside an acetate", () => {
    // (a molfile has no dative bond: its O-Zn single bond, read as drawn, would be a hydroxide)
    const { atoms, bonds } = skeleton("O[Zn].CC(=O)[O-]");
    const sites = protonationSites(atoms, bonds, label(atoms));
    expect(sites.map((s) => s.kind)).toEqual(["metal bond", "carboxyl"]);
    const metal = sites[0];
    expect(metal.forms[metal.now!].name).toBe("Covalent bond to Zn");
    for (const by of ["dictionary", "assigned", undefined, "estimated"] as const) expect(startingForms(by, sites), String(by)).toEqual([null, by === "estimated" ? null : sites[1].now]);
    expect(protonated(atoms, bonds, sites, { forms: startingForms("assigned", sites), charges: new Map() })).toEqual({ why: "Choose how each site is protonated." });
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
