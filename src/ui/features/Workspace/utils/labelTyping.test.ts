import { describe, expect, it } from "vitest";
import { labelKey, labelReading, labelTextOf, readLabel } from "./labelTyping";
import { keptLabel, liveLabel } from "../../../../lib/chem/smartLabel";
import { elements } from "../../../../utils/atomUtils";

describe("labelKey", () => {
  it("starts a label with the letter typed", () => {
    expect(labelKey({ key: "a", code: "KeyA", keyCode: 65 })).toBe("a");
    expect(labelKey({ key: "N", code: "KeyN", keyCode: 78 })).toBe("N");
  });

  it("takes the key pressed, not the input method's, with Japanese input on", () => {
    // WebKit gives an input method's key as "Process" (or the kana) and 229
    expect(labelKey({ key: "Process", code: "KeyA", keyCode: 229 })).toBe("a");
    expect(labelKey({ key: "あ", code: "KeyA", keyCode: 229, isComposing: true })).toBe("a");
  });

  it("starts nothing for other keys", () => {
    expect(labelKey({ key: "1", code: "Digit1", keyCode: 49 })).toBeNull();
    expect(labelKey({ key: "Enter", code: "Enter", keyCode: 13 })).toBeNull();
    expect(labelKey({ key: "Process", code: "Digit1", keyCode: 229 })).toBeNull();
  });
});

describe("a label read as it is meant (lib/chem/smartLabel)", () => {
  const kept = (t: string) => keptLabel(t, labelReading);
  const live = (t: string) => liveLabel(t, labelReading);

  it("reads letters typed small as capitals where that makes a label - the fewest letters changed", () => {
    // (the maintainer's examples)
    expect(kept("nh2")).toBe("NH2");
    expect(kept("obz")).toBe("OBz");
    expect(kept("hnfmoc")).toBe("NHFmoc");
    for (const [typed, label] of [
      ["otbs", "OTBS"], ["co2me", "CO2Me"], ["cf3", "CF3"], ["no2", "NO2"], ["nme2", "NMe2"], ["pph3", "PPh3"],
      ["sime3", "SiMe3"], ["ph", "Ph"], ["bn", "Bn"], ["ipr", "iPr"], ["oh", "OH"], ["sh", "SH"], ["tbs", "TBS"],
      ["nh3+", "NH3+"], ["13c", "13C"], ["r1", "R1"], ["2,6-dimebz", "2,6-diMeBz"], ["4-meoc6h4", "4-MeOC6H4"],
    ]) expect(kept(typed)).toBe(label);
    // (capitals typed stay: Co is cobalt, CO is not read)
    expect(kept("Co")).toBe("Co");
    // (what reads as it was typed stays: lowercase names)
    for (const name of ["dppf", "cod", "py"]) expect(kept(name)).toBe(name);
  });

  it("reads part of a structure before a whole molecule: an element or a group, not a complex or a reagent", () => {
    // (Co2Me reads as a complex of cobalt; CO2Me, the ester, is a group; HF is a reagent, Hf an element)
    expect(kept("co2me")).toBe("CO2Me");
    expect(kept("come")).toBe("COMe");
    expect(kept("hf")).toBe("Hf");
    expect(kept("co")).toBe("Co");
    for (const el of ["Cs", "Sn", "Os", "Pb"]) expect(kept(el.toLowerCase())).toBe(el);
  });

  it("reads no element after uranium from letters typed small", () => {
    expect(kept("nh")).toBe("NH");
    expect(kept("cn")).toBe("CN");
    expect(kept("no")).toBe("NO");
    expect(kept("lr")).toBe("LR");
    // (a group named as such an element is the group)
    expect(kept("ts")).toBe("Ts");
    expect(kept("fm")).toBe("Fm");
    // (nothing else to read: as typed)
    expect(kept("np")).toBe("np");
    // (typed as the symbol is written: the element)
    expect(kept("No")).toBe("No");
  });

  it("keeps a label typed as it is drawn on a bond's left as it reads from the bond - as it is shown, the letters as typed", () => {
    for (const [typed, shown, label] of [
      ["aco", "AcO", "OAc"], ["meo", "MeO", "OMe"], ["bochn", "BocHN", "NHBoc"], ["ho2c", "HO2C", "CO2H"],
      ["h2n", "H2N", "NH2"], ["f3c", "F3C", "CF3"], ["hnfmoc", "HNFmoc", "NHFmoc"],
    ]) {
      expect(live(typed)).toBe(shown);
      expect(kept(typed)).toBe(label);
    }
  });

  it("keeps a label the same however it is typed - small, as it is written, or as it is drawn on a bond's left (the maintainer, 2026-10-11)", () => {
    // (the label, as it is drawn on a bond's left, then typed small and otherwise)
    for (const [label, drawn, ...typings] of [
      ["OH", "HO", "oh", "ho", "hO", "oH"],
      ["OAc", "AcO", "oac", "aco"],
      ["OMe", "MeO", "ome", "meo"],
      ["OBn", "BnO", "obn", "bno"],
      ["OTs", "TsO", "ots", "tso"],
      ["NHAc", "AcHN", "HNAc", "nhac", "achn", "hnac"],
      ["CO2Me", "MeO2C", "co2me", "meo2c"],
      ["CN", "NC", "cn", "nc"],
      ["NH2", "H2N", "nh2", "h2n"],
      ["SH", "HS", "sh", "hs"],
      ["NHBoc", "BocHN", "HNBoc", "nhboc", "bochn", "hnboc"],
      ["CO2H", "HO2C", "co2h", "ho2c"],
      ["NO2", "O2N", "no2", "o2n"],
      ["OTBS", "TBSO", "otbs", "tbso"],
    ]) {
      for (const typed of [label, drawn, ...typings]) {
        expect(kept(typed), typed).toBe(label);
        // (as it is typed: the same letters in the same places)
        expect(live(typed).toLowerCase(), typed).toBe(typed.toLowerCase());
      }
      // (typed as it is written, or as it is drawn: shown as typed)
      for (const typed of [label, drawn]) expect(live(typed), typed).toBe(typed);
    }
    // (with its italic prefix, turned round or not)
    for (const typed of ["OtBu", "otbu", "tBuO", "tbuo"]) expect(kept(typed), typed).toBe("OtBu");
    for (const typed of ["Ot-Bu", "t-BuO"]) expect(kept(typed), typed).toBe("Ot-Bu");
  });

  it("reads letters typed small as a heteroatom with its H or a group, as drawn on a bond's left, before any other reading (the maintainer, 2026-10-12)", () => {
    // (ho: the hydroxy group, not holmium - which is typed Ho)
    expect(live("ho")).toBe("HO");
    expect(kept("ho")).toBe("OH");
    expect(kept("Ho")).toBe("Ho");
    // (mes: MeS, the methylthio group - not mesityl, which is typed Mes)
    expect(live("mes")).toBe("MeS");
    expect(kept("mes")).toBe("SMe");
    for (const typed of ["MeS", "SMe", "sme"]) expect(kept(typed), typed).toBe("SMe");
    expect(kept("Mes")).toBe("Mes");
    // (typed in capitals, M and E are no word: nothing to read, nor to turn round - MES is no SEM)
    expect(live("MES")).toBe("MES");
    expect(kept("MES")).toBe("MES");
    // (what the letters spell drawn the other way round on no heteroatom, or of two elements, does not come first)
    for (const [typed, label] of [["fmoc", "Fmoc"], ["alloc", "Alloc"], ["troc", "Troc"], ["sn", "Sn"], ["sb", "Sb"], ["co", "Co"]])
      expect(kept(typed), typed).toBe(label);
  });

  it("keeps a charge typed last where it was, turned round or not", () => {
    for (const typed of ["ho-", "HO-", "oh-", "OH-"]) {
      expect(kept(typed), typed).toBe("OH-");
      expect(live(typed).toLowerCase(), typed).toBe(typed.toLowerCase());
    }
    expect(live("ho-")).toBe("HO-");
    for (const typed of ["h3n+", "H3N+", "nh3+", "NH3+"]) expect(kept(typed), typed).toBe("NH3+");
    for (const typed of ["hs-", "HS-", "sh-"]) expect(kept(typed), typed).toBe("SH-");
    // (holmium, typed as its symbol is written)
    expect(kept("Ho-")).toBe("Ho-");
  });

  it("leaves what reads as it is written as it is: CO, Co, NH and every element's symbol", () => {
    expect(kept("CO")).toBe("CO");
    expect(kept("Co")).toBe("Co");
    expect(kept("co")).toBe("Co");
    expect(kept("NH")).toBe("NH");
    expect(kept("nh")).toBe("NH");
    expect(kept("OC")).toBe("OC");
    for (const e of elements) {
      expect(kept(e.symbol), e.symbol).toBe(e.symbol);
      // (typed small: the element, up to uranium - but ho, above)
      if (e.number < 93 && e.symbol !== "Ho") expect(kept(e.symbol.toLowerCase()), e.symbol).toBe(e.symbol);
    }
  });

  it("keeps a molecule typed small as the molecule it reads as, not turned round - as typed in capitals", () => {
    for (const [typed, label] of [
      ["hcl", "HCl"], ["HCl", "HCl"], ["hbr", "HBr"], ["h2o", "H2O"], ["H2O", "H2O"], ["hac", "HAc"],
    ]) expect(kept(typed), typed).toBe(label);
    // (part of a structure before a whole molecule, still: hafnium, HF typed so)
    expect(kept("hf")).toBe("Hf");
    expect(kept("HF")).toBe("HF");
  });

  it("hyphenates an italic prefix, and leaves iPr as it is", () => {
    expect(kept("tbu")).toBe("t-Bu");
    expect(kept("sbu")).toBe("s-Bu");
    expect(kept("nbu")).toBe("n-Bu");
    expect(kept("co2tbu")).toBe("CO2t-Bu");
    expect(kept("ipr")).toBe("iPr");
  });

  it("leaves what reads as nothing as typed - no capital made", () => {
    expect(kept("x")).toBe("x");
    expect(kept("lg")).toBe("lg");
    expect(kept("")).toBe("");
  });

  it("reads condensed formulas as groups, by the H that makes a molecule of each", () => {
    for (const [typed, label] of [
      ["och3", "OCH3"], ["ch2oh", "CH2OH"], ["so2me", "SO2Me"], ["ocome", "OCOMe"], ["co2ch3", "CO2CH3"],
      ["conhme", "CONHMe"], ["cocl", "COCl"], ["ch2ph", "CH2Ph"], ["ochf2", "OCHF2"],
    ]) expect(kept(typed)).toBe(label);
  });

  it("reads a group named as an element is as the group (the maintainer, 2026-10-10)", () => {
    for (const g of ["Ac", "Pr", "Ts", "Fm", "At"]) expect(labelReading(g)).toEqual({ whole: false });
    expect(labelReading("Co")).toEqual({ whole: false, element: "Co" });
    expect(labelReading("HF")).toEqual({ whole: true });
    expect(labelReading("nh2")).toBeNull();
  });
});

describe("readLabel", () => {
  const isElement = (s: string) => ["C", "N", "O", "Fe", "Na", "Cl", "S"].includes(s);
  it("reads an element with its charge, H and mass number", () => {
    expect(readLabel("N+", isElement)).toEqual({ kind: "element", el: "N", charge: 1 });
    expect(readLabel("O-", isElement)).toEqual({ kind: "element", el: "O", charge: -1 });
    expect(readLabel("NH3+", isElement)).toEqual({ kind: "element", el: "N", charge: 1 });
    expect(readLabel("Fe2+", isElement)).toEqual({ kind: "element", el: "Fe", charge: 2 });
    expect(readLabel("Fe+2", isElement)).toEqual({ kind: "element", el: "Fe", charge: 2 });
    expect(readLabel("N++", isElement)).toEqual({ kind: "element", el: "N", charge: 2 });
    expect(readLabel("O−", isElement)).toEqual({ kind: "element", el: "O", charge: -1 });
    expect(readLabel("13C", isElement)).toEqual({ kind: "element", el: "C", charge: 0, isotope: 13 });
    expect(readLabel("OH", isElement)).toEqual({ kind: "element", el: "O", charge: 0 });
  });

  it("reads a charge alone as one for the atom as it is", () => {
    expect(readLabel("+", isElement)).toEqual({ kind: "charge", charge: 1 });
    expect(readLabel("2-", isElement)).toEqual({ kind: "charge", charge: -2 });
  });

  it("keeps anything else as a label, as typed", () => {
    expect(readLabel("OMe", isElement)).toEqual({ kind: "text", el: "OMe" });
    expect(readLabel("CO2H", isElement)).toEqual({ kind: "text", el: "CO2H" });
    expect(readLabel("Me", isElement)).toEqual({ kind: "text", el: "Me" });
  });
});

describe("labelTextOf", () => {
  it("types an atom's label back as readLabel reads it", () => {
    expect(labelTextOf({ el: "N", charge: 1 })).toBe("N+");
    expect(labelTextOf({ el: "Fe", charge: 2 })).toBe("Fe2+");
    expect(labelTextOf({ el: "O", charge: -1 })).toBe("O-");
    expect(labelTextOf({ el: "C", isotope: 13 })).toBe("13C");
    expect(labelTextOf({ el: "C", charge: 1 })).toBe("C+");
    expect(labelTextOf({ el: "C" })).toBe("");
    expect(labelTextOf({ el: "O" })).toBe("O");
  });
});
