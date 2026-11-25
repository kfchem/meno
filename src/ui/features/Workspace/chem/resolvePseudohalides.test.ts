// Held beside resolve.test.ts: an R group typed NCS is the isothiocyanato group, attached by its N; typed where a whole molecule is asked
// for, it still reads as the reagent, N-chlorosuccinimide, which is attached by none of its atoms.
import { describe, expect, it } from "vitest";
import { resolve } from "./resolve";

const labelOf = (typed: string, where: "group" | "molecule") => {
  const found = resolve(typed, where).readings.find((r) => r.as === "label");
  return found && found.as === "label" ? found : undefined;
};

describe("NCS typed as an R group, and as a molecule", () => {
  it("as an R group it is the isothiocyanato group: attached by one atom, its N", () => {
    const r = resolve("NCS", "group");
    expect(r.problem).toBeUndefined();
    const group = labelOf("NCS", "group")!.group;
    expect(group.attach).toHaveLength(1);
    expect(group.atoms[group.attach[0]].el).toBe("N");
    expect(group.atoms.map((a) => a.el)).toEqual(["N", "C", "S"]);
  });

  it("as a molecule it is still the reagent - N-chlorosuccinimide, attached by none of its atoms", () => {
    const group = labelOf("NCS", "molecule")!.group;
    expect(group.attach).toEqual([]);
    expect(group.atoms.map((a) => a.el)).toContain("Cl");
  });

  it("NCO as an R group is the isocyanato group, attached by its N", () => {
    const group = labelOf("NCO", "group")!.group;
    expect(group.atoms[group.attach[0]].el).toBe("N");
    expect(group.atoms.map((a) => a.el)).toEqual(["N", "C", "O"]);
  });
});
