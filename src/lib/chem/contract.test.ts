import { describe, expect, it } from "vitest";
import { picturedStructure } from "./abbreviationPlace";
import { GROUPS, abbreviationOf, abbreviationStructure, labelUnits, reversedLabel } from "./abbreviations";
import { ELEMENTS } from "./elements";
import { implicitHydrogens } from "./molecule";
import { isMetal } from "../layout/perceive";
import { counterIonStructure, ligandPicture, namedLigand } from "./ligands";
import { atomWithGroups, contractGraph, contractionTrials, contractions, shapeOf, shapeOfStructure, type ContractGraph } from "./contract";
import { kekuleOrders } from "./kekulize";
import { readSmiles } from "./smiles";
import { smilesStructure } from "./reagents";
import { measured } from "../../testing/timeouts";

const fromSmiles = (smiles: string): ContractGraph => {
  const r = readSmiles(smiles);
  const orders = kekuleOrders(r.atoms, r.bonds);
  return contractGraph(r.atoms, r.bonds.map((b, i) => ({ ...b, order: orders[i] })));
};
const fromLabel = (label: string): ContractGraph => {
  const s = abbreviationStructure(label)!;
  return contractGraph(s.atoms, s.bonds);
};
/** The labels written, sorted. */
const written = (g: ContractGraph, keep?: Set<number>) => contractions(g, keep).map((c) => c.label).sort();

const TAXOL =
  "CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C";

describe("contractions", () => {
  it("writes a protecting group by name wherever it hangs, with the atom it hangs by", () => {
    expect(written(fromSmiles("CCO[Si](C)(C)C(C)(C)C"))).toEqual(["OTBS"]);
    expect(written(fromSmiles("CC(C)(C)OC(=O)NCC(=O)O"))).toEqual(["NHBoc"]);
    expect(written(fromSmiles("c1ccccc1B1OC(C)(C)C(C)(C)O1"))).toEqual(["Bpin"]);
    expect(written(fromSmiles("C#C[Si](C)(C)C"))).toEqual(["TMS"]);
    // on a carbon by a carbon, something else: a tert-butyl ester, a methoxymethyl
    expect(written(fromSmiles("c1ccccc1CCC(=O)OC(C)(C)C"))).toEqual([]);
    expect(written(fromSmiles("c1ccccc1CCCOC"))).toEqual([]);
  });

  it("draws the group's own reagent, the rest of it one atom or none", () => {
    for (const smiles of [
      "O[Si](C)(C)C(C)(C)C", // TBSOH
      "Cc1ccc(cc1)S(=O)(=O)Cl", // TsCl
      "CC(C)(C)OC(=O)OC(=O)OC(C)(C)C", // Boc2O
      "CC1(C)OB(OC1(C)C)B1OC(C)(C)C(C)(C)O1", // B2pin2
    ]) {
      expect(written(fromSmiles(smiles)), smiles).toEqual([]);
    }
  });

  it("writes other named groups on a heteroatom by name only where they are a small part of the molecule", () => {
    // aspirin's acetyl is a quarter of it; taxol's are not a tenth
    expect(written(fromSmiles("CC(=O)Oc1ccccc1C(=O)O"))).toEqual([]);
    expect(written(fromSmiles("CC(=O)Nc1ccc(O)cc1"))).toEqual([]);
    expect(written(fromSmiles(TAXOL))).toEqual(["NHBz", "OAc", "OAc", "OBz"]);
    // methyl and ethyl, drawn always
    expect(written(fromSmiles("CCN(CC)CC"))).toEqual([]);
    expect(written(fromSmiles("C1CCC(CC1)N=C=NC1CCCCC1"))).toEqual([]);
  });

  it("writes a complex's phosphines as chemists write them, a pi system bound to its metal not a group", () => {
    expect(written(fromLabel("Pd(PPh3)4"))).toEqual(["PPh3", "PPh3", "PPh3", "PPh3"]);
    expect(written(fromLabel("Grubbs I"))).toEqual(["PCy3", "PCy3"]);
    expect(written(fromLabel("(R)-BINAP"))).toEqual(["PPh2", "PPh2"]);
    expect(written(fromLabel("dppf"))).toEqual([]);
  });

  it("leaves drawn what it is told to keep, and a kept atom out of its group's label", () => {
    const g = fromSmiles("CCO[Si](C)(C)C(C)(C)C");
    expect(written(g, new Set([3]))).toEqual([]);
    expect(written(g, new Set([2]))).toEqual(["TBS"]);
  });
});

describe("groups written as their formulas", () => {
  it("writes an atom with halogens on it, and a nitro group, by formula wherever it hangs", () => {
    // fluoxetine's CF3 on its ring
    expect(written(fromSmiles("CNCCC(Oc1ccc(cc1)C(F)(F)F)c1ccccc1"))).toEqual(["CF3"]);
    // chloramphenicol's nitro group, and its dichloromethyl
    expect(written(fromSmiles("OC[C@@H](NC(=O)C(Cl)Cl)[C@H](O)c1ccc(cc1)[N+](=O)[O-]"))).toEqual(["CHCl2", "NO2"]);
    // difluoromethyl, pentafluorosulfanyl
    expect(written(fromSmiles("FC(F)c1ccccc1"))).toEqual(["CHF2"]);
    expect(written(fromSmiles("FS(F)(F)(F)(F)c1ccccc1"))).toEqual(["SF5"]);
    // on an O, with it: OCF3
    expect(written(fromSmiles("FC(F)(F)Oc1ccccc1"))).toEqual(["OCF3"]);
  });

  it("counts an H drawn on the atom once: CHCl2 and CHF2 with their H drawn are written as with it not drawn (the chemistry check's ruling)", () => {
    expect(written(fromSmiles("ClC(Cl)c1ccccc1"))).toEqual(["CHCl2"]);
    expect(written(fromSmiles("[H]C(Cl)(Cl)c1ccccc1"))).toEqual(["CHCl2"]);
    expect(written(fromSmiles("[H]C(F)(F)c1ccccc1"))).toEqual(["CHF2"]);
    // (a CH2Cl, one halogen: no group of halogens, its H drawn or not)
    for (const smiles of ["ClCc1ccccc1", "[H]C(Cl)c1ccccc1", "[H]C([H])(Cl)c1ccccc1"]) expect(written(fromSmiles(smiles)), smiles).toEqual(written(fromSmiles("ClCc1ccccc1")));
  });

  it("draws acids, amides, nitriles and sulfonyl groups, and the group's own small molecule", () => {
    // trifluoroacetic acid: its CF3 by formula, its CO2H drawn
    expect(written(fromSmiles("OC(=O)C(F)(F)F"))).toEqual(["CF3"]);
    for (const smiles of [
      "N#Cc1ccccc1", // benzonitrile
      "ClS(=O)(=O)c1ccccc1", // benzenesulfonyl chloride
      "OS(=O)(=O)c1ccccc1", // benzenesulfonic acid
      "OP(O)(=O)c1ccccc1", // phenylphosphonic acid
      "FC(F)(F)I", // CF3I: its rest one atom
      "C[N+](=O)[O-]", // nitromethane
    ]) {
      expect(written(fromSmiles(smiles)), smiles).toEqual([]);
    }
    // the Ruppert-Prakash reagent: its TMS by name, its CF3 then all that is left besides, drawn
    expect(written(fromSmiles("C[Si](C)(C)C(F)(F)F"))).toEqual(["TMS"]);
  });
});

describe("contractionTrials", () => {
  it("tries more groups by name, the largest first, only while each try hides less", () => {
    // a phenyl and two benzyls on carbon: nothing by the rules
    const g = fromSmiles("C(c1ccccc1)(Cc1ccccc1)Cc1ccccc1");
    const trials = contractionTrials(g);
    expect(trials.next().value).toEqual([]);
    const more = trials.next(3);
    expect((more.value as { label: string }[]).map((c) => c.label)).toEqual(["Bn", "Bn"]);
    // hiding no less: no more tries
    expect(trials.next(3).done).toBe(true);
  });

  it("tries nothing more where nothing is hidden", () => {
    const trials = contractionTrials(fromSmiles("CCO[Si](C)(C)C(C)(C)C"));
    trials.next();
    expect(trials.next(0).done).toBe(true);
  });
});

describe("a label of an atom and its groups", () => {
  it("reads PPh2 and PCy2 as phosphorus with the groups that fill its valence", () => {
    const heavy = (label: string) => abbreviationStructure(label)?.atoms.filter((a) => a.el !== "H" && a.el !== "*").length;
    expect(heavy("PPh2")).toBe(13);
    expect(heavy("PCy2")).toBe(13);
    expect(heavy("NBn2")).toBe(15);
    // three on P is the ligand, bound by its lone pair
    expect(abbreviationStructure("PPh3")?.attach).toEqual([0]);
  });

  it("reads an atom and the halogens on it as a group, where they leave it one bond out", () => {
    for (const [label, name] of [
      ["CBr3", "tribromomethyl"],
      ["CHF2", "difluoromethyl"],
      ["CF2Cl", "chlorodifluoromethyl"],
      ["SF5", "pentafluoro-λ6-sulfanyl"],
      ["SiCl3", "trichlorosilyl"],
    ]) {
      expect(abbreviationOf(label)?.name, label).toBe(name);
      expect(abbreviationStructure(label)?.attach, label).toEqual([0]);
    }
    // (molecules, their valence full)
    for (const label of ["PCl3", "SiCl4", "BF3", "CHCl3"]) expect(abbreviationStructure(label)?.attach, label).toEqual([]);
  });
});

describe("an atom and its groups in one label, read as they are", () => {
  // (a long chain to hang them on, so that each group is small beside the molecule)
  const chain = "C".repeat(40);
  const labels = (smiles: string) => {
    const g = fromSmiles(smiles);
    return contractions(g).map((c) => {
      // what Meno reads the label as is the atoms it stands for
      expect(shapeOfStructure(abbreviationStructure(c.label)!), c.label).toBe(shapeOf(g, c.atoms));
      return c.label;
    });
  };

  it("sets a group in parentheses where the atom's symbol and the group's name run together would read as another element (IUPAC GR-2.2, GR-2.3.5)", () => {
    const tBu = "C(C)(C)C";
    // tri-tert-butylphosphine on palladium: P and t-Bu, not Pt
    expect(labels(`P(${tBu})(${tBu})(${tBu})[Pd]P(${tBu})(${tBu})${tBu}`)).toEqual(["P(t-Bu)3", "P(t-Bu)3"]);
    // N and iPr, not Ni; O and s-Bu, not Os; Se and s-Bu, not the Ses group
    expect(labels(`CC(C)N(C(C)C)c1ccc(${chain})cc1`)).toEqual(["N(iPr)2"]);
    expect(labels(`CCC(C)Oc1ccc(${chain})cc1`)).toEqual(["O(s-Bu)"]);
    expect(labels(`CCC(C)[Se]c1ccc(${chain})cc1`)).toEqual(["Se(s-Bu)"]);
    // drawn at a left end, the units turned round, the group still whole
    expect(reversedLabel("P(t-Bu)3")).toBe("(t-Bu)3P");
    expect(reversedLabel("N(iPr)2")).toBe("(iPr)2N");
  });

  it("leaves a label that reads as it is run together", () => {
    const iPr = "C(C)C";
    expect(labels(`P(${iPr})(${iPr})(${iPr})[Pd]P(${iPr})(${iPr})${iPr}`)).toEqual(["PiPr3", "PiPr3"]);
    expect(labels(`${chain}P(C1CCCCC1)C1CCCCC1`)).toEqual(["PCy2"]);
    expect(labels(`CC(C)(C)[Si](C)(C)Oc1ccc(${chain})cc1`)).toEqual(["OTBS"]);
  });

  it("writes every group on every atom the rules allow so that Meno reads it back as the same atoms, the atom first", () => {
    // (each atom that is no carbon, no H and no metal, with each of the
    //  dictionary's groups - as many as its valence leaves beside the bond
    //  to the rest - on a rest heavy enough that each group is small)
    const starts = ELEMENTS.map((e) => e.symbol).filter((el) => el !== "C" && el !== "H" && !isMetal(el) && implicitHydrogens(el, 1) >= 1);
    let merged = 0;
    for (const el of starts) {
      for (const group of GROUPS) {
        if (!group.smiles.startsWith("*")) continue;
        for (let n = 1; n <= implicitHydrogens(el, 1); n++) {
          const g = fromSmiles(`${chain}${chain}[${el}]${`(${group.smiles.slice(1)})`.repeat(n)}`);
          for (const c of contractions(g)) {
            const read = abbreviationStructure(c.label);
            expect(read && shapeOfStructure(read), `${el} ${group.label} x${n}: ${c.label}`).toBe(shapeOf(g, c.atoms));
            // (the atom itself, after the chain, with its groups - not a group of the dictionary's it makes, Si and three Me a TMS)
            if (c.at !== 2 * chain.length || GROUPS.some((x) => x.label === c.label)) continue;
            merged++;
            // the atom's symbol a unit of its own, first - and last, at a left end
            expect(labelUnits(c.label)[0], c.label).toBe(el);
            const turned = labelUnits(reversedLabel(c.label));
            expect(turned[turned.length - 1], c.label).toBe(el);
          }
        }
      }
    }
    expect(merged).toBeGreaterThan(500);
  }, 60_000);

  it("writes a label only where it is read as the atoms it stands for", () => {
    // (Ses is a group's name: Se and s-Bu run together are read as it)
    const shape = shapeOfStructure(abbreviationStructure("Se(s-Bu)")!);
    expect(atomWithGroups("Se", 0, "s-Bu", 1, shape)).toBe("Se(s-Bu)");
    expect(atomWithGroups("P", 0, "Ph", 3, shapeOfStructure(abbreviationStructure("PPh3")!))).toBe("PPh3");
    expect(atomWithGroups("P", 0, "Ph", 3, shape)).toBeNull();
  });
});

describe("the dictionary's pictures", () => {
  const labelsIn = (label: string) =>
    picturedStructure(abbreviationStructure(label)!, 1)
      .atoms.map((a) => a.el)
      .filter((el) => !/^[A-Z][a-z]?$/.test(el) && el !== "*")
      .sort();

  it("write a complex's groups by name, as Clean-up does", () => {
    expect(labelsIn("Pd(PPh3)4")).toEqual(["PPh3", "PPh3", "PPh3", "PPh3"]);
    expect(labelsIn("Grubbs I")).toEqual(["PCy3", "PCy3"]);
  });

  it("draw a group's own reagent, and a ligand - its own picture - out", () => {
    expect(labelsIn("TsCl")).toEqual([]);
    expect(labelsIn("PPh3")).toEqual([]);
    expect(labelsIn("(R)-BINAP")).toEqual([]);
    const binap = namedLigand("(R)-BINAP")!;
    expect(
      picturedStructure(ligandPicture(binap.ligand), 1)
        .atoms.map((a) => a.el)
        .filter((el) => el === "Ph" || el === "PPh2"),
    ).toEqual([]);
    // (BINAP's picture is laid out here, 0.7 to 1.8 s alone: a busy machine passes the default 5 s)
  }, measured(1_900));

  it("keep a double bond's E or Z with a group by it written by name: an (E)- and a (Z)-propenyl TBS ether, its TBS written so", () => {
    // (the O and the far methyl across the C=C: on its two sides for E, one side for Z - the TBS a label either way)
    const sides = (smiles: string) => {
      const p = picturedStructure(smilesStructure(smiles), 1);
      expect(p.atoms.map((a) => a.el)).toContain("TBS");
      const d = p.bonds.find((b) => b.order === 2)!;
      const [a, z] = [p.atoms[d.a1], p.atoms[d.a2]];
      const other = (x: number, not: number) => p.bonds.flatMap((b) => (b.a1 === x && b.a2 !== not ? [b.a2] : b.a2 === x && b.a1 !== not ? [b.a1] : []))[0];
      const side = (k: number) => Math.sign((z.x - a.x) * (p.atoms[k].y - a.y) - (z.y - a.y) * (p.atoms[k].x - a.x));
      return side(other(d.a1, d.a2)) * side(other(d.a2, d.a1));
    };
    expect(sides("CC(C)(C)[Si](C)(C)O/C=C/C")).toBe(-1);
    expect(sides("CC(C)(C)[Si](C)(C)O/C=C\\C")).toBe(1);
  });

  it("write a counter-anion's CF3 by formula, as everywhere", () => {
    const placed = picturedStructure(counterIonStructure("BArF")!, 1);
    expect(placed.atoms.filter((a) => a.el === "CF3")).toHaveLength(8);
    expect(placed.atoms.find((a) => a.el === "B")?.charge).toBe(-1);
    expect(placed.atoms.some((a) => a.el === "F")).toBe(false);
  });
});
