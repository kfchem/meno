import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import { isomersToMake, openStereo, withChosen } from "./openStereo";

/** Butan-2-ol, drawn flat: its carbinol carbon open - its neighbours, in its bonds' order, C0, C2 and O4. */
const BUTANOL = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);
const CENTRE = { read: true, elements: [{ kind: "centre", at: 1, state: "unspecified" }] };

/** The plugin that finds stereoisomers, scripted: the elements it perceives, and the stereoisomers it makes - each request kept. */
function plugin(made: unknown = { isomers: [], free: true }, elements: unknown = CENTRE) {
  const asked: string[] = [];
  const chem = { request: async (op: string) => (asked.push(op), op === "stereo_elements" ? elements : made) } as unknown as ChemClient;
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

  it("counts and makes each configuration once, where the toolkit enumerates what Meno's rules leave out: an aziridine's four are two", async () => {
    // (CN1CC1C: only C1 open by Meno's rules, the plugin's isomers flip its N as well - four, C1's sense +1, -1, +1, -1)
    const at = (sense: 1 | -1) => ({ configured: { centres: [{ atom: 1, neighbours: [0, 2, 4], sense }], doubles: [] } });
    const four = plugin({ isomers: [at(1), at(-1), at(1), at(-1)].map((c, i) => ({ ...c, smiles: `s${i}` })), free: false });
    const all = await isomersToMake(four.chem, BUTANOL, undefined, "all");
    expect(all.count).toBe(2);
    expect(all.isomers).toEqual([at(1).configured, at(-1).configured]);
    const one = await isomersToMake(four.chem, BUTANOL, undefined, "one");
    expect([one.count, one.isomers]).toEqual([2, [at(1).configured]]);
  });

  it("keeps the isomers that differ where a configuration does not tell: a centre and an allene's axis give four, not two", async () => {
    // (CH3-CH(OH)-CH=C=CH-CH3: atom 1 a centre, bonds 2 and 3 an allene's axis, open; the plugin's four give the centre's sense twice each, the axis none)
    const ALLENE = v2000(["C", "C", "C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 2], [3, 4, 2], [4, 5, 1], [1, 6, 1]]);
    const elements = { read: true, elements: [{ kind: "centre", at: 1, state: "unspecified" }, { kind: "double", at: 2, state: "unspecified" }, { kind: "double", at: 3, state: "unspecified" }] };
    const at = (sense: 1 | -1) => ({ centres: [{ atom: 1, neighbours: [0, 2, 6], sense }], doubles: [] });
    const four = plugin({ isomers: [1, 1, -1, -1].map((sense, i) => ({ configured: at(sense as 1 | -1), smiles: `s${i}` })), free: false }, elements);
    const all = await isomersToMake(four.chem, ALLENE, undefined, "all");
    expect((await openStereo(four.chem, [ALLENE])).drawn.cumulenes).toEqual([2, 3]);
    expect(all.count).toBe(4);
    expect(all.isomers).toHaveLength(4);
    // (the same centre alone, its N-like twin not seen by Meno: merged as before - the allene's axis was the difference)
    const alone = plugin({ isomers: [at(1), at(1), at(-1), at(-1)].map((configured, i) => ({ configured, smiles: `s${i}` })), free: false });
    expect((await isomersToMake(alone.chem, BUTANOL, undefined, "all")).count).toBe(2);
  });

  it("says which configurations were chosen: the CIP labels of the elements the drawing leaves open, no others", async () => {
    const open = await openStereo(plugin().chem, [BUTANOL]);
    const c = withChosen({ cip: { atoms: { "1": "R", "7": "S" }, bonds: { "3": "E" } } }, open);
    expect(c.chosen).toEqual({ atoms: { "1": "R" }, bonds: {} });
    // (pent-3-en-2-ol, its double bond - bond 1 - and its carbinol carbon - atom 3 - both open: each label where it belongs)
    const pentenol = v2000(["C", "C", "C", "C", "O", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 1], [3, 5, 1]]);
    const both = { request: async () => ({ read: true, elements: [{ kind: "double", at: 1, state: "unspecified" }, { kind: "centre", at: 3, state: "unspecified" }] }) } as unknown as ChemClient;
    const opened = await openStereo(both, [pentenol]);
    const labelled = withChosen({ cip: { atoms: { "3": "R", "0": "S" }, bonds: { "1": "E", "3": "Z" } } }, opened);
    expect(labelled.chosen).toEqual({ atoms: { "3": "R" }, bonds: { "1": "E" } });
  });

  it("gives an allene's axis left open no configuration from places made before, however they lie", async () => {
    // (penta-2,3-diene: its two cumulated double bonds, 1 and 2, open; the places bend C0 and C3 off the axis)
    const allene = v2000(["C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 2], [2, 3, 2], [3, 4, 1]]);
    const doubles = { request: async () => ({ read: true, elements: [{ kind: "double", at: 1, state: "unspecified" }, { kind: "double", at: 2, state: "unspecified" }] }) } as unknown as ChemClient;
    const like = { 0: [-1, 1, 0], 1: [0, 0, 0], 2: [1.3, 0, 0], 3: [2.6, 0.4, 0.3], 4: [3.6, 1, 0] } as const;
    const open = await openStereo(doubles, [allene], like as never);
    expect(open.configured.doubles).toEqual([]);
    expect(open.left).toMatchObject({ bonds: [1, 2], cumulenes: [1, 2], cumulated: [[1, 2]] });
  });
});
