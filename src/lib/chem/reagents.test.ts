import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "./acs";
import { abbreviationOf, abbreviationStructure, byRule, italicUnits, labelRuns, labelUnits, precatalystDrawn } from "./abbreviations";
import { wedgeNarrowAtom } from "./layout2d";
import { placedAbbreviation } from "./abbreviationPlace";
import { structureFormula, type GroupStructure } from "./ligands";
import { implicitHydrogens, valenceOrder } from "./molecule";
import { REAGENTS } from "./reagents";
import { readSmiles } from "./smiles";

const of = (label: string) => abbreviationStructure(label)!;
const formula = (label: string) => structureFormula(of(label));
const charge = (s: GroupStructure) => s.atoms.reduce((q, a) => q + (a.charge ?? 0), 0);
const centres = (s: GroupStructure) => s.atoms.filter((a) => a.tetra).map((a) => a.tetra!.volume);

describe("the reagents", () => {
  // each one's molecular formula, as its name gives it
  const formulas: Record<string, string> = {
    DMP: "C13H13IO8", IBX: "C7H5IO4", PIDA: "C10H11IO4", PIFA: "C10H5F6IO4", TEMPO: "C9H18NO", AZADO: "C9H14NO",
    PCC: "C5H6ClCrNO3", PDC: "C10H12Cr2N2O7", TPAP: "C12H28NO4Ru", NMO: "C5H11NO2", mCPBA: "C7H5ClO3", DDQ: "C8Cl2N2O2",
    Oxone: "H3K5O18S4", OsO4: "O4Os", KMnO4: "KMnO4", MnO2: "MnO2",
    SeO2: "O2Se", CrO3: "CrO3", CAN: "CeH8N8O18", LTA: "C8H12O8Pb", "SO3·py": "C5H5NO3S", DMDO: "C3H6O2",
    TBHP: "C4H10O2", H2O2: "H2O2", O3: "O3", "Davis oxaziridine": "C13H11NO3S",
    LAH: "AlH4Li", STAB: "C6H10BNaO6", DIBAL: "C8H19Al", "Red-Al": "C6H16AlNaO4", "L-Selectride": "C12H28BLi",
    "K-Selectride": "C12H28BK", "Super-Hydride": "C6H16BLi", "9-BBN": "C8H15B", HBcat: "C6H5BO2",
    B2pin2: "C12H24B2O4", TTMSS: "C9H28Si4", HEH: "C13H19NO4",
    DBU: "C9H16N2", DBN: "C7H12N2", TBD: "C7H13N3", DMAP: "C7H10N2", DIPEA: "C8H19N", TEA: "C6H15N", DABCO: "C6H12N2",
    NMM: "C5H11NO", "2,6-lutidine": "C7H9N", collidine: "C8H11N", "Proton-Sponge": "C14H18N2", TMG: "C5H13N3",
    imidazole: "C3H4N2", LDA: "C6H14LiN", LiHMDS: "C6H18LiNSi2", NaHMDS: "C6H18NNaSi2", KHMDS: "C6H18KNSi2",
    LiTMP: "C9H18LiN",
    TFA: "C2HF3O2", PTSA: "C7H8O3S", CSA: "C10H16O4S", PPTS: "C12H13NO3S", H2SO4: "H2O4S",
    DCC: "C13H22N2", DIC: "C7H14N2", EDC: "C8H17N3", HATU: "C10H15F6N6OP",
    HBTU: "C11H16F6N5OP", TBTU: "C11H16BF4N5O", COMU: "C12H19F6N4O4P", PyBOP: "C18H28F6N6OP2", BOP: "C12H22F6N6OP2",
    T3P: "C9H21O6P3", CDI: "C7H6N4O", DMTMM: "C10H17ClN4O3", Oxyma: "C5H6N2O3", NHS: "C4H5NO3",
    "Yamaguchi reagent": "C7H2Cl4O", "Mukaiyama reagent": "C6H7ClIN", DPPA: "C12H10N3O3P", DEAD: "C6H10N2O4",
    DIAD: "C8H14N2O4",
    NBS: "C4H4BrNO2", NCS: "C4H4ClNO2", NIS: "C4H4INO2", DBDMH: "C5H6Br2N2O2", TCCA: "C3Cl3N3O3",
    Selectfluor: "C7H14B2ClF9N2", NFSI: "C12H10FNO4S2", DAST: "C4H10F3NS", "Deoxo-Fluor": "C6H14F3NO2S",
    "Togni I": "C10H10F3IO", "Togni II": "C8H4F3IO2", "Ruppert–Prakash reagent": "C4H9F3Si", "Langlois reagent": "CF3NaO2S", SOCl2: "Cl2OS",
    POCl3: "Cl3OP", PCl5: "Cl5P",
    TFAA: "C4F6O3",
    "Comins' reagent": "C7H3ClF6N2O4S2", HMDS: "C6H19NSi2", "Meerwein's salt": "C3H9BF4O", "Eschenmoser's salt": "C3H8IN",
    TMSCHN2: "C4H10N2Si", CH2N2: "CH2N2", "Mander's reagent": "C3H3NO2",
    "Tebbe reagent": "C13H18AlClTi", "Petasis reagent": "C12H16Ti", "Schwartz's reagent": "C10H11ClZr",
    "Stryker's reagent": "C108H96Cu6P6", Me2CuLi: "C2H6CuLi",
    "Grubbs I": "C43H72Cl2P2Ru", "Grubbs II": "C46H65Cl2N2PRu", "Grubbs III": "C38H42Cl2N4Ru", "HG-I": "C28H45Cl2OPRu",
    "HG-II": "C31H38Cl2N2ORu", "Schrock's catalyst": "C30H35F12MoNO2", "Wilkinson's catalyst": "C54H45ClP3Rh",
    "Crabtree's catalyst": "C31H50F6IrNP2", "PEPPSI-IPr": "C32H40Cl3N3Pd", "Jacobsen's catalyst": "C36H52ClMnN2O2",
    "Karstedt's catalyst": "C24H54O3Pt2Si6", "Krische's catalyst": "C48H36IrNO8P2",
    proline: "C5H9NO2", "MacMillan's catalyst I": "C13H18N2O", "MacMillan's catalyst II": "C15H22N2O",
    "Hayashi–Jørgensen catalyst": "C20H27NOSi", CBS: "C18H20BNO", "Shi's catalyst": "C12H18O6",
    DMF: "C3H7NO", DMSO: "C2H6OS", DMA: "C4H9NO", NMP: "C5H9NO", HMPA: "C6H18N3OP", DMPU: "C6H12N2O", DME: "C4H10O2",
    diglyme: "C6H14O3", DCM: "CH2Cl2", DCE: "C2H4Cl2", MTBE: "C5H12O", CPME: "C6H12O", "2-MeTHF": "C5H10O",
    dioxane: "C4H8O2", acetone: "C3H6O", toluene: "C7H8", benzene: "C6H6", hexane: "C6H14",
    pentane: "C5H12", IPA: "C3H8O", HFIP: "C3H2F6O", TFE: "C2H3F3O",
    "Burgess reagent": "C8H18N2O4S", "Martin sulfurane": "C30H20F12O2S", "Lawesson's reagent": "C14H14O2P2S4",
    "Bestmann–Ohira reagent": "C5H9N2O4P", "Me3S(O)I": "C3H9IOS", TBAF: "C16H36FN", TBAI: "C16H36IN", TBAB: "C16H36BrN",
  };

  it("are each the molecule their names give, neutral as a whole", () => {
    expect(Object.keys(formulas).sort()).toEqual(REAGENTS.map((r) => r.label).sort());
    for (const r of REAGENTS) {
      expect(abbreviationOf(r.label)?.kind, r.label).toBe("reagent");
      expect(formula(r.label), r.label).toBe(formulas[r.label]);
      expect(charge(of(r.label)), r.label).toBe(0);
      expect(of(r.label).attach, r.label).toEqual([]);
    }
  });

  it("hold nothing the rules read as the same molecule (Ac2O, KOt-Bu, HOBt: by rule)", () => {
    for (const r of REAGENTS) {
      for (const name of [r.label, ...(r.also ?? [])]) {
        const made = byRule(name);
        if (made) expect(structureFormula(made), name).not.toBe(formula(r.label));
      }
    }
  });

  it("are known by each of their names, none of them another abbreviation's", () => {
    const names = REAGENTS.flatMap((r) => [r.label, ...(r.also ?? [])]);
    expect(new Set(names).size).toBe(names.length);
    for (const r of REAGENTS) for (const name of r.also ?? []) expect(abbreviationOf(name)?.label, name).toBe(r.label);
    // a dash and an apostrophe, as typed or as set
    expect(abbreviationOf("Hoveyda-Grubbs II")?.label).toBe("HG-II");
    expect(abbreviationOf("Comins’ reagent")?.label).toBe("Comins' reagent");
    // a name is one unit of a label, its digits not counts; a formula's are
    expect(labelUnits("T3P")).toEqual(["T3P"]);
    expect(labelRuns("NaBH4").some((r) => r.sub && r.text === "4")).toBe(true);
    // another name written as a formula has its counts; a precatalyst's generation is no count
    expect(labelRuns("Et3N")).toEqual([{ text: "Et" }, { text: "3", sub: true }, { text: "N" }]);
    expect(labelRuns("XPhos Pd G3")).toEqual([{ text: "XPhos Pd G3" }]);
    // a descriptor's R and S in italics, as IUPAC sets them - marked as the
    // label's units are read, so that a label split at its bond keeps them
    expect(italicUnits(labelUnits("(1S)-CSA"))).toEqual([true, false, false]);
    expect(labelRuns("(S,S)-DPEN")).toEqual([
      { text: "(" },
      { text: "S", italic: true },
      { text: "," },
      { text: "S", italic: true },
      { text: ")-DPEN" },
    ]);
  });

  it("bind a metal's alkylidene by a double bond, and a bridging ligand to each of its metals", () => {
    const g1 = of("Grubbs I");
    const ru = g1.atoms.findIndex((a) => a.el === "Ru");
    const toRu = g1.bonds.filter((b) => b.a1 === ru || b.a2 === ru);
    expect(toRu.filter((b) => b.order === 2)).toHaveLength(1);
    expect(toRu.filter((b) => b.coordination)).toHaveLength(2);
    expect(formula("RuCl2(=CHPh)(PCy3)2")).toBe("C43H72Cl2P2Ru");
    // Karstedt's: each platinum bound to three C=C, one of them the bridging ligand's
    const pt2 = of("Karstedt's catalyst");
    const pts = pt2.atoms.flatMap((a, i) => (a.el === "Pt" ? [i] : []));
    expect(pts.map((p) => pt2.bonds.filter((b) => b.endpoints && b.a1 === p).length)).toEqual([3, 3]);
  });
});

describe("configurations", () => {
  it("are read from @ and @@ as the layout engine takes them, the H last", () => {
    // (each checked against a 3D embedding: the sign of the first three's volume)
    const tetra = (smiles: string) => readSmiles(smiles).atoms.flatMap((a, i) => (a.tetra ? [[i, a.tetra.neighbours, a.tetra.volume]] : []));
    expect(tetra("N[C@@H](C)C(=O)O")).toEqual([[1, [0, 2, 3, -1], -1]]);
    expect(tetra("[C@@H](N)(C)C(=O)O")).toEqual([[0, [1, 2, 3, -1], 1]]);
    expect(tetra("C1CC[C@H]2CCCC[C@@H]2C1")).toEqual([
      [3, [2, 8, 4, -1], 1],
      [8, [7, 3, 9, -1], -1],
    ]);
    expect(tetra("F[C@]1(Br)CCC1Cl")).toEqual([[1, [0, 5, 2, 3], 1]]);
    // a centre of three is none
    expect(tetra("C[S@](=O)CC")).toEqual([]);
  });

  it("are as a descriptor names them: the SMILES's, its mirror image, or none", () => {
    expect(centres(of("(S,S)-DPEN"))).toEqual([-1, -1]);
    expect(centres(of("(R,R)-DPEN"))).toEqual([1, 1]);
    // none said, none kept; (±) the same
    expect(centres(of("DPEN"))).toEqual([]);
    expect(centres(of("(±)-CSA"))).toEqual([]);
    expect(abbreviationOf("(R,R)-DPEN")?.name).toBe("(R,R)-1,2-diphenylethylenediamine");
    expect(centres(of("L-proline"))).toEqual(centres(of("(S)-proline")));
    expect(centres(of("D-proline"))).toEqual(centres(of("L-proline")).map((v) => -v));
    // a reagent named as one enantiomer has it without a descriptor
    expect(centres(of("Shi's catalyst"))).toHaveLength(3);
    // an axial one's descriptor is its axis's, not its atoms': turned one way or the other
    expect(formula("(S)-BINAP")).toBe("C44H32P2");
    expect(centres(of("(S)-BINAP"))).toEqual([]);
    expect(of("(S)-BINAP").axes!.map((a) => a.sense)).toEqual(of("(R)-BINAP").axes!.map((a) => -a.sense));
    expect(of("BINAP").axes).toBeUndefined();
    // a descriptor that names no enantiomer of it
    for (const no of ["(S)-DMP", "(R)-DPEN", "(R,R)-Shi's catalyst", "L-PPh3"]) expect(abbreviationOf(no), no).toBeUndefined();
    // a reagent's own ligand keeps its configuration, mirrored with the reagent
    expect(centres(of("(R,R)-Jacobsen's catalyst"))).toEqual(centres(of("(S,S)-Jacobsen's catalyst")).map((v) => -v));
    expect(centres(of("(R,R)-Jacobsen's catalyst"))).toHaveLength(2);
    // and in a complex's formula, a ligand with its descriptor
    expect(formula("RuCl[(S,S)-TsDPEN](p-cymene)")).toBe("C31H35ClN2O2RuS");
    expect(centres(of("RuCl[(S,S)-TsDPEN](p-cymene)"))).toEqual([-1, -1]);
    expect(formula("RuCl2[(S)-BINAP][(S,S)-DPEN]")).toBe("C58H48Cl2N2P2Ru");
  });

  it("are drawn with wedges where an abbreviation is written out, each narrow at its centre", () => {
    const proline = placedAbbreviation("L-proline", null, L)!;
    const wedges = proline.bonds.filter((b) => b.stereo === "up" || b.stereo === "down");
    expect(wedges).toHaveLength(1);
    const degree = new Map<number, number>();
    for (const b of proline.bonds) for (const at of [b.a1, b.a2]) degree.set(at, (degree.get(at) ?? 0) + 1);
    // (the centre is atom 3: OC(=O)[C@@H]1CCCN1)
    expect(wedgeNarrowAtom({ ...wedges[0], stereoOrient: wedges[0].stereoOrient ?? "principle" }, degree)).toBe(3);
    // a centre at a ring fusion gets its H drawn, the wedge on it
    const cbs = placedAbbreviation("(S)-CBS", null, L)!;
    expect(cbs.atoms.filter((a) => a.el === "H")).toHaveLength(1);
    // a cage in perspective: its atoms' depth, its centres shown by the drawing
    const csa = placedAbbreviation("(1S)-CSA", null, L)!;
    expect(csa.atoms.filter((a) => a.stereoCentre)).toHaveLength(2);
    expect(csa.atoms.some((a) => a.z != null)).toBe(true);
  });
});

describe("simple formulas, read by rule", () => {
  it("are molecules: a centre and its valence's groups, or two univalent parts", () => {
    const cases: Record<string, string> = {
      "i-Pr2NEt": "C8H19N", "n-BuLi": "C4H9Li", MeMgBr: "CH3BrMg", Bu3SnH: "C12H28Sn", TMSCl: "C3H9ClSi",
      TBSOTf: "C7H15F3O3SSi", "(Boc)2O": "C10H18O5", CH2Cl2: "CH2Cl2", CHCl3: "CHCl3", MeOH: "CH4O", AcOH: "C2H4O2",
      HCO2H: "CH2O2", H2: "H2", HCl: "ClH", TMSCN: "C4H9NSi", "Fmoc-OSu": "C19H15NO5", PhH: "C6H6", BnBr: "C7H7Br",
      Et2O: "C4H10O", AlCl3: "AlCl3", BBr3: "BBr3", NH3: "H3N", H2O: "H2O",
      // (once in the dictionary, now read so)
      Ac2O: "C4H6O3", Boc2O: "C10H18O5", Tf2O: "C2F6O5S2", PhNTf2: "C8H5F6NO4S2", TfOH: "CHF3O3S", TsOH: "C7H8O3S",
      HOBt: "C6H5N3O", HOAt: "C5H4N4O", HBpin: "C6H13BO2", EtOAc: "C4H8O2", "KOt-Bu": "C4H9KO", NaH: "HNa",
      NaOCl: "ClNaO", Et3N: "C6H15N", TMSCF3: "C4H9F3Si", "Pb(OAc)4": "C8H12O8Pb",
    };
    for (const [label, f] of Object.entries(cases)) {
      expect(abbreviationOf(label)?.kind, label).toBe("reagent");
      expect(formula(label), label).toBe(f);
    }
    // its name: its molecular formula
    expect(abbreviationOf("TMSCl")?.name).toBe("C3H9ClSi");
  });

  it("bind sodium and potassium as ions, and lithium so but to carbon", () => {
    const ions = (label: string) => of(label).atoms.filter((a) => a.charge).map((a) => `${a.el}${a.charge! > 0 ? "+" : "-"}`).sort();
    expect(ions("NaOMe")).toEqual(["Na+", "O-"]);
    expect(ions("LiOH")).toEqual(["Li+", "O-"]);
    expect(ions("NaH")).toEqual(["H-", "Na+"]);
    expect(ions("KCN")).toEqual(["C-", "K+"]);
    expect(ions("NaN3").filter((x) => x === "N-")).toHaveLength(2);
    expect(ions("n-BuLi")).toEqual([]);
    expect(of("n-BuLi").bonds.some((b) => of("n-BuLi").atoms[b.a2].el === "Li" || of("n-BuLi").atoms[b.a1].el === "Li")).toBe(true);
  });

  it("are salts: alkali metals, and the anion the rest makes, as charged as they are many", () => {
    const cases: Record<string, string> = {
      // (once in the dictionary, now read so)
      NaBH4: "BH4Na", LiBH4: "BH4Li", LiAlH4: "AlH4Li", NaBH3CN: "CH3BNNa", "NaBH(OAc)3": "C6H10BNaO6",
      "LiAlH(Ot-Bu)3": "C12H28AlLiO3", LiBHEt3: "C6H16BLi", NaIO4: "INaO4", NaClO2: "ClNaO2", K2CO3: "CK2O3",
      Cs2CO3: "CCs2O3", Na2CO3: "CNa2O3", NaHCO3: "CHNaO3", K3PO4: "K3O4P", CF3SO2Na: "CF3NaO2S",
      // and their like
      NaBF4: "BF4Na", KPF6: "F6KP", LiClO4: "ClLiO4", NaBPh4: "C24H20BNa", Na2SO4: "Na2O4S", NaH2PO4: "H2NaO4P",
    };
    for (const [label, f] of Object.entries(cases)) {
      expect(abbreviationOf(label)?.kind, label).toBe("reagent");
      expect(formula(label), label).toBe(f);
      expect(charge(of(label)), label).toBe(0);
    }
    const ions = (label: string) => of(label).atoms.filter((a) => a.charge).map((a) => `${a.el}${a.charge! > 0 ? "+" : "-"}`).sort();
    expect(ions("NaBH4")).toEqual(["B-", "Na+"]);
    expect(ions("K2CO3")).toEqual(["K+", "K+", "O-", "O-"]);
    // an acid's hydrogens on its oxygens; a borate's on its boron
    const hOn = (label: string, el: string) => of(label).atoms.filter((a) => a.el === el).reduce((n, a) => n + (a.hs ?? 0), 0);
    expect(hOn("NaHCO3", "O")).toBe(1);
    expect(hOn("NaBH(OAc)3", "B")).toBe(1);
  });

  it("are none where a valence is left free: those are groups", () => {
    for (const no of ["OMe", "NMe2", "CH2Br", "SiMe3", "TBSO", "BocHN", "MeO2C", "Cl", "Me", "R3N", "ArBr"]) {
      expect(abbreviationOf(no)?.kind, no).not.toBe("reagent");
    }
  });

  it("join an adduct's known parts, each as often as its count", () => {
    expect(formula("BF3·OEt2")).toBe("C4H10BF3O");
    expect(formula("CeCl3·7H2O")).toBe("CeCl3H14O7");
    expect(formula("EDC·HCl")).toBe("C8H18ClN3");
    expect(formula("BH3·THF")).toBe("C4H11BO");
    expect(abbreviationOf("BF3·Foo")).toBeUndefined();
  });

  it("make a Buchwald precatalyst of its phosphine and its generation", () => {
    expect(formula("XPhos Pd G2")).toBe("C45H59ClNPPd");
    expect(formula("XPhos-Pd-G3")).toBe("C46H62NO3PPdS");
    expect(formula("SPhos Pd G4")).toBe("C40H50NO5PPdS");
    // (any of Meno's Buchwald ligands: AdBrettPhos Pd G3 as it is sold)
    expect(formula("AdBrettPhos Pd G3")).toBe("C56H74NO5PPdS");
    // each generation drawn as itself, its phosphine an L
    for (const g of ["G2", "G3", "G4"]) {
      const pic = precatalystDrawn(g)!;
      expect(pic.atoms.filter((x) => x.el === "L"), g).toHaveLength(1);
      expect(pic.atoms.some((x) => x.el === "P"), g).toBe(false);
      expect(pic.atoms.some((x) => x.el === "Pd"), g).toBe(true);
    }
    // (a chelating one has no such palladacycle)
    expect(abbreviationOf("dppf Pd G3")).toBeUndefined();
  });
});

describe("hydrogens as a drawing counts them", () => {
  it("take a carbon's lent pair as two of its valence", () => {
    expect(valenceOrder({ order: 1, coordination: true }, "C")).toBe(2);
    expect(valenceOrder({ order: 1, coordination: true }, "P")).toBe(0);
    expect(valenceOrder({ order: 1, dative: true }, "C")).toBe(2);
    expect(valenceOrder({ order: 2 }, "C")).toBe(2);
    // an NHC's carbene carbon, bound to a metal: two ring bonds and its pair
    expect(implicitHydrogens("C", 2 + valenceOrder({ order: 1, coordination: true }, "C"))).toBe(0);
  });

  it("are drawn as atoms where a structure says more, and a radical or a valence where fewer", () => {
    const tin = placedAbbreviation("Bu3SnH", null, L)!;
    expect(tin.atoms.filter((a) => a.el === "H")).toHaveLength(1);
    const tempo = placedAbbreviation("TEMPO", null, L)!;
    expect(tempo.atoms.find((a) => a.el === "O")!.radical).toBe("doublet");
    // a ligand label's donor lends its pair: the bond to it, a coordination bond
    const ipr = placedAbbreviation("IPr", { x: -L, y: 0 }, L)!;
    expect(ipr.lends).toEqual([true]);
    // acac's: its enolate O an anion's, bound covalently; its C=O O lends
    expect(placedAbbreviation("acac", { x: -L, y: 0 }, L)!.lends).toEqual([false, true]);
  });

  it("let the kekulizer read an [nH] and a charged N", () => {
    expect(formula("imidazole")).toBe("C3H4N2");
    expect(formula("Mukaiyama reagent")).toBe("C6H7ClIN");
  });
});
