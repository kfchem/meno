import { describe, expect, it } from "vitest";
import type { ChemClient } from "../../../../lib/roles/client";
import { HEXAGON, v3000 } from "../../../../lib/chem/testdata/v3000";
import { drawnGroupsOf, type ConfiguredCentre, type IsomerConfiguration } from "../../../../lib/chem/stereoOpen";
import { configurationKey, groupsIn, halves, inverted, stereoGroupNamed } from "../../../../lib/chem/perception/stereo/configuration";
import { isomersToMake } from "./openStereo";
import { stereoRows } from "./make3d";

/**
 * The known answers of a configuration's groups (foundation part 7, and route (a)): what the plugin
 * that finds stereoisomers makes is scripted here as its toolkit makes it - each AND or OR group turned whole, each tried in 3D - and
 * which halves there are, which is drawn, which is a mirror image and what is said are Meno's.
 */

type Atom = { el: string; x: number; y: number };
type Bond = { a: number; b: number; order: number; stereo?: "up" | "down" };
const ring: Atom[] = HEXAGON.map((p) => ({ el: "C", ...p }));
const ringBonds: Bond[] = [0, 1, 2, 3, 4, 5].map((k) => ({ a: k, b: (k + 1) % 6, order: 1 }));

/** trans-2-Methylcyclohexan-1-ol: C1 (atom 0) with its OH up, C2 (atom 1) with its methyl down. */
const TRANS: { atoms: Atom[]; bonds: Bond[] } = {
  atoms: [...ring, { el: "O", x: 0, y: 3 }, { el: "C", x: 2.598, y: 1.5 }],
  bonds: [...ringBonds, { a: 0, b: 6, order: 1, stereo: "up" }, { a: 1, b: 7, order: 1, stereo: "down" }],
};
/** Its O-sec-butyl ether: the side chain's centre (atom 8) drawn as it is, no group. */
const ETHER: { atoms: Atom[]; bonds: Bond[] } = {
  atoms: [...TRANS.atoms, { el: "C", x: 1.3, y: 3.75 }, { el: "C", x: 1.3, y: 5.25 }, { el: "C", x: 2.6, y: 3 }, { el: "C", x: 3.9, y: 3.75 }],
  bonds: [...TRANS.bonds, { a: 6, b: 8, order: 1 }, { a: 8, b: 9, order: 1, stereo: "up" }, { a: 8, b: 10, order: 1 }, { a: 10, b: 11, order: 1 }],
};
/** 2,4-Dimethylcyclohexan-1-ol: TRANS with a methyl on C4 (atom 3, at the bottom), up. */
const THREE: { atoms: Atom[]; bonds: Bond[] } = {
  atoms: [...TRANS.atoms, { el: "C", x: 0, y: -3 }],
  bonds: [...TRANS.bonds, { a: 3, b: 8, order: 1, stereo: "up" }],
};
/** meso-Butane-2,3-diol, drawn in a zigzag, one OH up and the other down. */
const MESO: { atoms: Atom[]; bonds: Bond[] } = {
  atoms: [
    { el: "C", x: 0, y: 0 },
    { el: "C", x: 1.3, y: 0.75 },
    { el: "C", x: 2.6, y: 0 },
    { el: "C", x: 3.9, y: 0.75 },
    { el: "O", x: 1.3, y: 2.25 },
    { el: "O", x: 2.6, y: -1.5 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 1, b: 2, order: 1 },
    { a: 2, b: 3, order: 1 },
    { a: 1, b: 4, order: 1, stereo: "up" },
    { a: 2, b: 5, order: 1, stereo: "down" },
  ],
};

const blockOf = (m: { atoms: Atom[]; bonds: Bond[] }, collections: Parameters<typeof v3000>[2]) => v3000(m.atoms, m.bonds, collections);

/** A centre named as a toolkit may name it: its first two neighbours the other way round, its sense turned with them. */
const asNamed = (c: ConfiguredCentre): ConfiguredCentre => ({ ...c, neighbours: [c.neighbours[1], c.neighbours[0], ...c.neighbours.slice(2)], sense: c.sense > 0 ? -1 : 1 });
const turned = (c: ConfiguredCentre): ConfiguredCentre => ({ ...c, sense: c.sense > 0 ? -1 : 1 });

/** Each isomer the scripted plugin answers: every centre the drawing reads, those of `turn` turned, and the open ones as given. */
function isomer(block: string, turn: number[], open: ConfiguredCentre[] = []): { configured: IsomerConfiguration; smiles: string } {
  const read = drawnGroupsOf([block])!.read;
  const centres = [...[...read.values()].map((c) => (turn.includes(c.atom) ? turned(c) : c)), ...open].map(asNamed);
  return { configured: { centres, doubles: [] }, smiles: `${turn.join(",")}|${open.map((c) => c.sense).join(",")}` };
}

/** The plugin, scripted: the elements it perceives (every centre specified but those `open`, and `more`), and what it makes. */
function plugin(block: string, made: { configured: IsomerConfiguration; smiles: string }[], open: number[] = [], more: { kind: string; at: number; state: string }[] = []) {
  const centres = [...drawnGroupsOf([block])!.read.keys(), ...open];
  const elements = [...new Set(centres)].map((at) => ({ kind: "centre", at, state: open.includes(at) ? "unspecified" : "specified" }));
  const asked: { op: string; args: unknown }[] = [];
  const chem = {
    request: async (op: string, args: unknown) => (asked.push({ op, args }), op === "stereo_elements" ? { read: true, elements: [...elements, ...more] } : { isomers: made, free: !made.length }),
  } as unknown as ChemClient;
  return { chem, asked };
}

const words = (m: Awaited<ReturnType<typeof isomersToMake>>) => m.isomers.map((_, i) => stereoRows(m, i).map((r) => r.text));

describe("a configuration's groups: the core's type and reading", () => {
  it("reads a collection's name as CTfile writes it, and a structure's groups from its collections", () => {
    expect(stereoGroupNamed("MDLV30/STERAC1")).toEqual({ kind: "and", n: 1, onBonds: false });
    expect(stereoGroupNamed("MDLV30/STEREL2")).toEqual({ kind: "or", n: 2, onBonds: false });
    expect(stereoGroupNamed("MDLV30/STEABS")).toEqual({ kind: "abs", n: 0, onBonds: false });
    expect(stereoGroupNamed("MDLV30/STEBRAC1")).toEqual({ kind: "and", n: 1, onBonds: true });
    expect(stereoGroupNamed("MDLV30/HILITE")).toBeNull();
    const found = groupsIn(
      [
        { name: "MDLV30/STERAC1", atoms: [0, 1], bonds: [4] },
        { name: "MDLV30/STEABS", atoms: [7], bonds: [] },
        { name: "MDLV30/STEREL1", atoms: [3], bonds: [] },
      ],
      10,
    );
    expect(found.groups).toEqual([
      { kind: "and", n: 1, centres: [10, 11] },
      { kind: "or", n: 1, centres: [13] },
    ]);
    expect(found.onBonds).toEqual([{ kind: "and", n: 1 }]);
  });

  it("turns a group whole, and gives the 2^G halves, the one as drawn first", () => {
    const c = {
      centres: [
        { atom: 0, neighbours: [1, 5, 6], sense: 1 as const },
        { atom: 1, neighbours: [0, 2, 7], sense: -1 as const },
        { atom: 3, neighbours: [2, 4, 8], sense: 1 as const },
      ],
      doubles: [],
      groups: [
        { kind: "and" as const, n: 1, centres: [0, 1] },
        { kind: "and" as const, n: 2, centres: [3] },
      ],
    };
    expect(inverted(c, 0).centres.map((x) => x.sense)).toEqual([-1, 1, 1]);
    const all = halves(c);
    expect(all.map((h) => h.turned)).toEqual([[], [0], [1], [0, 1]]);
    expect(all[0].configured).toEqual(c);
    expect(all[3].configured.centres.map((x) => x.sense)).toEqual([-1, 1, -1]);
  });

  it("reads which centres a drawing puts in a group, and their configurations as drawn", () => {
    const g = drawnGroupsOf([blockOf(TRANS, [{ name: "STERAC1", atoms: [0, 1] }])])!;
    expect(g.groups).toEqual([{ kind: "and", n: 1, centres: [0, 1] }]);
    expect(g.drawn.map((c) => c.atom)).toEqual([0, 1]);
    expect(g.held).toEqual([]);
    // (no collection: no group; an absolute one: none either)
    expect(drawnGroupsOf([blockOf(TRANS, [])])!.groups).toEqual([]);
    expect(drawnGroupsOf([blockOf(TRANS, [{ name: "STEABS", atoms: [0, 1] }])])!.groups).toEqual([]);
  });
});

describe("a configuration's groups: the halves made (known answers)", () => {
  it("1: a racemate, and1 on both centres: two, the second the first's mirror image, made as its reflection", async () => {
    const block = blockOf(TRANS, [{ name: "STERAC1", atoms: [0, 1] }]);
    const p = plugin(block, [isomer(block, []), isomer(block, [0, 1])]);
    const m = await isomersToMake(p.chem, block, undefined, "all");
    expect(m.count).toBe(2);
    expect(m.halves?.map((h) => h?.mirrorOf)).toEqual([undefined, 0]);
    expect(words(m)).toEqual([["and1 as drawn"], ["and1 turned over: the mirror image of the half as drawn (same energies)", "made as the mirror image of and1 as drawn: not calculated"]]);
    // (the groups' centres asked back with what is open; what goes to the plugin has no groups)
    const asked = p.asked.find((a) => a.op === "stereoisomers")!.args as { open: { atoms: number[] }; configured: object };
    expect(asked.open.atoms).toEqual([0, 1]);
    expect(Object.keys(asked.configured)).toEqual(["centres", "doubles"]);
    // (one: the half as drawn, said so)
    const one = await isomersToMake(p.chem, block, undefined, "one");
    expect([one.count, one.isomers.length]).toEqual([2, 1]);
    expect(words(one)).toEqual([["and1 as drawn only"]]);
  });

  it("2: an absolute centre beside the group: two diastereomers, both searched, each named", async () => {
    const block = blockOf(ETHER, [{ name: "STERAC1", atoms: [0, 1] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, []), isomer(block, [0, 1])]).chem, block, undefined, "all");
    expect(m.count).toBe(2);
    expect(m.halves?.map((h) => h?.mirrorOf)).toEqual([undefined, undefined]);
    expect(words(m)).toEqual([["and1 as drawn"], ["and1 turned over"]]);
  });

  it("3: two groups and nothing absolute: four, two mirror pairs - two searched, two reflected", async () => {
    const block = blockOf(THREE, [
      { name: "STERAC1", atoms: [0, 1] },
      { name: "STERAC2", atoms: [3] },
    ]);
    const made = [isomer(block, [0, 1, 3]), isomer(block, [3]), isomer(block, []), isomer(block, [0, 1])];
    const m = await isomersToMake(plugin(block, made).chem, block, undefined, "all");
    expect(m.count).toBe(4);
    expect(m.halves?.map((h) => h?.name)).toEqual(["and1 as drawn, and2 as drawn", "and1 turned over, and2 as drawn", "and1 as drawn, and2 turned over", "and1 turned over, and2 turned over"]);
    expect(m.halves?.map((h) => h?.mirrorOf)).toEqual([undefined, undefined, 1, 0]);
  });

  it("4: a meso form, its two centres one group: one, nothing said of a second", async () => {
    const block = blockOf(MESO, [{ name: "STERAC1", atoms: [1, 2] }]);
    // (the toolkit gives one: its turned half is the same compound)
    const m = await isomersToMake(plugin(block, [isomer(block, [])]).chem, block, undefined, "all");
    expect(m.count).toBe(1);
    expect(m.said).toEqual([]);
    expect(words(m)).toEqual([["and1 as drawn"]]);
    // (the toolkit keeping the TURNED half of the one compound - as RDKit's does: the half as drawn all the same, made so, its words
    //  the drawn half's; as or1, no "one of the two", there being one compound)
    const turnedOnly = await isomersToMake(plugin(block, [isomer(block, [1, 2])]).chem, block, undefined, "all");
    expect([turnedOnly.count, turnedOnly.said]).toEqual([1, []]);
    expect(words(turnedOnly)).toEqual([["and1 as drawn"]]);
    const drawn = drawnGroupsOf([block])!.read;
    const key = (c: ConfiguredCentre) => configurationKey({ centres: [c], doubles: [] });
    expect(turnedOnly.isomers[0].centres.map(key)).toEqual([...drawn.values()].map(key));
    const or = blockOf(MESO, [{ name: "STEREL1", atoms: [1, 2] }]);
    const orTurned = await isomersToMake(plugin(or, [isomer(or, [1, 2])]).chem, or, undefined, "all");
    expect(words(orTurned)).toEqual([["or1 as drawn"]]);
  });

  it("5, 13: a half the plugin did not make: said, the count one less, never silent", async () => {
    const block = blockOf(ETHER, [{ name: "STERAC1", atoms: [0, 1] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, [])]).chem, block, undefined, "all");
    expect(m.count).toBe(1);
    expect(m.said).toEqual(["and1 turned over cannot be made in 3D"]);
    expect(words(m)).toEqual([["and1 as drawn", "and1 turned over cannot be made in 3D"]]);
  });

  it("6: an open centre beside an and1 pair and an absolute centre: four, all diastereomers, all searched", async () => {
    // (ETHER with a methyl on C4 not drawn: C4 open)
    const atoms = [...ETHER.atoms, { el: "C", x: 0, y: -3 }];
    const block = v3000(atoms, [...ETHER.bonds, { a: 3, b: 12, order: 1 }], [{ name: "STERAC1", atoms: [0, 1] }]);
    const c4 = (sense: 1 | -1): ConfiguredCentre => ({ atom: 3, neighbours: [2, 4, 12], sense });
    const made = [isomer(block, [], [c4(1)]), isomer(block, [0, 1], [c4(1)]), isomer(block, [], [c4(-1)]), isomer(block, [0, 1], [c4(-1)])];
    const m = await isomersToMake(plugin(block, made, [3]).chem, block, undefined, "all");
    expect(m.count).toBe(4);
    expect(m.halves?.map((h) => h?.name)).toEqual(["and1 as drawn", "and1 turned over", "and1 as drawn", "and1 turned over"]);
    expect(m.halves?.every((h) => h?.mirrorOf == null)).toBe(true);
  });

  it("7: or1 in place of and1: the same two, said to be one of the two, not known which", async () => {
    const block = blockOf(ETHER, [{ name: "STEREL1", atoms: [0, 1] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, []), isomer(block, [0, 1])]).chem, block, undefined, "all");
    expect(words(m)).toEqual([["or1 as drawn: one of the two, not known which"], ["or1 turned over: one of the two, not known which"]]);
  });

  it("8: an absolute collection only: as before, no group, no request for stereoisomers", async () => {
    const block = blockOf(TRANS, [{ name: "STEABS", atoms: [0, 1] }]);
    const p = plugin(block, []);
    const m = await isomersToMake(p.chem, block, undefined, "all");
    expect([m.count, m.halves, m.said]).toEqual([1, undefined, []]);
    expect(m.isomers).toEqual([{ centres: [], doubles: [], groups: [] }]);
    // (what is open read by Meno itself: the plugin asked nothing)
    expect(p.asked.map((a) => a.op)).toEqual([]);
  });

  it("9: a group's centre that does not read: the group made as drawn, the atom named, no half called so", async () => {
    // (C2's methyl drawn plain: C2 open, its group not turned)
    const bonds = TRANS.bonds.map((b) => (b.a === 1 && b.b === 7 ? { a: 1, b: 7, order: 1 } : b));
    const block = v3000(TRANS.atoms, bonds, [{ name: "STERAC1", atoms: [0, 1] }]);
    const c2 = (sense: 1 | -1): ConfiguredCentre => ({ atom: 1, neighbours: [0, 2, 7], sense });
    const made = [isomer(block, [], [c2(1)]), isomer(block, [], [c2(-1)]), isomer(block, [0], [c2(1)]), isomer(block, [0], [c2(-1)])];
    const m = await isomersToMake(plugin(block, made, [1]).chem, block, undefined, "all");
    expect(m.count).toBe(2);
    expect(m.said).toEqual(["and1 is made as drawn: its configuration does not read at atom 2"]);
    expect(m.halves).toEqual([undefined, undefined]);
  });

  it("R3: a group the toolkit turned in part: none of its halves taken, made as drawn, said", async () => {
    const block = blockOf(ETHER, [{ name: "STERAC1", atoms: [0, 1] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, []), isomer(block, [0])]).chem, block, undefined, "all");
    expect(m.count).toBe(1);
    expect(m.said).toEqual(["and1 is made as drawn: its centres did not turn as one at atom 1"]);
    // (and one with a centre outside every group turned: not taken)
    const n = await isomersToMake(plugin(block, [isomer(block, []), isomer(block, [0, 1, 8])]).chem, block, undefined, "all");
    expect(n.count).toBe(1);
  });

  it("11: a structure with an axis: both halves searched, none reflected", async () => {
    // (TRANS with a buta-1,2-dienyl on C4: its allene's axis, which a reflection would turn too)
    const allene = { atoms: [...TRANS.atoms, { el: "C", x: 0, y: -3 }, { el: "C", x: 0, y: -4.3 }, { el: "C", x: 0, y: -5.6 }, { el: "C", x: 1.3, y: -6.3 }], bonds: [...TRANS.bonds, { a: 3, b: 8, order: 1 }, { a: 8, b: 9, order: 2 }, { a: 9, b: 10, order: 2 }, { a: 10, b: 11, order: 1 }] };
    const block = blockOf(allene, [{ name: "STERAC1", atoms: [0, 1] }]);
    const p = plugin(block, [isomer(block, []), isomer(block, [0, 1])]);
    const m = await isomersToMake(p.chem, block, undefined, "all");
    expect(m.count).toBe(2);
    expect(m.halves?.map((h) => h?.mirrorOf)).toEqual([undefined, undefined]);
  });

  it("12: a group that holds a bond: the bond not turned, said so", async () => {
    const block = blockOf(TRANS, [{ name: "STERAC1", atoms: [0, 1], bonds: [2] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, []), isomer(block, [0, 1])]).chem, block, undefined, "all");
    expect(m.said).toContain("its and1 on a bond is made as drawn: a bond's configuration is not turned");
    expect(m.count).toBe(2);
  });

  it("asks for every half whole, and refuses a structure of more than the most: never some of them", async () => {
    const block = blockOf(TRANS, [{ name: "STERAC1", atoms: [0, 1] }]);
    const p = plugin(block, [isomer(block, []), isomer(block, [0, 1])]);
    await isomersToMake(p.chem, block, undefined, "all");
    expect((p.asked.find((a) => a.op === "stereoisomers")!.args as { whole?: boolean; most: number })).toMatchObject({ whole: true, most: 32 });
    const many = { request: async (op: string) => (op === "stereo_elements" ? { read: true, elements: [0, 1].map((at) => ({ kind: "centre", at, state: "specified" })) } : { tooMany: { counted: 33, bound: 64 } }) } as unknown as ChemClient;
    await expect(isomersToMake(many, block, undefined, "all")).rejects.toThrow("more than the 32 stereoisomers made of one");
  });

  it("reads a group in the second part of a structure by that part's atoms, numbered on from the first's", () => {
    const first = blockOf(MESO, []);
    const second = blockOf(TRANS, [{ name: "STERAC1", atoms: [0, 1] }]);
    const g = drawnGroupsOf([first, second])!;
    expect(g.groups).toEqual([{ kind: "and", n: 1, centres: [MESO.atoms.length, MESO.atoms.length + 1] }]);
  });

  it("takes no half for a mirror image where the structure has a metal, which a reflection would turn too: each searched", async () => {
    // (TRANS with its O bound to an Fe)
    const block = v3000([...TRANS.atoms, { el: "Fe", x: 0, y: 4.5 }], [...TRANS.bonds, { a: 6, b: 8, order: 1 }], [{ name: "STERAC1", atoms: [0, 1] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, []), isomer(block, [0, 1])]).chem, block, undefined, "all");
    expect(m.count).toBe(2);
    expect(m.halves?.map((h) => h?.mirrorOf)).toEqual([undefined, undefined]);
  });

  it("14: the plugin's turned half first: the half as drawn still first", async () => {
    const block = blockOf(ETHER, [{ name: "STERAC1", atoms: [0, 1] }]);
    const m = await isomersToMake(plugin(block, [isomer(block, [0, 1]), isomer(block, [])]).chem, block, undefined, "all");
    expect(m.halves?.map((h) => h?.name)).toEqual(["and1 as drawn", "and1 turned over"]);
    const g = drawnGroupsOf([block])!;
    expect(m.isomers[0].centres.find((c) => c.atom === 0)).toEqual(asNamed(g.read.get(0)!));
  });
});
