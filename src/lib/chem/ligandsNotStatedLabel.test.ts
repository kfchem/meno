import { describe, expect, it } from "vitest";
import { buildTextLabels, type Atom, type Bond, type LayoutOptions } from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";

const L = NOMINAL_BOND_LENGTH;
const opts = (): LayoutOptions => acsWorldOptions([], [], { units: "world" });

/** A label on an atom bonded to one carbon: its bond to its "left", its "right", or the carbon "below" it. */
const drawn = (el: string, bond: "left" | "right" | "below") => {
  const at = bond === "left" ? { x: L, y: 0 } : bond === "right" ? { x: 0, y: 0 } : { x: 0, y: L };
  const atoms: Atom[] = [
    { id: 1, ...at, el },
    { id: 2, x: bond === "right" ? L : 0, y: 0, el: "C" },
  ];
  const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1 }];
  const [label] = buildTextLabels(atoms, opts(), bonds);
  return { text: label.text, on: label.runs![label.anchorRun ?? 0].text };
};

describe("a metal whose ligands are not stated, at its bond", () => {
  it("is drawn metal next to the bond, whichever order it was typed in", () => {
    for (const typed of ["LnPd", "PdLn"]) {
      expect(drawn(typed, "left"), typed).toEqual({ text: "PdLn", on: "Pd" });
      expect(drawn(typed, "right"), typed).toEqual({ text: "LnPd", on: "Pd" });
      expect(drawn(typed, "below"), typed).toEqual({ text: "PdLn", on: "Pd" });
    }
    for (const typed of ["MgX", "XMg"]) {
      expect(drawn(typed, "left"), typed).toEqual({ text: "MgX", on: "Mg" });
      expect(drawn(typed, "right"), typed).toEqual({ text: "XMg", on: "Mg" });
      expect(drawn(typed, "below"), typed).toEqual({ text: "MgX", on: "Mg" });
    }
    // (a count stays with its token; a metal in brackets is turned round whole)
    expect(drawn("L2Mg", "right").text).toBe("L2Mg");
    expect(drawn("L2Mg", "left").text).toBe("MgL2");
    expect(drawn("[Pd]L2", "right")).toEqual({ text: "L2[Pd]", on: "[Pd]" });
    // (tokens either side of the metal read outward from it)
    expect(drawn("LnPdX", "left").text).toBe("PdLnX");
    expect(drawn("LnPdX", "right").text).toBe("XLnPd");
  });

  it("keeps the label as typed on the atom: only the drawing is turned", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "LnPd" },
      { id: 2, x: L, y: 0, el: "C" },
    ];
    buildTextLabels(atoms, opts(), [{ a1: 0, a2: 1, order: 1 }]);
    expect(atoms[0].el).toBe("LnPd");
  });
});
