import { describe, expect, it } from "vitest";
import { writeXyz, xyzLeavesOut } from "./xyzWriter";

describe("what an XYZ file does not hold, said (xyzLeavesOut)", () => {
  it("says charges, radicals, isotopes and bonds, each with how many - none of which the file written holds", () => {
    // (13C-labelled acetate's carbon, its O-, a radical's carbon: two molecules, five bonds)
    const molecules = [
      { atoms: [{ el: "C", isotope: 13 }, { el: "C" }, { el: "O" }, { el: "O", charge: -1 }], bonds: [1, 2, 3] },
      { atoms: [{ el: "C", radical: "doublet" }, { el: "H" }], bonds: [1, 2] },
    ];
    expect(xyzLeavesOut(molecules)).toBe(
      "An XYZ file holds elements and positions only: 1 atom's charge, 1 atom's radical, 1 atom's isotope and 5 bonds are not written.",
    );
    // (the file holds elements and positions, and nothing of them)
    const text = writeXyz([{ atoms: molecules[0].atoms.map((a, i) => ({ el: a.el, x: i, y: 0, z: 0 })), comment: "" }]);
    expect(text.split("\n").slice(2, 6).map((l) => l.trim().split(/\s+/)[0])).toEqual(["C", "C", "O", "O"]);
  });

  it("says one thing in the singular, and nothing where there is nothing to leave out", () => {
    expect(xyzLeavesOut([{ atoms: [{}, {}], bonds: [1] }])).toBe("An XYZ file holds elements and positions only: 1 bond is not written.");
    expect(xyzLeavesOut([{ atoms: [{ charge: 1 }, { charge: -1 }], bonds: [] }])).toBe("An XYZ file holds elements and positions only: 2 atoms' charges are not written.");
    expect(xyzLeavesOut([{ atoms: [{}], bonds: [] }])).toBeNull();
  });
});
