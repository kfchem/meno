import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import { isomersToMake, openStereo, withChosen } from "./openStereo";

/** Butan-2-ol, drawn flat: its carbinol carbon open - its neighbours, in its bonds' order, C0, C2 and O4. */
const BUTANOL = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);
const CENTRE = { read: true, elements: [{ kind: "centre", at: 1, state: "unspecified" }] };

/** The plugin that finds stereoisomers, scripted: the elements it perceives, and the stereoisomers it makes - each request kept. */
function plugin(made: unknown = { isomers: [], free: true }) {
  const asked: string[] = [];
  const chem = { request: async (op: string) => (asked.push(op), op === "stereo_elements" ? CENTRE : made) } as unknown as ChemClient;
  return { chem, asked };
}

describe("what a structure leaves open, and the stereoisomers to make of it", () => {
  it("reads a centre's configuration from places made before, and leaves nothing open of it", async () => {
    // (the carbinol carbon among its three, its H the fourth: the volume of C0, C2 and O4 about it negative)
    const like = { 0: [-1, -0.5, -0.3], 1: [0, 0, 0], 2: [1, -0.5, -0.3], 3: [2, 0, 0], 4: [0, 1, -0.3] } as const;
    const open = await openStereo(plugin().chem, [BUTANOL], like as never);
    expect(open.drawn.atoms).toEqual([1]);
    expect(open.configured.centres).toEqual([{ atom: 1, neighbours: [0, 2, 4], sense: -1 }]);
    expect(open.left.atoms).toEqual([]);
    // (with a neighbour of it not placed: left open)
    const { 4: _o, ...part } = like;
    expect((await openStereo(plugin().chem, [BUTANOL], part as never)).left.atoms).toEqual([1]);
  });

  it("makes nothing chosen where nothing is open, or none holds in 3D - only what places made before give", async () => {
    const free = plugin();
    expect(await isomersToMake(free.chem, BUTANOL, undefined, "all")).toMatchObject({ count: 1, free: true, isomers: [{ centres: [], doubles: [] }] });
    const one = { configured: { centres: [{ atom: 1, neighbours: [0, 2, 4], sense: 1 }], doubles: [] }, smiles: "a" };
    const two = { configured: { centres: [{ atom: 1, neighbours: [0, 2, 4], sense: -1 }], doubles: [] }, smiles: "b" };
    const both = plugin({ isomers: [one, two], free: false });
    expect(await isomersToMake(both.chem, BUTANOL, undefined, "one")).toMatchObject({ count: 2, free: false, isomers: [one.configured] });
    expect((await isomersToMake(both.chem, BUTANOL, undefined, "all")).isomers).toEqual([one.configured, two.configured]);
    // (and refused, where it cannot be read)
    const unread = { request: async () => ({ read: false }) } as unknown as ChemClient;
    await expect(isomersToMake(unread, BUTANOL, undefined, "one")).rejects.toThrow("The plugin could not read it");
  });

  it("says which configurations were chosen: the CIP labels of the elements the drawing leaves open, no others", async () => {
    const open = await openStereo(plugin().chem, [BUTANOL]);
    const c = withChosen({ cip: { atoms: { "1": "R", "7": "S" }, bonds: { "3": "E" } } }, open);
    expect(c.chosen).toEqual({ atoms: { "1": "R" }, bonds: {} });
  });
});
