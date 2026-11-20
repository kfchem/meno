import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { v2000 } from "../../../../lib/chem/testdata/v2000";
import { isomersToMake, openStereo, withChosen } from "./openStereo";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { NOT_COUNTED_CAGE, NOT_COUNTED_JOINED } from "../../../../lib/chem/isomers";
import { drawnFromSmiles } from "./testdata/identityCases";

/** Butan-2-ol, drawn flat: its carbinol carbon open - its neighbours, in its bonds' order, C0, C2 and O4. */
const BUTANOL = v2000(["C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]);

/** The plugin that makes stereoisomers, scripted: each request kept; asked to make one configuration whole, it makes it (`makes`) or not. */
function plugin(makes = false) {
  const asked: string[] = [];
  const chem = {
    request: async (op: string, args: { configured?: unknown }) => (asked.push(op), makes ? { isomers: [{ configured: args.configured, smiles: JSON.stringify(args.configured) }], free: false } : { isomers: [], free: true }),
  } as unknown as ChemClient;
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

  it("makes nothing chosen where none holds in 3D - only what places made before give - and each of Meno's where they hold", async () => {
    expect(await isomersToMake(plugin().chem, BUTANOL, undefined, "all")).toMatchObject({ count: 1, free: true, isomers: [{ centres: [], doubles: [] }] });
    const at = (sense: 1 | -1) => ({ centres: [{ atom: 1, neighbours: [0, 2, 4], sense }], doubles: [], groups: [] });
    const all = await isomersToMake(plugin(true).chem, BUTANOL, undefined, "all");
    expect([all.count, all.free]).toEqual([2, false]);
    expect(all.isomers).toEqual(expect.arrayContaining([at(1), at(-1)]));
    const one = await isomersToMake(plugin(true).chem, BUTANOL, undefined, "one");
    expect([one.count, one.isomers]).toEqual([2, [all.isomers[0]]]);
    // (and refused, where Meno cannot read it)
    await expect(isomersToMake(plugin(true).chem, "no block", undefined, "one")).rejects.toThrow("Meno could not read it");
  });

  it("counts by Meno's candidates: an N-methylaziridine's N keeps no configuration, so its C alone gives two", async () => {
    const aziridine = v2000(["C", "N", "C", "C", "C"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 1, 1], [3, 4, 1]]);
    const made = await isomersToMake(plugin(true).chem, aziridine, undefined, "all");
    expect(made.count).toBe(2);
    expect(made.isomers.map((c) => c.centres.map((x) => x.atom))).toEqual([[3], [3]]);
  });

  it("makes each of the stereoisomers that differ only at an allene's axis, its axis with it", async () => {
    // (CH3-CH(OH)-CH=C=CH-CH3: atom 1 a centre, bonds 2 and 3 an allene's axis, open: four by Meno's count, the axis given to no plugin)
    const ALLENE = v2000(["C", "C", "C", "C", "C", "C", "O"], [[0, 1, 1], [1, 2, 1], [2, 3, 2], [3, 4, 2], [4, 5, 1], [1, 6, 1]]);
    expect((await openStereo(plugin().chem, [ALLENE])).drawn.cumulenes).toEqual([2, 3]);
    const all = await isomersToMake(plugin(true).chem, ALLENE, undefined, "all");
    expect(all.count).toBe(4);
    expect(all.isomers.filter((c) => c.axes?.length)).toHaveLength(4);
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

  it("says a structure whose stereoisomers Meno does not count is made as the toolkit gives it - homoadamantane, never one way unsaid - and counts Troeger's base, its bridgeheads tied", async () => {
    const homoadamantane = writeMolfile(drawnFromSmiles("C1CC2CC3CC1CC(C2)C3"));
    expect((await isomersToMake(plugin().chem, homoadamantane, undefined, "all")).said).toContain(NOT_COUNTED_JOINED);
    const troeger = writeMolfile(drawnFromSmiles("Cc1ccc2c(c1)CN3c4ccc(C)cc4CN2C3"));
    const made = await isomersToMake(plugin().chem, troeger, undefined, "all");
    expect(made.said).not.toContain(NOT_COUNTED_CAGE);
    expect(made.said).not.toContain(NOT_COUNTED_JOINED);
  });
});
