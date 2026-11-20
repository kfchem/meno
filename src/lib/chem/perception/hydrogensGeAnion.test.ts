// Held beside hydrogens.test.ts: a germanium anion takes the bonds a silicon one does - GeF5- and GeF6 2- (hexafluorogermanate) are
// no more than germanium has - as `mostBonds` says of silicon.
import { describe, expect, it } from "vitest";
import { mostBonds } from "./hydrogens";

describe("the most bonds a germanium takes", () => {
  it("is four neutral, and five and six as an anion, as a silicon's", () => {
    expect(mostBonds("Ge", 0)).toBe(4);
    expect(mostBonds("Ge", -1)).toBe(5);
    expect(mostBonds("Ge", -2)).toBe(6);
    for (const charge of [-2, -1, 0]) expect(mostBonds("Ge", charge), String(charge)).toBe(mostBonds("Si", charge));
  });
});
