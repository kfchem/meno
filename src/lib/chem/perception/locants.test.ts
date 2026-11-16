import { describe, expect, it } from "vitest";
import { fromSmiles } from "../../layout/testdata/fromSmiles";
import { aromaticForm, symmetryOrbits } from "../identity";
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

describe("von Baeyer (A4.3)", () => {
  const at = (smiles: string, ...idx: number[]) => idx.map((i) => shownOf(smiles)[i]);
  it("bicyclo[2.2.1]heptane: bridgeheads 1, 4, the bridge 7 (M); bicyclo[2.2.1]hept-2-ene: C=C 2, 3 (M)", () => {
    // (C0..C6: C2 and C5 the bridgeheads, C6 the one-atom bridge)
    expect(at("C1CC2CCC1C2", 2, 5, 6).map(String).sort()).toEqual(["1", "4", "7"]);
    expect(at("C1CC2CCC1C2", 6)).toEqual(["7"]);
    const s = at("C1=CC2CCC1C2", 0, 1);
    expect(s.sort()).toEqual(["2", "3"]);
  });

  it("bicyclo[3.2.1]octane: 1; 2, 3, 4; 5; 6, 7; 8", () => {
    // (C2 and C4 the bridgeheads: C1, C0, C5 the three-atom segment, C6, C7 the two-atom one, C3 the bridge)
    const s = shownOf("C1CC2CC(C1)CC2");
    expect([s[2], s[4]].sort()).toEqual(["1", "5"]);
    expect([s[1], s[0], s[5]].sort()).toEqual(["2", "3", "4"]);
    expect([s[6], s[7]].sort()).toEqual(["6", "7"]);
    expect(s[3]).toBe("8");
  });

  it("3-oxabicyclo[3.2.1]octane; 2-selenabicyclo[2.2.1]heptane", () => {
    // (O in the middle of the three-atom segment)
    expect(at("C1OCC2CCC1C2", 1)).toEqual(["3"]);
    expect(at("C1[Se]C2CCC1C2", 1)).toEqual(["2"]);
  });

  it("bicyclo[4.2.0]oct-6-ene, not 1(8); bicyclo[4.2.0]oct-7-ene (M)", () => {
    // (a bridgehead's C=C into the four-ring: 6, 7, the fewest compound locants)
    expect(at("C1CCC2=CCC2C1", 3, 4).sort()).toEqual(["6", "7"]);
    // (the four-ring's two CH: 7, 8)
    expect(at("C1CCC2C=CC2C1", 4, 5).sort()).toEqual(["7", "8"]);
  });

  it("bicyclo[4.2.0]octa-1,3,5-triene and its 2-methyl compound, each drawn in both Kekule forms: the same numbers on the same atoms (M)", () => {
    // (benzocyclobutene: the two forms of the benzene ring)
    const a = shownOf("C1CC2=CC=CC=C12");
    const b = shownOf("C1CC2=C1C=CC=C2");
    // (in both: the four-ring's CH2s are 7 and 8)
    expect([a[0], a[1]].sort()).toEqual(["7", "8"]);
    expect([b[0], b[1]].sort()).toEqual(["7", "8"]);
    const m1 = shownOf("CC1=CC=CC2=C1CC2");
    const m2 = shownOf("CC1=C2CCC2=CC=C1");
    // (the methyl's carbon on 2 either way)
    expect(m1[1]).toBe("2");
    expect(m2[1]).toBe("2");
  });

  it("3,6,8-trioxabicyclo[3.2.2]nonane, not 3,7,9; bicyclo[4.1.0]hepta-1,3,5-triene: its CH2 7", () => {
    expect(at("C12COCC(OC1)CO2", 2, 5, 8).sort()).toEqual(["3", "6", "8"]);
    expect(at("C1C2=CC=CC=C12", 0)).toEqual(["7"]);
  });

  it("tricyclo[4.4.0.0(3,8)]decane: von Baeyer, as the text names it - no two of its smallest rings share exactly one bond, so nothing said (M)", () => {
    expect(ownOf("C12CC3CCC1CC3CC2")).toEqual([]);
  });

  it("adamantane, cubane: von Baeyer, nothing said (M); 1,2,3,4-tetrahydro-1,4-methanonaphthalene: Meno's own, whole system (M)", () => {
    expect(ownOf("C1C2CC3CC1CC(C2)C3")).toEqual([]);
    expect(ownOf("C12C3C4C1C5C2C3C45")).toEqual([]);
    expect(ownOf("C1CC2CC1c1ccccc12").length).toBe(11);
  });
});

describe("spiro (A4.6)", () => {
  const at = (smiles: string, ...idx: number[]) => idx.map((i) => shownOf(smiles)[i]);
  it("spiro[4.5]decane: 1 to 4 in the five-ring, the spiro atom 5; spiro[4.4]nonane", () => {
    // (C0 the spiro atom; C1..C4 the five-ring, C5..C9 the six-ring)
    const s = shownOf("C12(CCCC1)CCCCC2");
    expect(s[0]).toBe("5");
    expect([s[1], s[2], s[3], s[4]].sort()).toEqual(["1", "2", "3", "4"]);
    expect(shownOf("C12(CCCC1)CCCC2")[0]).toBe("5");
  });

  it("6-oxaspiro[4.5]decane, not 10-oxa; 9-oxa-6-azaspiro[4.5]decane; 7-thia-9-azaspiro[4.5]decane", () => {
    expect(at("C12(CCCC1)OCCCC2", 5)).toEqual(["6"]);
    expect(at("C12(CCCC1)NCCOC2", 5, 8)).toEqual(["6", "9"]);
    expect(at("C12(CCCC1)CSCNC2", 6, 8)).toEqual(["7", "9"]);
  });

  it("dispiro[4.1.4(7).2(5)]tridecane, not [4.2.4(8).1(5)]; dispiro[3.2.3(7).2(4)]dodecane", () => {
    // (two five-rings on a five-ring at its 1 and 3: the spiro atoms 5 and 7)
    const s = shownOf("C12(CCCC1)CC1(CCCC1)CC2");
    expect([s[0], s[6]].sort()).toEqual(["5", "7"]);
    // (two four-rings on a six-ring at its 1 and 4: the spiro atoms 4 and 7)
    const t = shownOf("C12(CCC1)CCC1(CCC1)CC2");
    expect([t[0], t[6]].sort()).toEqual(["4", "7"]);
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

describe("ring assemblies and multiplied parents (A3.3, A3.5, A4.7)", () => {
  it("1,1'-biphenyl: 1 to 6, then 1' to 6', the junction 1 and 1'; seventh to twelfth in the order", () => {
    const { r } = run("c1ccccc1-c1ccccc1");
    const s = r.shown.map((x) => x.base);
    expect([s[5], s[6]].sort()).toEqual(["1", "1'"]);
    expect(s.filter((x) => x.endsWith("'")).length).toBe(6);
    expect(r.order.slice(6).every((a) => s[a].endsWith("'"))).toBe(true);
    expect(r.own).toEqual([]);
  });

  it("2,2'-bipyridine: N1, the junction C2, N1'", () => {
    const s = shownOf("n1ccccc1-c1ccccn1");
    expect([s[0], s[11]].sort()).toEqual(["1", "1'"]);
    expect([s[5], s[6]].sort()).toEqual(["2", "2'"]);
  });

  it("2-methyl-1,1'-biphenyl: the methyl's ring unprimed (M)", () => {
    const s = shownOf("Cc1ccccc1-c1ccccc1");
    expect(s[1]).toBe("2");
    expect(s[6]).toBe("1");
  });

  it("1-phenylcyclohexene: an assembly, 2,3,4,5-tetrahydro-1,1'-biphenyl, the saturated ring unprimed (M)", () => {
    // (C0=C1 the cyclohexene's double bond, C1 the junction)
    const s = shownOf("C1=C(CCCC1)c1ccccc1");
    expect(s[1]).toBe("1");
    expect([s[2], s[3], s[4], s[5]].sort()).toEqual(["2", "3", "4", "5"]);
    expect(s[0]).toBe("6");
  });

  it("cyclohexylbenzene: benzene the parent, NOT an assembly", () => {
    const s = shownOf("C1CCCCC1c1ccccc1");
    expect(s.filter((x) => x.endsWith("'"))).toEqual([]);
    expect(s[6]).toBe("1");
  });

  it("1,1':4',1''-terphenyl (M): composite locants, the rings 1, 2, 3; the middle ring's junctions its 1 and 4", () => {
    const { r } = run("c1ccccc1-c1ccc(cc1)-c1ccccc1");
    const sh = r.shown;
    // (the middle ring: ring 2, its junctions the superscripts 1 and 4)
    expect([sh[6], sh[9]].map((x) => `${x.base}^${x.sup}`).sort()).toEqual(["2^1", "2^4"]);
    expect(sh.every((x) => !!x.sup)).toBe(true);
  });

  it("1,1'-methylenedibenzene and 1,1'-oxydibenzene: both rings parents, the second primed, the junction 1 and 1'; then the link", () => {
    for (const smiles of ["c1ccccc1Cc1ccccc1", "c1ccccc1Oc1ccccc1"]) {
      const { r } = run(smiles);
      const s = r.shown.map((x) => x.base);
      expect([s[5], s[7]].sort(), smiles).toEqual(["1", "1'"]);
      expect(s[6], smiles).toBe("13");
      expect(r.own, smiles).toEqual([]);
    }
  });

  it("1,1'-oxybis(4-bromobenzene): each ring's link at 1, its Br at 4", () => {
    const s = shownOf("Brc1ccc(cc1)Oc1ccc(Br)cc1");
    expect([s[4], s[8]].sort()).toEqual(["1", "1'"]);
    expect([s[1], s[11]].sort()).toEqual(["4", "4'"]);
  });

  it("1-propoxypropane: not multiplied - a chain never is; one propane, nothing said", () => {
    const s = shownOf("CCCOCCC");
    expect(s.filter((x) => x.endsWith("'"))).toEqual([]);
  });

  it("1,4-dibenzylbenzene: Meno's own - the alike rings are not all the tied ones (M)", () => {
    expect(ownOf("c1ccccc1Cc1ccc(cc1)Cc1ccccc1").length).toBeGreaterThan(0);
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

describe("any order (D)", () => {
  /**
   * The graph written in `order`: each atom's element and what it shows, each bond by the two places and its order in the aromatic form
   * (the numbering is the same whichever Kekule form a ring was drawn in).
   */
  const written = (g: LocantsInput, r: Locants) => {
    const place = new Map(r.order.map((a, k) => [a, k]));
    const atoms = r.order.map((a) => `${g.atoms[a].el}:${r.shown[a].base}^${r.shown[a].sup ?? ""}`);
    const bonds = aromaticForm(g as never).bonds.map((b) => [place.get(b.a)!, place.get(b.b)!].sort((p, q) => p - q).join("-") + `:${b.order}`).sort();
    return `${atoms.join(" ")} | ${bonds.join(" ")}`;
  };
  /** The same molecule with its atoms in another order. */
  const shuffled = (g: LocantsInput, seed: number): LocantsInput => {
    const n = g.atoms.length;
    const perm = Array.from({ length: n }, (_, i) => i);
    let x = seed;
    for (let i = n - 1; i > 0; i--) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const j = x % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const to = new Map(perm.map((old, k) => [old, k]));
    return {
      atoms: perm.map((old) => g.atoms[old]),
      bonds: g.bonds.map((b) => ({ ...b, a: to.get(b.a)!, b: to.get(b.b)! })),
    };
  };
  it.each([
    "c1ccc2ccccc2c1",
    "c1ccccc1CCCCCCC",
    "C1CC2CC(C1)CC2",
    "C12(CCCC1)OCCCC2",
    "c1ccccc1-c1ccccc1",
    "Brc1ccc(cc1)Oc1ccc(Br)cc1",
    "c1ccc2c(c1)[nH]c1ccccc12",
    "C1C2CC3CC1CC(C2)C3",
    "CC(C)C(C)CC(C)C",
    "c1ncc2[nH]cnc2n1",
  ])("%s: the same numbered molecule, its atoms shuffled", (smiles) => {
    const g = fromSmiles(smiles);
    const once = (h: LocantsInput) => written(h, locants({ ...h, orbits: symmetryOrbits(h as never).orbit }));
    const want = once(g);
    for (const seed of [7, 1234567]) expect(once(shuffled(g, seed))).toBe(want);
  });
});
