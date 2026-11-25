// A label typed run together is drawn in the units Meno reads it in: PtBu3, read as tri-tert-butylphosphine, is P and tBu3 - turned
// round at a left end tBu3P, its P on the bond - never the Pt and Bu3 of a platinum group. Through the app's own label drawing.
import { describe, expect, it } from "vitest";
import { buildTextLabels, type Atom, type Bond } from "./layout2d";
import { acsWorldOptions } from "./acs";
import { abbreviationStructure, readUnits } from "./abbreviations";

const L = 1.5;
/** A label on the end of a two-carbon chain, its bond at the label's right (a left end) or at its left: the text and the run on the atom. */
const drawn = (el: string, bondAtRight: boolean) => {
  const s = bondAtRight ? 1 : -1;
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el },
    { id: 2, x: s * L, y: 0, el: "C" },
    { id: 3, x: 2 * s * L, y: L / 2, el: "C" },
  ];
  const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 1 }];
  const t = buildTextLabels(atoms, acsWorldOptions([], [], { units: "world" }), bonds).find((l) => l.atom === 0)!;
  return { text: t.text, atom: t.runs?.[t.anchorRun ?? 0]?.text };
};

describe("a typed label is drawn in the units it is read in", () => {
  it("PtBu3: tBu3P at a left end, PtBu3 at a right end, P on the bond; the atoms read unchanged", () => {
    expect(drawn("PtBu3", true)).toEqual({ text: "tBu3P", atom: "P" });
    expect(drawn("PtBu3", false)).toEqual({ text: "PtBu3", atom: "P" });
    const s = abbreviationStructure("PtBu3")!;
    expect(s.atoms.filter((a) => a.el === "P")).toHaveLength(1);
    expect(s.atoms.filter((a) => a.el === "C")).toHaveLength(12);
    expect(readUnits("PtBu3")).toEqual(["P", "tBu3"]);
  });

  it("NiPr2: iPr2N; OsBu and Os-Bu: sBuO and s-BuO; NHtBu: tBuHN, as NHBoc is BocHN", () => {
    expect(drawn("NiPr2", true)).toEqual({ text: "iPr2N", atom: "N" });
    expect(drawn("NiPr2", false)).toEqual({ text: "NiPr2", atom: "N" });
    expect(drawn("OsBu", true)).toEqual({ text: "sBuO", atom: "O" });
    expect(drawn("Os-Bu", true)).toEqual({ text: "s-BuO", atom: "O" });
    expect(drawn("NHtBu", true)).toEqual({ text: "tBuHN", atom: "N" });
    expect(drawn("NHBoc", true)).toEqual({ text: "BocHN", atom: "N" });
  });

  // every atom and group that, run together, read as another element or group, as typed: the units at a left end are those read
  it.each([
    ["PtBu2", "tBu2P", "P"],
    ["Pt-Bu2", "t-Bu2P", "P"],
    ["NiPr2", "iPr2N", "N"],
    ["Os-Bu", "s-BuO", "O"],
    ["BiPr2", "iPr2B", "B"],
    ["BiBu2", "iBu2B", "B"],
    ["SiPr", "iPrS", "S"],
    ["NHs-Bu", "s-BuHN", "N"],
    ["NHSu", "SuHN", "N"],
    ["NMOM2", "MOM2N", "N"],
    ["Np-Ns2", "p-Ns2N", "N"],
  ])("%s is drawn %s at a left end, %s on the bond", (typed, left, atom) => {
    const units = readUnits(typed)!;
    expect(units[0]).toBe(atom);
    expect(units.join("")).toBe(typed);
    expect(readUnits(typed, true)!.join("")).toBe(left);
    expect(drawn(typed, true)).toEqual({ text: left, atom });
    expect(drawn(typed, false)).toEqual({ text: typed, atom });
  });

  it("labels read as before are drawn as before", () => {
    for (const [typed, left, atom] of [
      ["PPh3", "Ph3P", "P"],
      ["OTBS", "TBSO", "O"],
      ["NHBoc", "BocHN", "N"],
      ["CO2Me", "MeO2C", "C"],
      ["PdCl2", "Cl2Pd", "Pd"],
      ["P(t-Bu)3", "(t-Bu)3P", "P"],
      ["PiPr3", "iPr3P", "P"],
    ]) {
      expect(drawn(typed, true)).toEqual({ text: left, atom });
      expect(drawn(typed, false)).toEqual({ text: typed, atom });
    }
    // (a metal with its ligands, a formula, or nothing read: no units of the reader's)
    expect(readUnits("PdCl2")).toBeNull();
    expect(readUnits("CO2Me")).toBeNull();
    expect(readUnits("xyz")).toBeNull();
  });
});
