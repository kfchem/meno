// Held beside hydrogens.test.ts: As and Sb take the higher step P does and Te the steps S does, and a charge moves each the way it moves its
// congener's group - an arsonium R3AsH+, a hydro-arsenide, a telluronium R2TeH+ - as the P, S and Se of the same ladder do.
import { describe, expect, it } from "vitest";
import { implicitHydrogens } from "./hydrogens";

describe("As, Sb and Te at the higher steps of their ladders, and with a charge", () => {
  it("As and Sb of four bonds to non-metals write one H, as P does: R4AsH, R4SbH; Te of three or five bonds one, as S does", () => {
    for (const el of ["As", "Sb"]) expect(implicitHydrogens(el, 4, 0, undefined, 0), el).toBe(1);
    expect(implicitHydrogens("Te", 3, 0, undefined, 0)).toBe(1);
    expect(implicitHydrogens("Te", 5, 0, undefined, 0)).toBe(1);
  });

  it("a charge moves them as it moves P and S: R3AsH+ and R2TeH+ carry one H, RAsH- one", () => {
    expect(implicitHydrogens("As", 3, 1)).toBe(1);
    expect(implicitHydrogens("Sb", 3, 1)).toBe(1);
    expect(implicitHydrogens("Te", 2, 1)).toBe(1);
    expect(implicitHydrogens("As", 1, -1)).toBe(1);
  });
});
