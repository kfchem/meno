import { describe, expect, it } from "vitest";
import {
  ABBREVIATIONS,
  abbreviationOf,
  abbreviationStructure,
  labelRuns,
  labelUnits,
  labelProblem,
  namesRingFirst,
  reversedLabel,
  setCustomAbbreviations,
  structureProblem,
} from "./abbreviations";
import { substitutedAryl } from "./substitutedAryl";
import { writeSmiles } from "./smiles";
import { implicitHydrogens } from "./molecule";
import { readSmiles } from "./smiles";

describe("SMILES, read", () => {
  it("reads branches, ring closures and aromatic bonds", () => {
    const benzoic = readSmiles("OC(=O)c1ccccc1");
    expect(benzoic.atoms.map((a) => a.el)).toEqual(["O", "C", "O", "C", "C", "C", "C", "C", "C"]);
    expect(benzoic.bonds.filter((b) => b.order === 2)).toHaveLength(1);
    // the ring's six bonds aromatic, its closure among them
    expect(benzoic.bonds.filter((b) => b.order === 4)).toHaveLength(6);
  });

  it("reads bracket atoms: element, hydrogens, charge, isotope", () => {
    const nitro = readSmiles("*[N+](=O)[O-]");
    expect(nitro.atoms).toEqual([{ el: "*" }, { el: "N", hs: 0, charge: 1 }, { el: "O" }, { el: "O", hs: 0, charge: -1 }]);
    expect(readSmiles("[13CH3]").atoms[0]).toEqual({ el: "C", isotope: 13, hs: 3 });
    expect(readSmiles("[Si](C)C").atoms[0]).toEqual({ el: "Si", hs: 0 });
  });

  it("says what it cannot read", () => {
    expect(() => readSmiles("C(C")).not.toThrow();
    expect(() => readSmiles("C1CC")).toThrow(/Unclosed ring/);
    expect(() => readSmiles("C?")).toThrow(/Cannot read/);
  });
});

describe("SMILES, written", () => {
  const roundTrip = (smiles: string) => {
    const read = readSmiles(smiles);
    const atoms = read.atoms.map((a, i) => ({
      el: a.el,
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
      // (what a plain atom has by valence, a bracket one says)
      hs: a.hs ?? Math.max(0, ({ C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, Si: 4 } as Record<string, number>)[a.el] ?? 0) - read.bonds.filter((b) => b.a1 === i || b.a2 === i).reduce((n, b) => n + b.order, 0),
    }));
    return writeSmiles(atoms.map((a) => (a.el === "*" ? { el: "*", hs: 0 } : { ...a, hs: Math.max(0, a.hs) })), read.bonds, 0);
  };

  it("writes a chain with its branches from the *, as an abbreviation's is written", () => {
    expect(roundTrip("*C(=O)OC(C)(C)C")).toBe("*C(=O)OC(C)(C)C");
    expect(roundTrip("*O[Si](C)(C)C(C)(C)C")).toBe("*O[Si](C)(C)C(C)(C)C");
  });

  it("closes rings, writes double and triple bonds, charges and isotopes in brackets", () => {
    expect(roundTrip("*C1=CC=CC=C1")).toBe("*C1=CC=CC=C1");
    expect(roundTrip("*[N+](=O)[O-]")).toBe("*[N+](=O)[O-]");
    expect(roundTrip("*C#N")).toBe("*C#N");
    expect(roundTrip("*[13CH3]")).toBe("*[13CH3]");
    // what it writes reads back as the same atoms and bonds
    const fused = "*C1CCC2CCCCC2C1";
    const back = readSmiles(roundTrip(fused));
    expect([back.atoms.length, back.bonds.length]).toEqual([11, 12]);
  });
});

describe("the abbreviations", () => {
  it("have IUPAC's Table II among them, marked as free to use", () => {
    const free = ABBREVIATIONS.filter((a) => a.free).map((a) => a.label);
    expect(free.sort()).toEqual(["Ac", "Bu", "Cp", "Et", "Me", "Ms", "Ph", "Pr", "Ts", "iBu", "iPr", "s-Bu", "t-Bu"].sort());
  });

  it("each read as a structure attached by one bond, every label once", () => {
    const seen = new Set<string>();
    for (const a of ABBREVIATIONS) {
      const read = readSmiles(a.smiles);
      expect(read.atoms[0].el, a.label).toBe("*");
      expect(read.bonds.filter((b) => b.a1 === 0 || b.a2 === 0), a.label).toHaveLength(1);
      expect(seen.has(a.label), a.label).toBe(false);
      seen.add(a.label);
    }
  });

  it("are found by any of their names", () => {
    expect(abbreviationOf("TBDMS")?.label).toBe("TBS");
    expect(abbreviationOf("OTBDMS")?.label).toBe("OTBS");
    expect(abbreviationOf("COOH")?.label).toBe("CO2H");
    expect(abbreviationOf("tBu")?.label).toBe("t-Bu");
    expect(abbreviationOf("p-Ts")?.label).toBe("Ts");
    expect(abbreviationOf("C6H5")?.label).toBe("Ph");
    expect(abbreviationOf("XYZ")).toBeUndefined();
  });

  it("put together by rule: a group behind O, S or NH, and an ester", () => {
    expect(abbreviationOf("OTBS")?.smiles).toBe("*O[Si](C)(C)C(C)(C)C");
    expect(abbreviationOf("NHBoc")?.name).toBe("tert-butoxycarbonylamino");
    // named as such groups are
    expect(["OMe", "OEt", "Ot-Bu", "OiPr", "OPh", "OBn", "OTMS", "OMs", "CO2Me", "SMe"].map((l) => abbreviationOf(l)?.name)).toEqual([
      "methoxy",
      "ethoxy",
      "tert-butoxy",
      "isopropoxy",
      "phenoxy",
      "benzyloxy",
      "trimethylsilyloxy",
      "methanesulfonyloxy",
      "methoxycarbonyl",
      "methylsulfanyl",
    ]);
    expect(abbreviationOf("SPh")?.smiles).toBe("*Sc1ccccc1");
    expect(abbreviationOf("CO2t-Bu")?.smiles).toBe("*C(=O)OC(C)(C)C");
    // a contracted label behind O: trifluoromethoxy, cyanate
    expect(abbreviationOf("OCF3")?.smiles).toBe("*OC(F)(F)F");
    // as written, however rarely: an S-Boc
    expect(abbreviationOf("SBoc")?.smiles).toBe("*SC(=O)OC(C)(C)C");
    // but Cp only on a metal (IUPAC's Table II), and nothing that makes no molecule with an H before it
    for (const no of ["OCp", "SCp", "NHCp", "CO2Cp", "CH2Cp", "OO", "CO", "CH2", "NH"]) expect(abbreviationOf(no), no).toBeUndefined();
    // (an ester of a contracted label, a chain of nitrogens: read as condensed formulas are, since 2026-10-10 - ./chain)
    expect(abbreviationOf("CO2CF3")?.smiles).toBe("*[C](=[O])[O]C(F)(F)F");
    expect(abbreviationOf("NHNHNH2")?.smiles).toBe("*[NH]NN");
    // none is listed
    expect(ABBREVIATIONS.some((a) => a.label === "OTBS")).toBe(false);
  });

  it("give the structure behind a label, attached by its first atom", () => {
    const otbs = abbreviationStructure("OTBS")!;
    expect(otbs.atoms.map((a) => a.el)).toEqual(["O", "Si", "C", "C", "C", "C", "C", "C"]);
    expect(otbs.attach).toEqual([0]);
    expect(otbs.bonds).toHaveLength(7);
    // a phenyl's ring in Kekulé form
    const ph = abbreviationStructure("Ph")!;
    expect(ph.bonds.map((b) => b.order).sort()).toEqual([1, 1, 1, 2, 2, 2]);
    const ester = abbreviationStructure("CO2Me")!;
    expect(ester.atoms.map((a) => a.el)).toEqual(["C", "O", "O", "C"]);
    expect(ester.bonds.find((b) => b.order === 2)).toBeTruthy();
  });
});

/** A group's formula, in Hill order, its hydrogens by valence (the bond it is attached by counted). */
function formulaOf(label: string): string {
  const s = abbreviationStructure(label)!;
  const sums = s.atoms.map(() => 0);
  for (const b of s.bonds) {
    sums[b.a1] += b.order;
    sums[b.a2] += b.order;
  }
  for (const k of s.attach) sums[k] += 1;
  const count = new Map<string, number>();
  const add = (el: string, n: number) => n && count.set(el, (count.get(el) ?? 0) + n);
  s.atoms.forEach((a, i) => {
    add(a.el, 1);
    add("H", a.hs ?? implicitHydrogens(a.el, sums[i], a.charge ?? 0));
  });
  const order = ["C", "H", ...[...count.keys()].filter((e) => e !== "C" && e !== "H").sort()];
  return order.filter((e) => count.has(e)).map((e) => `${e}${count.get(e)! > 1 ? count.get(e) : ""}`).join("");
}

describe("the groups' structures", () => {
  // each as the substituent it is, worked out by hand from its name
  const formulas: Record<string, string> = {
    Pbf: "C13H17O3S",
    Pmc: "C14H19O3S",
    Mtr: "C10H13O3S",
    Mts: "C9H11O2S",
    Mtt: "C20H17",
    Mmt: "C20H17O",
    DMTr: "C21H19O2",
    Clt: "C19H14Cl",
    Dde: "C10H13O2",
    ivDde: "C13H19O2",
    Dmab: "C20H26NO2",
    Acm: "C3H6NO",
    Xan: "C13H9O",
    Dmb: "C9H11O2",
    Hmb: "C8H9O2",
    Tmob: "C10H13O3",
    Meb: "C8H9",
    Bom: "C8H9O",
    Dnp: "C6H3N2O4",
    Npys: "C5H3N2O2S",
    Nps: "C6H4NO2S",
    Moz: "C9H9O3",
    "2-Cl-Z": "C8H6ClO2",
    "2-Br-Z": "C8H6BrO2",
    Bpoc: "C16H15O2",
    Ddz: "C12H15O4",
    Nsc: "C9H8NO6S",
    Msc: "C4H7O4S",
    Fm: "C14H11",
    Pac: "C8H7O",
    Tfa: "C2F3O",
    Su: "C4H4NO2",
    Pfp: "C6F5",
    Bt: "C6H4N3",
    At: "C5H3N4",
    NAP: "C11H9",
    DMPM: "C9H11O2",
    PMP: "C7H7O",
    MTM: "C2H5S",
    POM: "C6H11O2",
    EE: "C4H9O",
    Lev: "C5H7O2",
    DEIPS: "C7H17Si",
    TDS: "C8H19Si",
    Bs: "C6H4BrO2S",
    "p-Ns": "C6H4NO4S",
    Ses: "C5H13O2SSi",
    Tces: "C2H2Cl3O3S",
    All: "C3H5",
    Vin: "C2H3",
    Hex: "C6H13",
    Oct: "C8H17",
    Ad: "C10H15",
    Dipp: "C12H17",
    Tipp: "C15H23",
    "1-Naph": "C10H7",
    "2-Naph": "C10H7",
    NPhth: "C8H4NO2",
    // and some of the first
    Boc: "C5H9O2",
    Fmoc: "C15H11O2",
    TBDPS: "C16H19Si",
    Ts: "C7H7O2S",
    Bpin: "C6H12BO2",
  };

  it("have their rings as drawn: each ring bond in a five- or six-membered ring", () => {
    for (const a of ABBREVIATIONS) {
      const s = abbreviationStructure(a.label)!;
      const near = s.atoms.map(() => [] as number[]);
      for (const b of s.bonds) {
        near[b.a1].push(b.a2);
        near[b.a2].push(b.a1);
      }
      for (const b of s.bonds) {
        const seen = new Map([[b.a1, 0]]);
        const queue = [b.a1];
        while (queue.length && !seen.has(b.a2)) {
          const u = queue.shift()!;
          for (const w of near[u]) {
            if (seen.has(w) || (u === b.a1 && w === b.a2)) continue;
            seen.set(w, seen.get(u)! + 1);
            queue.push(w);
          }
        }
        if (seen.has(b.a2)) expect(seen.get(b.a2)! + 1, a.label).toBeLessThanOrEqual(6);
      }
    }
  });

  it("have the formulas their names give them", () => {
    for (const [label, formula] of Object.entries(formulas)) expect(formulaOf(label), label).toBe(formula);
  });

  it("are written behind O as active esters, and found by their peptide names", () => {
    expect(formulaOf("OSu")).toBe("C4H4NO3");
    expect(formulaOf("OPfp")).toBe("C6F5O");
    expect(formulaOf("OBt")).toBe("C6H4N3O");
    expect(abbreviationOf("Bzl")?.label).toBe("Bn");
    expect(abbreviationOf("Tos")?.label).toBe("Ts");
    expect(abbreviationOf("Aloc")?.label).toBe("Alloc");
    expect(abbreviationOf("StBu")?.name).toBe("tert-butylsulfanyl");
    expect(reversedLabel("NPhth")).toBe("PhthN");
  });
});

describe("abbreviations of the user's own", () => {
  const npe = { label: "Npe", also: ["NPE"], name: "2-(4-nitrophenyl)ethyl", smiles: "*CCc1ccc([N+](=O)[O-])cc1" };

  it("are known as Meno's are, by any of their names, and put together by rule", () => {
    try {
      setCustomAbbreviations([npe]);
      expect(abbreviationOf("NPE")?.label).toBe("Npe");
      expect(abbreviationStructure("Npe")!.atoms).toHaveLength(11);
      expect(abbreviationOf("ONpe")?.smiles).toBe("*OCCc1ccc([N+](=O)[O-])cc1");
      expect(abbreviationOf("CO2Npe")?.name).toBe("2-(4-nitrophenyl)ethoxycarbonyl");
      // read as one unit: on the left of a bond, NpeO
      expect(reversedLabel("ONpe")).toBe("NpeO");
    } finally {
      setCustomAbbreviations([]);
    }
    expect(abbreviationOf("Npe")).toBeUndefined();
  });

  it("are not written as an element, nor as a label that already means something", () => {
    expect(labelProblem("Npe")).toBeNull();
    expect(labelProblem("Mmt")).toMatch(/already means 4-methoxytrityl/);
    expect(labelProblem("Ar")).toMatch(/element/);
    expect(labelProblem("Boc")).toMatch(/already means tert-butoxycarbonyl/);
    expect(labelProblem("OTBS")).toMatch(/already means/);
    expect(labelProblem("2,6-diMeBz")).toMatch(/starts with a letter/);
    expect(labelProblem("two words")).toMatch(/no spaces/);
    try {
      setCustomAbbreviations([npe]);
      expect(labelProblem("NPE")).toMatch(/one of yours/);
      // the one being changed keeps its names
      expect(labelProblem("NPE", npe)).toBeNull();
    } finally {
      setCustomAbbreviations([]);
    }
  });

  it("are given a structure with one * bonded to the atom they are attached by", () => {
    expect(structureProblem(npe.smiles)).toBeNull();
    expect(structureProblem("CC")).toMatch(/one "\*"/);
    expect(structureProblem("*C*")).toMatch(/one "\*"/);
    expect(structureProblem("C(*)(*)")).toMatch(/one "\*"/);
    expect(structureProblem("*")).toMatch(/at least one atom/);
    expect(structureProblem("*C?")).toMatch(/cannot be read/);
  });
});

describe("substituted aryl groups", () => {
  it("read positions, a multiplying prefix and the substituent before the group", () => {
    expect(substitutedAryl("2,6-diMeBz")).toEqual({ smiles: "*C(=O)c1c(C)cccc1(C)", name: "2,6-dimethylbenzoyl" });
    expect(substitutedAryl("4-MeOPh")).toEqual({ smiles: "*c1ccc(OC)cc1", name: "4-methoxyphenyl" });
    expect(substitutedAryl("p-ClBn")).toEqual({ smiles: "*Cc1ccc(Cl)cc1", name: "4-chlorobenzyl" });
    expect(substitutedAryl("4-MeO-3-NO2Ph")?.name).toBe("4-methoxy-3-nitrophenyl");
    expect(substitutedAryl("3,5-(CF3)2Ph")?.name).toBe("3,5-ditrifluoromethylphenyl");
  });

  it("read the ring as a formula, its substituents with their counts before it", () => {
    expect(substitutedAryl("4-MeOC6H4")?.smiles).toBe(substitutedAryl("4-MeOPh")?.smiles);
    expect(substitutedAryl("2,6-Me2C6H3")?.smiles).toBe("*c1c(C)cccc1(C)");
    expect(substitutedAryl("3,5-(CF3)2C6H3")?.smiles).toBe("*c1cc(C(F)(F)F)cc(C(F)(F)F)c1");
    expect(substitutedAryl("2,4,6-iPr3C6H2")?.name).toBe("2,4,6-triisopropylphenyl");
  });

  it("are none where the positions, counts or hydrogens do not add up", () => {
    for (const no of ["7-MePh", "2,2-diMePh", "2,6-MePh", "2-diMePh", "4-MeOC6H5", "2,6-Me2C6H4", "4-XyzPh", "MeOC6H4", "Ph", "4-Me"]) {
      expect(substitutedAryl(no), no).toBeNull();
    }
  });

  it("are abbreviations, drawn and written out as any other", () => {
    const s = abbreviationStructure("2,6-diMeBz")!;
    expect(s.atoms.map((a) => a.el).join("")).toBe("COCCCCCCCC");
    expect(s.attach).toEqual([0]);
    expect(s.bonds.filter((b) => b.order === 2)).toHaveLength(4);
    expect(namesRingFirst("2,6-diMeBz")).toBe(true);
    expect(namesRingFirst("OTBS")).toBe(false);
  });
});

describe("a label, written", () => {
  it("reads into units, each with its count", () => {
    expect(labelUnits("CO2Me")).toEqual(["C", "O2", "Me"]);
    expect(labelUnits("NHBoc")).toEqual(["N", "H", "Boc"]);
    expect(labelUnits("CH(CH3)2")).toEqual(["C", "H", "(CH3)2"]);
    expect(labelUnits("OTBDPS")).toEqual(["O", "TBDPS"]);
    expect(labelUnits("SiMe3")).toEqual(["Si", "Me3"]);
  });

  it("reads outward from its bond when that comes in from the right (IUPAC GR-2.3)", () => {
    expect(reversedLabel("OTBS")).toBe("TBSO");
    expect(reversedLabel("CO2Me")).toBe("MeO2C");
    expect(reversedLabel("NHBoc")).toBe("BocHN");
    expect(reversedLabel("CF3")).toBe("F3C");
    expect(reversedLabel("CH(CH3)2")).toBe("(H3C)2HC");
    expect(reversedLabel("Bpin")).toBe("pinB");
    expect(reversedLabel("NO2")).toBe("O2N");
  });

  it("keeps a word it does not know whole: Nu on a bond's left is Nu, not uN", () => {
    // (read letter by letter, a nucleophile was written uN, Hal laH, CH2Het tHeH2C)
    expect(labelUnits("Nu")).toEqual(["Nu"]);
    expect(reversedLabel("ONu")).toBe("NuO");
    expect(reversedLabel("Hal")).toBe("Hal");
    expect(reversedLabel("CH2Het")).toBe("HetH2C");
    expect(reversedLabel("Xx")).toBe("Xx");
    // (an element's two letters first, and no further than a group's name or a prefix)
    expect(labelUnits("SnBu3")).toEqual(["Sn", "Bu3"]);
    expect(labelUnits("Bpin")).toEqual(["B", "pin"]);
    expect(labelUnits("OiPr")).toEqual(["O", "iPr"]);
    expect(labelUnits("Ot-Bu")).toEqual(["O", "t-Bu"]);
  });

  it("sets counts as subscripts and an ending charge as a superscript", () => {
    expect(labelRuns("CO2Me")).toEqual([{ text: "CO" }, { text: "2", sub: true }, { text: "Me" }]);
    expect(labelRuns("NMe3+")).toEqual([{ text: "NMe" }, { text: "3", sub: true }, { text: "+", sup: true }]);
    expect(labelRuns("MeO2C")).toEqual([{ text: "MeO" }, { text: "2", sub: true }, { text: "C" }]);
    expect(labelRuns("CH(CH3)2")).toEqual([
      { text: "CH(CH" },
      { text: "3", sub: true },
      { text: ")" },
      { text: "2", sub: true },
    ]);
  });

  it("sets s-, t-, o-, m- and p- in italics, as IUPAC's Table II prefers, and iPr upright", () => {
    expect(labelRuns("t-Bu")).toEqual([{ text: "t", italic: true }, { text: "-Bu" }]);
    expect(labelRuns("s-Bu")).toEqual([{ text: "s", italic: true }, { text: "-Bu" }]);
    expect(labelRuns("iPr")).toEqual([{ text: "iPr" }]);
    expect(labelRuns("p-Ts")).toEqual([{ text: "p", italic: true }, { text: "-Ts" }]);
    expect(labelRuns("p-ClBn")).toEqual([{ text: "p", italic: true }, { text: "-ClBn" }]);
    expect(labelRuns("CO2t-Bu")).toEqual([{ text: "CO" }, { text: "2", sub: true }, { text: "t", italic: true }, { text: "-Bu" }]);
    // a ring's positions are no counts
    expect(labelRuns("2,6-Me2C6H3")).toEqual([
      { text: "2,6-Me" },
      { text: "2", sub: true },
      { text: "C" },
      { text: "6", sub: true },
      { text: "H" },
      { text: "3", sub: true },
    ]);
  });
});
