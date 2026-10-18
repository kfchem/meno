import { describe, expect, it, vi } from "vitest";
import { WILEY } from "../../../../lib/chem/style";
import { measured } from "../../../../testing/timeouts";

// (the plugin's drawing of ethanol, and the engine's layout, stood in for: what is asked of each is what is looked at)
const ETHANOL = "\n  Meno\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.2990    0.7500    0.0000 C   0  0\n    2.5981    0.0000    0.0000 O   0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n";
vi.mock("../../../../lib/roles/worker", () => ({ chemWorker: async () => ({ request: async () => ({ molblock: ETHANOL }) }) }));
const laidOut = vi.fn(async (m: unknown) => m);
vi.mock("./cleanUp", () => ({ laidOut: (...a: unknown[]) => laidOut(...(a as [unknown])) }));

describe("a structure from its SMILES", () => {
  it("is laid out in the style of the drawing it goes into, where one is given", async () => {
    const { structureFromSmiles } = await import("./fromSmiles");
    const drawn = await structureFromSmiles("CCO", WILEY);
    expect(drawn.atoms.map((a) => a.el)).toEqual(["C", "C", "O"]);
    expect(laidOut).toHaveBeenLastCalledWith(expect.objectContaining({ atoms: expect.any(Array) }), WILEY);
    // (none given: the layout's own default, the app's style)
    await structureFromSmiles("CCO");
    expect(laidOut).toHaveBeenLastCalledWith(expect.objectContaining({ atoms: expect.any(Array) }), undefined);
  }, measured(390));
});
