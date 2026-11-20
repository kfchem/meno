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
