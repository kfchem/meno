import { describe, expect, it, vi } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import { readSmiles } from "../../../../lib/chem/smiles";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";

/**
 * The drawing laid out from a given configuration is held to it (backlog 106 B3): each centre, double bond, axis and cumulene as given, and
 * none more. Before, an allene's axis or an odd cumulene's cis or trans the text gave was not checked once laid out: a layout that turned one
 * passed in silence. Here the engine's answer is mirrored in the page, which turns every sense it drew: the layout must be refused.
 */
let mirrored = false;
vi.mock("./layOut", async (original) => {
  const m = await original<typeof import("./layOut")>();
  return { ...m, layOut: async (...a: Parameters<typeof m.layOut>) => {
    const l = await m.layOut(...a);
    return mirrored ? { ...l, x: l.x.map((v) => -v) } : l;
  } };
});
const { laidOut } = await import("./cleanUp");

/** The plugin's drawing of a structure as a MOL block cannot say its allene: no wedge, the run straight. */
const pluginDrawing = (smiles: string): Model => {
  const m = drawnFromSmiles(smiles.replace(/\[C@+\]/, "C"));
  return { ...m, bonds: m.bonds.map(({ stereo: _s, narrow: _n, display: _d, ...b }) => b) as Model["bonds"] };
};

describe("a layout that turns what was given", () => {
  const allene = "OC(C)=[C@]=C(Cl)C";
  const given = { axes: readSmiles(allene).axes ?? [], cumulated: [] };

  it("is refused for an allene's axis given by its text - and the same layout, not turned, is taken", async () => {
    mirrored = false;
    await expect(laidOut(pluginDrawing(allene), MENO, given)).resolves.toBeDefined();
    mirrored = true;
    await expect(laidOut(pluginDrawing(allene), MENO, given)).rejects.toThrow(/keeping its stereochemistry/);
    mirrored = false;
  });

  it("is refused for a centre given beside the drawing", async () => {
    const smi = "CC(O)CC";
    const configuration = { centres: [{ atom: 1, neighbours: [0, 2, 3], sense: 1 as const }], doubles: [] };
    mirrored = false;
    await expect(laidOut(pluginDrawing(smi), MENO, { axes: [], cumulated: [], configuration })).resolves.toBeDefined();
    mirrored = true;
    await expect(laidOut(pluginDrawing(smi), MENO, { axes: [], cumulated: [], configuration })).rejects.toThrow(/keeping its stereochemistry/);
    mirrored = false;
  });
});
