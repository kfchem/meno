// Held beside read.test.ts: a donor's bond to a Lewis-acidic main-group metal is left out of the donor's count whichever end of the bond the metal is the atom of - the metal first or last in the figure.
import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../chem/elements";
import { structureOf, type LabelReader } from "./structure";

const reads: LabelReader = (label) => (ELEMENTS.some((e) => e.symbol === label) ? { el: label } : null);
/** A fluorine on a carbon bonded to `metal`, the metal the first atom of the figure's bond (`first`) or the last. */
const bridged = (metal: string, first: boolean) =>
  structureOf(
    first
      ? { atoms: [{ x: 0, y: 0, el: metal }, { x: 1, y: 0, el: "F" }, { x: 2, y: 0, el: "C" }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }], bond: 1, left: { letters: [] } }
      : { atoms: [{ x: 0, y: 0, el: "C" }, { x: 1, y: 0, el: "F" }, { x: 2, y: 0, el: metal }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }], bond: 1, left: { letters: [] } },
    reads,
  );
const noted = (s: ReturnType<typeof bridged>) => s.atoms.filter((a) => a.unsure?.some((w) => w.startsWith("More bonds meet here"))).map((a) => a.el);

describe("a donor's bond to a Lewis-acidic main-group metal, whichever way round the bond is written", () => {
  it("is left out of the donor's count with the metal the bond's first atom as with it the last", () => {
    for (const metal of ["Mg", "Li", "Al", "Pd"]) for (const first of [true, false]) expect(noted(bridged(metal, first)), `${metal} ${first ? "first" : "last"}`).toEqual([]);
  });

  it("is not tin's, the metal first or last: that fluorine has more bonds than it takes", () => {
    for (const first of [true, false]) expect(noted(bridged("Sn", first))).toEqual(["F"]);
  });
});
