import { describe, expect, it, vi } from "vitest";
import { WILEY } from "../../../../lib/chem/style";
import type { ChemClient } from "../../../../lib/roles/client";

// (the plugin's drawing of ethane, and the engine's layout, stood in for: what is asked of the layout is what is looked at)
const ETHANE = "\n  Meno\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.5000    0.0000    0.0000 C   0  0\n  1  2  1  0\nM  END\n";
const laidOut = vi.fn(async (m: unknown) => m);
vi.mock("./cleanUp", () => ({ laidOut: (...a: unknown[]) => laidOut(...(a as [unknown])) }));

describe("a molecule in 3D drawn as a formula", () => {
  it("is laid out in the style of the drawing it goes into, where one is given", async () => {
    const { formulaOf } = await import("./make3d");
    const chem = { request: async () => ({ molblock: ETHANE, perceived: true }) } as unknown as ChemClient;
    // (said whole without hydrogens: a skeleton is not drawn - make3d.test)
    const ethane = { id: 1, at: { x: 0, y: 0 }, atoms: [{ el: "C", x: 0, y: 0, z: 0 }, { el: "C", x: 1.5, y: 0, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 2 }], wholeWithoutH: true as const };
    const { model } = await formulaOf(chem, ethane, 0, WILEY);
    expect(model.atoms.map((a) => a.el)).toEqual(["C", "C"]);
    expect(laidOut).toHaveBeenLastCalledWith(expect.objectContaining({ atoms: expect.any(Array) }), WILEY);
    // (none given: the layout's own default, the app's style)
    await formulaOf(chem, ethane, 0);
    expect(laidOut).toHaveBeenLastCalledWith(expect.objectContaining({ atoms: expect.any(Array) }), undefined);
  });
});
