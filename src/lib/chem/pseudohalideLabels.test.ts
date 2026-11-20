import { describe, expect, it } from "vitest";
import { placedAbbreviation } from "./abbreviationPlace";
import { abbreviationOf } from "./abbreviations";
import { readDrawnLabel } from "../figure/structure";
import { bondsFromRight } from "../layout/names";

/** What a label stands for bonded (a neighbour to its right) or alone: its atoms, the bonded one first-named, and where it is bonded. */
const read = (label: string, bonded = true) => {
  const s = placedAbbreviation(label, bonded ? { x: 1.5, y: 0 } : null, 1.5);
  return s ? { atoms: s.atoms.map((a) => `${a.el}${a.charge ? (a.charge > 0 ? "+" : "-") : ""}`), bonded: s.attach.map((i) => s.atoms[i].el) } : null;
};

describe("a pseudohalide's label, read outward from its bond: its first symbol bonded", () => {
  it("NCO and NCS bonded are the iso forms, N bonded - an isocyanate, an isothiocyanate", () => {
    expect(read("NCO")).toEqual({ atoms: ["N", "C", "O"], bonded: ["N"] });
    expect(read("NCS")).toEqual({ atoms: ["N", "C", "S"], bonded: ["N"] });
  });

  it("CN, OCN and SCN bonded are a nitrile, a cyanate and a thiocyanate, as before - and NC is no label: typed, it is kept as CN", () => {
    expect(read("NC")).toBeNull();
    expect(read("CN")).toEqual({ atoms: ["C", "N"], bonded: ["C"] });
    expect(read("OCN")).toEqual({ atoms: ["O", "C", "N"], bonded: ["O"] });
    expect(read("SCN")).toEqual({ atoms: ["S", "C", "N"], bonded: ["S"] });
  });

  it("NCS alone is N-chlorosuccinimide, the reagent, as before", () => {
    const alone = read("NCS", false)!;
    expect(alone.bonded).toEqual([]);
    expect(alone.atoms).toContain("Cl");
  });
});

describe("the side a label's bonds come in from", () => {
  const at = (degrees: number) => ({ x: Math.sin((degrees * Math.PI) / 180), y: Math.cos((degrees * Math.PI) / 180) });
  it("is the right past the label band's 10 degrees from upright, none leaving to the left", () => {
    expect(bondsFromRight([at(30)])).toBe(true);
    expect(bondsFromRight([at(90)])).toBe(true);
    expect(bondsFromRight([at(5)])).toBe(false);
    expect(bondsFromRight([at(-30)])).toBe(false);
    expect(bondsFromRight([at(60), at(120)])).toBe(true);
    expect(bondsFromRight([at(60), at(-60)])).toBe(false);
    expect(bondsFromRight([])).toBe(false);
  });
});

describe("a pseudohalide's label read off a picture, as shown (IUPAC GR-2.1.6)", () => {
  const reads = (l: string) => (abbreviationOf(l) ? { el: l } : null);
  it("left of its bond, read outward from it: NCO a cyanate, SCN an isothiocyanate - and NC, CN, a nitrile either side", () => {
    expect(readDrawnLabel("NCO", reads, true).el).toBe("OCN");
    expect(readDrawnLabel("NC", reads, true).el).toBe("CN");
    expect(readDrawnLabel("CN", reads, true).el).toBe("CN");
    expect(readDrawnLabel("SCN", reads, true).el).toBe("NCS");
  });

  it("right of its bond, or upright, as it is: NCO an isocyanate, CN a nitrile, SCN a thiocyanate", () => {
    expect(readDrawnLabel("NC", reads).el).toBe("CN");
    expect(readDrawnLabel("NCO", reads).el).toBe("NCO");
    expect(readDrawnLabel("CN", reads).el).toBe("CN");
    expect(readDrawnLabel("SCN", reads).el).toBe("SCN");
  });

  it("left of its bond and read only as it is, as it is: HO still OH turned round, Ph still Ph", () => {
    expect(readDrawnLabel("HO", (l) => (l === "OH" ? { el: "OH" } : null), true).el).toBe("OH");
    expect(readDrawnLabel("Ph", reads, true).el).toBe("Ph");
  });
});

