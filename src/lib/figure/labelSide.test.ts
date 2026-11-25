// Held beside ../chem/pseudohalideLabels.test.ts: a figure's label is read by the side its bonds come in from where the structure is made
// (structureOf - from either end of its bond, and by an alternative reading), a bond that leaves to the left keeps a label as written,
// NCS with no bond at all or a list of none is the reagent, and the valence of a label read bonded is the group's.
import { describe, expect, it } from "vitest";
import { abbreviationOf } from "../chem/abbreviations";
import { placedAbbreviation } from "../chem/abbreviationPlace";
import { bondsFromRight } from "../layout/names";
import { readDrawnLabel, structureOf } from "./structure";
import type { FigureRead } from "./read";

const reads = (l: string) => (abbreviationOf(l) ? { el: l } : null);
const label = (text: string, partnerAt: number, labelIsFirst = true, alts?: string[]): FigureRead => ({
  atoms: [{ x: 0, y: 0, label: text, ...(alts ? { alts } : {}) }, { x: partnerAt, y: 0 }],
  bonds: labelIsFirst ? [{ a: 0, b: 1, order: 1 }] : [{ a: 1, b: 0, order: 1 }],
  bond: 30,
  left: { letters: [] },
});
const elOf = (f: FigureRead) => structureOf(f, reads).atoms[0].el;

describe("a label read where a figure's structure is made, by the side its bond comes in from", () => {
  it("left of its bond (the bond to its right) it is read outward from the bond: NCO a cyanate, OCN an isocyanate; right of it, as written", () => {
    expect(elOf(label("NCO", 30))).toBe("OCN");
    expect(elOf(label("OCN", 30))).toBe("NCO");
    expect(elOf(label("NCO", -30))).toBe("NCO");
    expect(elOf(label("OCN", -30))).toBe("OCN");
  });

  it("the selenium pair as the sulfur pair: NCSe left of its bond a selenocyanate (Se bonded), right of it an isoselenocyanate (N bonded)", () => {
    // (by hand, GR-2.1.6: the symbol at the bond's end is the bonded atom - left of its bond NCSe ends in Se there, SeCN in N)
    expect(elOf(label("NCSe", 30))).toBe("SeCN");
    expect(elOf(label("SeCN", 30))).toBe("NCSe");
    expect(elOf(label("NCSe", -30))).toBe("NCSe");
    expect(elOf(label("SeCN", -30))).toBe("SeCN");
  });

  it("whichever end of the bond the label is: the bond's first atom or its second", () => {
    expect(elOf(label("NCO", 30, false))).toBe("OCN");
    expect(elOf(label("OCN", 30, false))).toBe("NCO");
    expect(elOf(label("NCO", -30, false))).toBe("NCO");
  });

  it("a label drawn as shapes that reads as nothing is read by its alternative, by the same side: SCN an isothiocyanate left of its bond, a thiocyanate right of it", () => {
    expect(elOf(label("?", 30, true, ["SCN"]))).toBe("NCS");
    expect(elOf(label("?", -30, true, ["SCN"]))).toBe("SCN");
  });
});

describe("a bond that leaves a label to the left keeps it as written", () => {
  const at = (degrees: number) => ({ x: Math.sin((degrees * Math.PI) / 180), y: Math.cos((degrees * Math.PI) / 180) });
  it("one past the band, though the rest come in from the right; one within the band, not", () => {
    expect(bondsFromRight([at(100), at(-15)])).toBe(false);
    expect(bondsFromRight([at(60), at(-15)])).toBe(false);
    expect(bondsFromRight([at(60), at(-5)])).toBe(true);
    expect(bondsFromRight([at(100), at(15)])).toBe(true);
  });
});

describe("NCS", () => {
  it("is the reagent with no bond, whether none is given or a list of none: N-chlorosuccinimide, attached by nothing", () => {
    for (const none of [null, []]) {
      const s = placedAbbreviation("NCS", none, 1.5)!;
      expect(s.attach).toEqual([]);
      expect(s.atoms.map((a) => a.el)).toContain("Cl");
    }
  });

  it("takes one bond in a figure as the isothiocyanato group does: two bonds meeting at it are said to be more than it has, one is not", () => {
    // (its bonds leaving to its left: read as written, the isothiocyanato group - right of them it is turned, SCN, a thiocyanate)
    const two: FigureRead = { atoms: [{ x: 0, y: 0, label: "NCS" }, { x: -30, y: 0 }, { x: 0, y: 30 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }], bond: 30, left: { letters: [] } };
    const one = label("NCS", -30);
    const said = (f: FigureRead) => (structureOf(f, reads).atoms[0].unsure ?? []).some((u) => /More bonds meet here/.test(u));
    expect(said(two)).toBe(true);
    expect(said(one)).toBe(false);
  });

  it("is read by readDrawnLabel as it is written right of its bond, and turned element by element left of it: SCN, S bonded", () => {
    expect(readDrawnLabel("NCS", reads, true).el).toBe("SCN");
    expect(readDrawnLabel("NCS", reads).el).toBe("NCS");
  });
});

describe("a picture's NC with its bond at the N: read as a nitrile, and said", () => {
  // (a made figure: a label "NC" and one carbon, the bond's other end; by hand, IUPAC GR-2.1.6 puts the bonded atom at the bond's end
  //  of the text - right of its bond, or under or over it, that is the N, an isocyanide R-N#C; left of it the C, a nitrile R-C#N. Meno
  //  keeps NC read as CN, as typed - so the atom keeps "CN" and says, where its N is at the bond, that it may be an isocyanide)
  const at = (x: number, y: number): FigureRead => ({ atoms: [{ x: 0, y: 0, label: "NC" }, { x, y }], bonds: [{ a: 0, b: 1, order: 1 }], bond: 30, left: { letters: [] } });
  const said = (f: FigureRead) => (structureOf(f, reads).atoms[0].unsure ?? []).filter((u) => /isocyanide/.test(u));
  it("right of its bond, or upright: read CN, and the atom says it may be an isocyanide", () => {
    for (const f of [at(-30, 0), at(0, 30), at(0, -30)]) {
      expect(structureOf(f, reads).atoms[0].el).toBe("CN");
      expect(said(f)).toHaveLength(1);
    }
  });

  it("left of its bond (its C at the bond, a nitrile), and CN written either side: nothing said", () => {
    expect(structureOf(at(30, 0), reads).atoms[0].el).toBe("CN");
    expect(said(at(30, 0))).toEqual([]);
    for (const x of [30, -30]) expect(structureOf(label("CN", x), reads).atoms[0].unsure ?? []).toEqual([]);
  });
});

describe("a picture's ONO2 left of its bond: read as written there, O-O-N=O, and said", () => {
  // (a made figure: a label "ONO2" and one carbon. By hand: right of its bond, ONO2 is read as written, R-O-NO2, a nitrate ester;
  //  left of it, read outward from the bond, it is turned to O2NO - its last O, then O2 and N: R-O-O-N=O, the reading kept. A nitrate
  //  written on that side is O2NO (its O at the bond), so the atom says it may be one. O2NO left of its bond is the nitrate: nothing said)
  const said = (f: FigureRead) => (structureOf(f, reads).atoms[0].unsure ?? []).filter((u) => /nitrate/.test(u));
  it("left of its bond: read O2NO (O-O-N=O), and the atom says it may be a nitrate", () => {
    expect(elOf(label("ONO2", 30))).toBe("O2NO");
    expect(said(label("ONO2", 30))).toHaveLength(1);
  });

  it("right of its bond, ONO2 the nitrate, and O2NO left of its bond the nitrate: nothing said", () => {
    expect(elOf(label("ONO2", -30))).toBe("ONO2");
    expect(said(label("ONO2", -30))).toEqual([]);
    expect(elOf(label("O2NO", 30))).toBe("ONO2");
    expect(said(label("O2NO", 30))).toEqual([]);
  });
});
