import { describe, expect, it } from "vitest";
import { abbreviationOf, abbreviationStructure, bondsUnwrittenOO, labelRefused } from "./abbreviations";
import { structureFormula, type GroupStructure } from "./ligands";

// A metal's salt of an oxoanion, typed as a label, read as its ions: the metal's cation and the anion of the charge its formula makes.

const of = (label: string) => abbreviationStructure(label)!;
/** Each atom as an element and its charge: "Ag+1", "N+1", "O-1", "O". */
const ions = (s: GroupStructure) => s.atoms.map((a) => `${a.el}${a.charge ? (a.charge > 0 ? `+${a.charge}` : a.charge) : ""}`);
const charge = (s: GroupStructure) => s.atoms.reduce((q, a) => q + (a.charge ?? 0), 0);

describe("a metal's salt of an oxoanion", () => {
  it("reads silver nitrate as Ag+ and nitrate - N+ with one N=O and two O- - never silver with three NO", () => {
    const s = of("AgNO3");
    expect([structureFormula(s), ions(s), charge(s)]).toEqual(["AgNO3", ["Ag+1", "N+1", "O", "O-1", "O-1"], 0]);
    // (no bond to the silver: the ions apart, as a salt is drawn)
    expect(s.bonds.every((b) => s.atoms[b.a1].el !== "Ag" && s.atoms[b.a2].el !== "Ag")).toBe(true);
    expect(s.bonds.filter((b) => b.order === 2)).toHaveLength(1);
    expect(abbreviationOf("AgNO3")?.kind).toBe("reagent");
  });

  it("balances the metal's charge on the anions': Cu(NO3)2 Cu2+, Fe(NO3)3 Fe3+, Fe2(SO4)3 Fe3+, Ca3(PO4)2 Ca2+", () => {
    const cases: [string, string, string][] = [
      ["Cu(NO3)2", "CuN2O6", "Cu+2"],
      ["Ba(NO3)2", "BaN2O6", "Ba+2"],
      ["Fe(NO3)3", "FeN3O9", "Fe+3"],
      ["Mg(ClO4)2", "Cl2MgO8", "Mg+2"],
      ["LiClO4", "ClLiO4", "Li+1"],
      ["CuSO4", "CuO4S", "Cu+2"],
      ["Fe2(SO4)3", "Fe2O12S3", "Fe+3"],
      ["Ag2CO3", "CAg2O3", "Ag+1"],
      ["CaCO3", "CCaO3", "Ca+2"],
      ["Ca3(PO4)2", "Ca3O8P2", "Ca+2"],
      ["NaNO3", "NNaO3", "Na+1"],
      ["KNO3", "KNO3", "K+1"],
    ];
    for (const [label, formula, metal] of cases) {
      const s = of(label);
      expect([structureFormula(s), ions(s)[0], charge(s)], label).toEqual([formula, metal, 0]);
    }
  });

  it("reads mercury(I) as the Hg2 2+ ion, its two Hg bonded, each +1, and mercury(II) as Hg2+: Hg2(NO3)2, Hg2SO4, Hg(NO3)2", () => {
    const hgHg = (s: GroupStructure) => s.bonds.filter((b) => s.atoms[b.a1].el === "Hg" && s.atoms[b.a2].el === "Hg").map((b) => b.order);
    for (const label of ["Hg2(NO3)2", "Hg2SO4"]) {
      const s = of(label);
      expect([ions(s).slice(0, 2), hgHg(s), charge(s)], label).toEqual([["Hg+1", "Hg+1"], [1], 0]);
    }
    const two = of("Hg(NO3)2");
    expect([ions(two)[0], hgHg(two), charge(two)]).toEqual(["Hg+2", [], 0]);
    // (one Hg+ alone is no ion: HgNO3, mercury(I)'s empirical formula, does not say the pair - left unread, by every reader; two Hg2+
    //  are not bonded)
    expect([abbreviationOf("HgNO3") ?? null, abbreviationStructure("HgNO3")]).toEqual([null, null]);
    expect([ions(of("Hg2(SO4)2")).slice(0, 2), hgHg(of("Hg2(SO4)2"))]).toEqual([["Hg+2", "Hg+2"], []]);
    // (another metal's two +1 cations stay two ions: silver carbonate)
    expect(hgHg(of("Ag2CO3"))).toEqual([]);
    expect(of("Ag2CO3").bonds.some((b) => of("Ag2CO3").atoms[b.a1].el === "Ag")).toBe(false);
  });

  it("reads mercury(I)'s halides and acetate as X-Hg-Hg-X - its pair bonded, a group on each - and mercury(II)'s with no Hg-Hg bond", () => {
    const hgHg = (s: GroupStructure) => s.bonds.filter((b) => s.atoms[b.a1].el === "Hg" && s.atoms[b.a2].el === "Hg").length;
    // (each Hg bonded to the other Hg and to one group, no more)
    const eachOne = (s: GroupStructure) =>
      s.atoms.flatMap((a, i) => (a.el === "Hg" ? [s.bonds.filter((b) => (b.a1 === i || b.a2 === i) && s.atoms[b.a1 === i ? b.a2 : b.a1].el !== "Hg").length] : []));
    for (const label of ["Hg2Cl2", "Hg2Br2", "Hg2I2", "Hg2(OAc)2"]) {
      const s = of(label);
      expect([hgHg(s), eachOne(s), charge(s)], label).toEqual([1, [1, 1], 0]);
    }
    for (const label of ["HgCl2", "Hg(OAc)2", "Hg2Cl4"]) expect(hgHg(of(label)), label).toBe(0);
    // (another metal's two of one kind are not bonded: copper(I) chloride written Cu2Cl2)
    expect(hgHg(of("Cu2Cl2"))).toBe(0);
    expect(of("Cu2Cl2").bonds.some((b) => of("Cu2Cl2").atoms[b.a1].el === "Cu" && of("Cu2Cl2").atoms[b.a2].el === "Cu")).toBe(false);
  });

  it("gives the metal a charge of one to four, a whole one: Ce(NO3)4 Ce4+; Ca2(NO3)3, whose calcium would be 1.5+, not read", () => {
    expect([ions(of("Ce(NO3)4"))[0], charge(of("Ce(NO3)4"))]).toEqual(["Ce+4", 0]);
    expect(abbreviationStructure("Ca2(NO3)3")).toBeNull();
  });

  it("reads a nitrate of each metal on its list (the formula as written, its metal's charge the one it makes)", () => {
    const listed = ["Be", "Mg", "Ca", "Sr", "Ba", "Zn", "Cd", "Hg", "Al", "Ga", "In", "Tl", "Sn", "Pb", "Bi", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Y", "Zr", "Nb", "Mo", "Ru", "Rh", "Pd", "Ag", "La", "Ce", "Nd", "Sm", "Eu", "Gd", "Yb", "Lu", "Hf", "W", "Os", "Ir", "Pt", "Au", "U"];
    for (const el of listed) expect([ions(of(`${el}(NO3)2`))[0], charge(of(`${el}(NO3)2`))], el).toEqual([`${el}+2`, 0]);
  });

  it("leaves a halide, a group bound by one bond and a complex's formula as they were read: CuCl2, AgOTf, Cu(OAc)2, MoO2Cl2", () => {
    expect(abbreviationOf("CuCl2")?.kind).toBe("complex");
    expect(abbreviationOf("AgOTf")?.kind).toBe("complex");
    expect(abbreviationOf("Cu(OAc)2")?.kind).toBe("complex");
    expect(abbreviationOf("MoO2Cl2")?.kind).toBe("complex");
  });
});

describe("a formula read as two O bonded that it does not write together", () => {
  it("is not read, and says why: MoO2NO3 and VO2NO3 - no compounds - would be three O-O-N=O", () => {
    for (const label of ["MoO2NO3", "VO2NO3"]) {
      expect([abbreviationOf(label) ?? null, abbreviationStructure(label)], label).toEqual([null, null]);
      expect(labelRefused(label), label).toEqual({ why: "two O bonded" });
    }
  });

  it("is asked of the reading and the label alike: an O-O the label writes - OO, or O2 in brackets as a peroxo ligand - is no refusal", () => {
    // (two O bonded, each with one more bond: O-O-N, as MoO2NO3 would be read)
    const peroxo = {
      atoms: ["N", "O", "O", "C"].map((el) => ({ el })),
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1 },
        { a1: 2, a2: 3, order: 1 },
      ],
      attach: [],
    } as unknown as GroupStructure;
    expect(bondsUnwrittenOO("MoO2NO3", peroxo)).toBe(true);
    for (const label of ["CH3OOH", "tBuOOMe", "CrO(O2)2", "Cp2Ti(η2-O2)", "Mo(μ-O2)"]) expect(bondsUnwrittenOO(label, peroxo), label).toBe(false);
    // (no O bonded to an O, nothing to refuse, whatever the label)
    expect(bondsUnwrittenOO("MoO2NO3", { ...peroxo, bonds: peroxo.bonds.slice(0, 1) })).toBe(false);
  });

  it("leaves every formula read without an O-O as it was, and refuses nothing it finds no structure for", () => {
    for (const label of ["AgNO3", "Cu(NO3)2", "MoO2Cl2", "UO2Cl2", "Pd(OAc)2", "NaNO3", "KMnO4", "OsO4"]) {
      expect(abbreviationStructure(label), label).not.toBeNull();
      expect(labelRefused(label), label).toBeUndefined();
    }
    expect(labelRefused("CH2CH2")).toBeUndefined();
  });
});

describe("an oxo formula past its metal's highest oxidation state", () => {
  it("is not read as written, and says why: CrO5 and MoO5, five oxo each, past +6", () => {
    for (const [label, el] of [["CrO5", "Cr"], ["MoO5", "Mo"]] as const) {
      expect([abbreviationOf(label) ?? null, abbreviationStructure(label)], label).toEqual([null, null]);
      expect(labelRefused(label), label).toEqual({ why: "past the highest state", metal: el, oxo: 5, others: 0, state: 10, highest: 6 });
    }
  });

  it("counts the other groups by a single bond too: MoO3Cl2 (+8), WO2Cl3 (+7), TiO3 (+6) and VO3 (+6) not read as written", () => {
    expect(labelRefused("MoO3Cl2")).toEqual({ why: "past the highest state", metal: "Mo", oxo: 3, others: 2, state: 8, highest: 6 });
    for (const label of ["WO2Cl3", "TiO3", "VO3"]) expect([abbreviationOf(label) ?? null, labelRefused(label) != null], label).toEqual([null, true]);
  });

  it("holds each metal's highest state: one oxo past it refused, at it read - Ti, Zr, Hf +4; Nb, Ta +5; Tc, Mn, Re +7; Ru, Os +8", () => {
    const past: [string, string, number, number][] = [
      ["TiO3", "Ti", 6, 4],
      ["ZrO3", "Zr", 6, 4],
      ["HfO3", "Hf", 6, 4],
      ["NbO3", "Nb", 6, 5],
      ["TaO3", "Ta", 6, 5],
      ["TcO4", "Tc", 8, 7],
      ["MnO4", "Mn", 8, 7],
      ["ReO4", "Re", 8, 7],
      ["RuO5", "Ru", 10, 8],
      ["OsO5", "Os", 10, 8],
    ];
    for (const [label, metal, state, highest] of past) expect(labelRefused(label), label).toMatchObject({ why: "past the highest state", metal, state, highest });
    for (const label of ["OsO4", "RuO4", "ReO3Cl", "TcO3Cl", "MnO3Cl", "TaO2Cl", "NbO2Cl"]) {
      expect(abbreviationStructure(label), label).not.toBeNull();
      expect(labelRefused(label), label).toBeUndefined();
    }
  });


  it("reads one at its highest state or below as before: CrO3, MoO3, WO3, OsO4, MoO2Cl2, ReO3Me, CrO2Cl2, VOCl3, NbOCl3, TiOCl2, MnO3Cl", () => {
    for (const label of ["CrO3", "MoO3", "WO3", "OsO4", "MoO2Cl2", "ReO3Me", "CrO2Cl2", "VOCl3", "NbOCl3", "TiOCl2", "MnO3Cl"]) {
      expect(abbreviationStructure(label), label).not.toBeNull();
      expect(labelRefused(label), label).toBeUndefined();
    }
  });
});

/** The metal's bonds in a structure: "O-" for each O by a single bond, "O=" for each oxo (the H, the formula's, can be on no atom but an O). */
const metalBonds = (s: GroupStructure, el: string) => {
  const m = s.atoms.findIndex((a) => a.el === el);
  return s.bonds
    .filter((b) => b.a1 === m || b.a2 === m)
    .map((b) => {
      const o = s.atoms[b.a1 === m ? b.a2 : b.a1];
      return `${o.el}${b.order === 2 ? "=" : "-"}`;
    })
    .sort();
};

describe("a metal oxoacid, as HnMOm or with its hydroxo written out", () => {
  it("reads H2CrO4 as Cr(=O)2(OH)2, Cr(VI); HMnO4 as Mn(=O)3(OH), Mn(VII); HReO4 as Re(=O)3(OH), Re(VII)", () => {
    // H2CrO4: atoms Cr, 4 O, 2 H. Each H on an O of its own: two Cr-O-H, by single bonds; the other two O oxo, Cr=O. Cr: 2 x 2 (oxo)
    // + 2 x 1 (hydroxo) = +6, chromium's highest state, the one the table holds.
    // HMnO4: Mn, 4 O, 1 H. One Mn-O-H, three Mn=O. Mn: 3 x 2 + 1 = +7, the table's.
    // HReO4: Re, 4 O, 1 H. One Re-O-H, three Re=O. Re: 3 x 2 + 1 = +7, the table's.
    const cases: [string, string, string, string[]][] = [
      ["H2CrO4", "Cr", "CrH2O4", ["O-", "O-", "O=", "O="]],
      ["HMnO4", "Mn", "HMnO4", ["O-", "O=", "O=", "O="]],
      ["HReO4", "Re", "HO4Re", ["O-", "O=", "O=", "O="]],
    ];
    for (const [label, el, formula, bonds] of cases) {
      const s = of(label);
      expect([structureFormula(s), metalBonds(s, el), s.bonds.length, charge(s)], label).toEqual([formula, bonds, 4, 0]);
      expect([abbreviationOf(label)?.kind, labelRefused(label)], label).toEqual(["reagent", undefined]);
    }
    expect(abbreviationOf("H2CrO4")?.name).toBe("dihydroxidodioxidochromium");
    expect(abbreviationOf("HMnO4")?.name).toBe("hydroxidotrioxidomanganese");
  });

  it("reads the hydroxo forms typed out, each the same molecule as its HnMOm: CrO2(OH)2, MoO2(OH)2 Mo(VI), ReO3(OH), VO(OH)3 V(V)", () => {
    // CrO2(OH)2: Cr, two oxo Cr=O, two hydroxo Cr-O-H: +6, one identity with H2CrO4.
    // ReO3(OH) and ReO3OH: three Re=O, one Re-O-H: +7, one identity with HReO4.
    expect(of("CrO2(OH)2")).toEqual(of("H2CrO4"));
    expect(of("ReO3(OH)")).toEqual(of("HReO4"));
    expect(of("ReO3OH")).toEqual(of("HReO4"));
    // MoO2(OH)2: Mo, 4 O, 2 H; two Mo=O, two Mo-O-H: 2 x 2 + 2 = +6, the table's.
    const mo = of("MoO2(OH)2");
    expect([structureFormula(mo), metalBonds(mo, "Mo")]).toEqual(["H2MoO4", ["O-", "O-", "O=", "O="]]);
    expect(mo).toEqual(of("H2MoO4"));
    // VO(OH)3: V, 4 O, 3 H; one V=O, three V-O-H: 2 + 3 = +5, the table's.
    const v = of("VO(OH)3");
    expect([structureFormula(v), metalBonds(v, "V")]).toEqual(["H3O4V", ["O-", "O-", "O-", "O="]]);
    for (const label of ["CrO2(OH)2", "MoO2(OH)2", "ReO3(OH)", "VO(OH)3"]) expect(labelRefused(label), label).toBeUndefined();
  });

  it("refuses one whose formula gives its metal a state the table does not hold, never guessed: H2CrO3 Cr(IV), H2MnO4 Mn(VI)", () => {
    // H2CrO3: two Cr-O-H and one Cr=O, Cr +4; the table holds +6 for Cr. H2MnO4 (manganic acid): two Mn-O-H and two Mn=O, Mn +6;
    // the table holds +7 for Mn. Each kept as words, and said.
    expect([abbreviationOf("H2CrO3") ?? null, abbreviationStructure("H2CrO3")]).toEqual([null, null]);
    expect(labelRefused("H2CrO3")).toEqual({ why: "a state not held", metal: "Cr", oxo: 1, hydroxo: 2, state: 4, held: 6 });
    expect(abbreviationOf("H2MnO4") ?? null).toBeNull();
    expect(labelRefused("H2MnO4")).toEqual({ why: "a state not held", metal: "Mn", oxo: 2, hydroxo: 2, state: 6, held: 7 });
    // (past it too, as written: CrO3(OH), Cr +7)
    expect(labelRefused("CrO3(OH)")).toMatchObject({ why: "a state not held", state: 7, held: 6 });
  });

  it("leaves the main-group acids and a bare hydroxy as they were: H2SO4 sulfuric acid from the table, HNO3 and H3PO4 unread, HO and OH unread", () => {
    expect([abbreviationOf("H2SO4")?.name, structureFormula(of("H2SO4"))]).toEqual(["sulfuric acid", "H2O4S"]);
    for (const label of ["HNO3", "H3PO4", "HO", "OH"]) {
      expect([abbreviationOf(label) ?? null, labelRefused(label) ?? null], label).toEqual([null, null]);
    }
  });
});
