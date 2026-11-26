// Held beside figures.test.ts: a figure's label that is a group's NAME - one of the abbreviation table's, drawn left of its bond - is read as
// that name and not turned element by element (BrZ and ClZ, MeOZ, DMPM are names whose letters are element symbols), as the real label
// reader (`figureLabels`) reads them; and NCSe, the isoselenocyanato label, is turned left of its bond (SeCN, Se bonded) and read as
// written right of it (N bonded), as NCS is.
import { describe, expect, it } from "vitest";
import { readDrawnLabel } from "../../../../lib/figure/structure";
import { figureLabels } from "./figures";

describe("a group's name drawn left of its bond, as the figure reader reads it", () => {
  it("stays the name: BrZ, ClZ, MeOZ and DMPM are the same left of the bond as right of it", () => {
    for (const name of ["BrZ", "ClZ", "MeOZ", "DMPM"]) {
      expect(readDrawnLabel(name, figureLabels, true).el, name).toBe(readDrawnLabel(name, figureLabels).el);
      expect(readDrawnLabel(name, figureLabels, true).el, name).toBe(name);
    }
  });

  it("a pseudohalide's label is turned only left of the bond: NCS is SCN there, NCSe SeCN, and neither is turned right of it", () => {
    expect(readDrawnLabel("NCS", figureLabels, true).el).toBe("SCN");
    expect(readDrawnLabel("NCS", figureLabels).el).toBe("NCS");
    expect(readDrawnLabel("NCSe", figureLabels, true).el).toBe("SeCN");
    // (right of the bond NCSe read nothing before it had a label of its own; now it is the isoselenocyanate, as written - N bonded)
    expect(readDrawnLabel("NCSe", figureLabels)).toMatchObject({ el: "NCSe", read: true });
  });
});
