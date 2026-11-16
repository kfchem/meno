import { describe, expect, it } from "vitest";
import { fromSmiles } from "../../layout/testdata/fromSmiles";
import { symmetryOrbits } from "../identity";
import { locants, type Locants, type LocantsInput } from "./locants";

// Foundation part 16, level 1: known answers of the brief's section C - the 2013 recommendations' own names, and Meno's plain cases (M),
// each name's numbering read off it. Atoms are named by their place in the SMILES.

function run(smiles: string): { r: Locants; g: LocantsInput } {
  const g = fromSmiles(smiles);
  const r = locants({ atoms: g.atoms, bonds: g.bonds, orbits: symmetryOrbits(g).orbit });
  return { r, g };
}

/** What each atom shows, by its place in the SMILES. */
const shownOf = (smiles: string) => run(smiles).r.shown.map((s) => (s.sup ? `${s.base}^${s.sup}` : s.base));
const ownOf = (smiles: string) => run(smiles).r.own.map((o) => o.atom).sort((p, q) => p - q);

describe("one ring", () => {
  it("cyclohexene: the double bond at 1, 2 (M)", () => {
    const s = shownOf("C1=CCCCC1");
    expect([s[0], s[1]].sort()).toEqual(["1", "2"]);
  });

  it("3-bromocyclohex-1-ene: C=C 1, 2; Br on 3", () => {
    // (atoms: C1, C2 the double bond; C3 carries Br)
    const s = shownOf("C1=CC(Br)CCC1");
    expect([s[0], s[1]]).toEqual(["1", "2"]);
    expect(s[2]).toBe("3");
  });

  it("methylcyclohexane: C1 carries it (M); 1,1,3-trimethylcyclohexane, not 1,3,3 (M)", () => {
    expect(shownOf("CC1CCCCC1")[1]).toBe("1");
    const s = shownOf("CC1(C)CC(C)CCC1");
    expect(s[1]).toBe("1");
    expect(s[4]).toBe("3");
  });

  it("pyridine: N1 (M); 1,3-thiazole: S1, N3 (M); 1,2-oxazole: O1, N2 (M); morpholine: O1, N4 (M)", () => {
    expect(shownOf("c1ccncc1")[3]).toBe("1");
    const thiazole = shownOf("c1cscn1");
    expect(thiazole[2]).toBe("1");
    expect(thiazole[4]).toBe("3");
    const oxazole = shownOf("c1conc1");
    expect(oxazole[2]).toBe("1");
    expect(oxazole[3]).toBe("2");
    const morpholine = shownOf("C1COCCN1");
    expect(morpholine[2]).toBe("1");
    expect(morpholine[5]).toBe("4");
  });

  it("1,3-dioxolane; 1,5-dithiacyclododecane, not 1,9", () => {
    const d = shownOf("C1OCOC1");
    expect([d[1], d[3]].sort()).toEqual(["1", "3"]);
    const s = shownOf("C1CCSCCCCCCCS1");
    expect([s[3], s[11]].sort()).toEqual(["1", "5"]);
  });

  it("furan: O1, nothing indicated (M); 2H-pyran: O1, its CH2 at 2 (M); 2,3-dihydrofuran: O1, saturated 2, 3 (M)", () => {
    expect(shownOf("c1ccoc1")[3]).toBe("1");
    const pyran = shownOf("C1C=CC=CO1");
    expect(pyran[5]).toBe("1");
    expect(pyran[0]).toBe("2");
    const dihydro = shownOf("C1CC=CO1");
    expect(dihydro[4]).toBe("1");
    expect([dihydro[0], dihydro[1]].sort()).toEqual(["2", "3"]);
  });

  it("3,4-dihydro-2H-pyrrole: indicated hydrogen before hydro", () => {
    // (N1=C5: the CH2 next to N is 2, then 3, 4)
    const s = shownOf("C1CCC=N1");
    expect(s[4]).toBe("1");
    expect(s[0]).toBe("2");
  });
});

describe("fused, two rings (A4.4)", () => {
  it("naphthalene: 1 to 8 round the edge; the fusion atoms shown 4a and 8a, ninth and tenth in the order", () => {
    const { r } = run("c1ccc2ccccc2c1");
    const s = r.shown.map((x) => x.base);
    expect([s[3], s[8]].sort()).toEqual(["4a", "8a"]);
    expect(s.filter((x) => /^\d+$/.test(x)).sort((p, q) => Number(p) - Number(q))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect([r.order[8], r.order[9]].sort()).toEqual([3, 8]);
    expect(r.own).toEqual([]);
  });

  const at = (smiles: string, ...idx: number[]) => idx.map((i) => shownOf(smiles)[i]);
  it("quinoline N1, isoquinoline N2, 1H-indole N1 with 3a and 7a, 1-benzofuran O1 (M)", () => {
    expect(at("c1ccc2ncccc2c1", 4)).toEqual(["1"]);
    expect(at("c1ccc2cnccc2c1", 5)).toEqual(["2"]);
    expect(at("c1ccc2[nH]ccc2c1", 4, 3, 7)).toEqual(["1", "7a", "3a"]);
    expect(at("c1ccc2occc2c1", 4)).toEqual(["1"]);
  });

  it("1,3-benzothiazole S1 N3; 1H-benzimidazole the NH 1; quinazoline 1, 3; quinoxaline 1, 4; pteridine 1, 3, 5, 8 (M)", () => {
    expect(at("c1ccc2scnc2c1", 4, 6)).toEqual(["1", "3"]);
    expect(at("c1ccc2[nH]cnc2c1", 4, 6)).toEqual(["1", "3"]);
    expect(at("c1ccc2ncncc2c1", 4, 6).sort()).toEqual(["1", "3"]);
    expect(at("c1ccc2nccnc2c1", 4, 7).sort()).toEqual(["1", "4"]);
    expect(at("c1cnc2ncncc2n1", 2, 4, 6, 9).sort()).toEqual(["1", "3", "5", "8"]);
  });

  it("indolizine N4; azulene 3a and 8a, not 5a; 1H-indene its CH2 1 (M)", () => {
    expect(at("c1ccn2cccc2c1", 3)).toEqual(["4"]);
    expect(at("c1cc2cccccc2c1", 2, 8).sort()).toEqual(["3a", "8a"]);
    expect(at("C1C=Cc2ccccc12", 0)).toEqual(["1"]);
  });

  it("6-fluoro-1,2,3,4-tetrahydronaphthalene: saturated 1 to 4, F on 6", () => {
    const s = shownOf("C1CCc2cc(F)ccc2C1");
    expect([s[0], s[1], s[2], s[10]].sort()).toEqual(["1", "2", "3", "4"]);
    expect(s[5]).toBe("6");
  });
});

describe("fused, the table (A4.5)", () => {
  const at = (smiles: string, ...idx: number[]) => idx.map((i) => shownOf(smiles)[i]);
  it("anthracene 9 and 10 the middle CH; phenanthrene 9, 10; 9H-fluorene its CH2 9; 9H-carbazole N9; acridine N10", () => {
    expect(at("c1ccc2cc3ccccc3cc2c1", 4, 11).sort()).toEqual(["10", "9"]);
    expect(at("c1ccc2c(c1)ccc1ccccc12", 6, 7).sort()).toEqual(["10", "9"]);
    expect(at("C1c2ccccc2-c2ccccc12", 0)).toEqual(["9"]);
    expect(at("c1ccc2c(c1)[nH]c1ccccc12", 6)).toEqual(["9"]);
    expect(at("c1ccc2nc3ccccc3cc2c1", 4)).toEqual(["10"]);
  });

  it("7H-purine: N1, C2, N3, C4, C5, N7, C8, N9", () => {
    expect(at("c1ncc2[nH]cnc2n1", 0, 1, 2, 3, 4, 5, 6, 7, 8)).toEqual(["2", "1", "6", "5", "7", "8", "9", "4", "3"]);
  });

  it("pyrene: its two interior atoms 3a and 5a, each with a superscript 1", () => {
    const s = shownOf("c1cc2ccc3cccc4ccc(c1)c2c34");
    expect([s[14], s[15]].sort()).toEqual(["3a^1", "5a^1"]);
  });
});

describe("chains", () => {
  it("2-methylpentane, not 4 (M); 2,3,5-trimethylhexane, not 2,4,5 (M)", () => {
    const s = shownOf("CC(C)CCC");
    expect(s[1]).toBe("2");
    const t = shownOf("CC(C)C(C)CC(C)C");
    expect(t[1]).toBe("2");
    expect(t[3]).toBe("3");
    expect(t[6]).toBe("5");
  });

  it("pent-1-ene (M); 4-methylideneoctane: the chain of eight (M)", () => {
    expect(shownOf("C=CCCC")[0]).toBe("1");
    // (the chain of eight carries =CH2 at 4)
    const s = shownOf("CCCC(=C)CCCC");
    expect(s[3]).toBe("4");
    expect(s[4]).toBe("9");
  });
});

describe("the parent and its groups", () => {
  it("heptylbenzene: the ring 1 to 6, C1 the ipso carbon; the chain 7 to 13 from the ring outward", () => {
    const s = shownOf("c1ccccc1CCCCCCC");
    expect(s[5]).toBe("1");
    expect(s.slice(6)).toEqual(["7", "8", "9", "10", "11", "12", "13"]);
  });

  it("(propan-2-yl)benzene: ring 1 to 6; the group's carbons 7, 8, 9 with 8 the attached one (M)", () => {
    const s = shownOf("c1ccccc1C(C)C");
    expect(s[5]).toBe("1");
    expect(s[6]).toBe("8");
    expect([s[7], s[8]].sort()).toEqual(["7", "9"]);
  });

  it("1-ethoxyhexane: hexane 1 to 6, O 7, ethyl 8, 9 (M)", () => {
    // (the hexane's carbon that carries the O is its 1)
    expect(shownOf("CCCCCCOCC")).toEqual(["6", "5", "4", "3", "2", "1", "7", "8", "9"]);
  });

  it("tetramethylsilane and triphenylphosphane: the centre the parent, shown 1", () => {
    expect(shownOf("C[Si](C)(C)C")[1]).toBe("1");
    expect(shownOf("c1ccccc1P(c1ccccc1)c1ccccc1")[6]).toBe("1");
  });

  it("methoxy(methylsulfanyl)methane: the carbon, not the O or the S", () => {
    // (CH3-O-CH2-S-CH3: the parent is the one carbon of the name's methane, CH2)
    expect(shownOf("COCSC")[2]).toBe("1");
  });

  it("(2-disilanylethyl)phosphane: P, not the Si chain; methyl(silyl)phosphane: P", () => {
    expect(shownOf("[SiH3][SiH2]CCP")[4]).toBe("1");
    expect(shownOf("CP[SiH3]")[1]).toBe("1");
  });
});

describe("said as Meno's own", () => {
  it("3-chlorocyclohexan-1-ol: the set 1, 3 either way; the atoms whose numbers differ are own", () => {
    const own = ownOf("OC1CC(Cl)CCC1");
    expect(own.length).toBeGreaterThan(0);
    expect(own).toContain(1);
  });

  it("1-propoxypropane: one propane the parent, the tie a symmetry: nothing said", () => {
    expect(ownOf("CCCOCCC")).toEqual([]);
  });
});

describe("the whole", () => {
  it("numbers every heavy atom once, and shows no text twice", () => {
    for (const smiles of ["c1ccccc1CCCCCCC", "OC1CC(Cl)CCC1", "C[Si](C)(C)C", "CCCCCCOCC"]) {
      const { r, g } = run(smiles);
      expect(new Set(r.order).size, smiles).toBe(g.atoms.length);
      const texts = r.shown.map((s) => `${s.base}^${s.sup ?? ""}`);
      expect(new Set(texts).size, smiles).toBe(texts.length);
    }
  });
});
