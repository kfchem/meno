import { afterEach, describe, expect, it } from "vitest";
import type { Configured } from "../../../../lib/roles/client";
import { geometryKey, type Entry } from "../../../../lib/entry";
import { convert } from "../../../../lib/units";
import { PROPERTY } from "../../../../lib/nodes/base";
import { populations } from "../../../../lib/nodes/populations";
import { forgetStereo, perceiveStereo, stereoKnown, withLonePairs, type Asker } from "./configurations";
import { entryOfSet, setEntries } from "./entries";
import type { Molecule3D } from "../store/types";

/** Water at three geometries: the same atoms and bonds, its second hydrogen moved further each time. */
const water = (k: number) => ({
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.96, y: 0, z: 0 },
    { el: "H", x: -0.24, y: 0.93 + 0.1 * k, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
});
const geometry = (k: number) => {
  const w = water(k);
  return { atoms: w.atoms, bonds: w.bonds, xyz: w.atoms.flatMap((a) => [a.x, a.y, a.z]) };
};

/** A plugin that answers each MOL block it is given with `answer`, and counts what it was asked. */
function plugin(answer: (block: string, i: number) => Configured = () => ({ elements: [], key: "O" })) {
  const asked: string[][] = [];
  const asker: Asker = {
    plugin: "rdkit",
    version: "0.1.7",
    ask: async (blocks) => {
      asked.push(blocks);
      return blocks.map(answer);
    },
  };
  return { asker, asked };
}

afterEach(() => forgetStereo());

describe("which stereoisomer each entry is", () => {
  it("is asked once for each geometry, every conformer its own - not again while it is known", async () => {
    const { asker, asked } = plugin();
    await perceiveStereo([geometry(0), geometry(1), geometry(0)], asker);
    // (two geometries: the same one twice asked once)
    expect(asked.map((b) => b.length)).toEqual([2]);
    await perceiveStereo([geometry(0), geometry(1), geometry(2)], asker);
    expect(asked.map((b) => b.length)).toEqual([2, 1]);
    expect(stereoKnown(geometry(1))).toEqual({ perceived: true, elements: [], key: "O", by: { plugin: "rdkit", version: "0.1.7" } });
  });

  it("says why it is not perceived: a molecule the plugin could not read, or nothing added to ask - which is asked again once something is", async () => {
    const { asker: picky } = plugin((_b, i) => (i === 0 ? { error: "cannot make sense of the structure" } : { elements: [], key: "O" }));
    await perceiveStereo([geometry(0), geometry(1)], picky);
    expect(stereoKnown(geometry(1))?.perceived).toBe(true);
    expect(stereoKnown(geometry(0))).toEqual({ perceived: false, why: "cannot make sense of the structure" });
    await perceiveStereo([geometry(3)], { none: "Nothing added tells stereoisomers apart" });
    expect(stereoKnown(geometry(3))).toEqual({ perceived: false, why: "Nothing added tells stereoisomers apart" });
    // (a plugin added since: asked now)
    await perceiveStereo([geometry(3)], plugin().asker);
    expect(stereoKnown(geometry(3))?.perceived).toBe(true);
  });

  it("is asked again where the plugin failed altogether, not kept as an answer", async () => {
    let fail = true;
    const asker: Asker = { plugin: "rdkit", version: "0.1.7", ask: async (b) => (fail ? Promise.reject(new Error("worker stopped")) : b.map(() => ({ elements: [], key: "O" }))) };
    await perceiveStereo([geometry(0)], asker);
    expect(stereoKnown(geometry(0))).toEqual({ perceived: false, why: "It could not be asked: worker stopped" });
    fail = false;
    await perceiveStereo([geometry(0)], asker);
    expect(stereoKnown(geometry(0))?.perceived).toBe(true);
  });

  it("goes with each frame of a conformer set as an entry, so that a set of two configurations shows two", async () => {
    // (one compound's two conformers whose geometries the plugin keys apart - as a search on an unspecified centre can embed both)
    const m: Molecule3D = { id: 1, at: { x: 0, y: 0 }, ...water(0), frames: [geometry(1).xyz], conformerSet: true };
    const { asker } = plugin((_b, i) => ({ elements: [{ kind: "centre", atoms: [0], specified: true }], key: i === 0 ? "R" : "S" }));
    await perceiveStereo(setEntries([m], "conformers"), asker);
    const entries = setEntries([m], "conformers").map((e, i) => entryOfSet(e, `e${i}`));
    expect(entries.map((e) => (e.stereo?.perceived ? e.stereo.key : null))).toEqual(["R", "S"]);
  });
});

describe("a centre of three bonds the plugin leaves unspecified", () => {
  // (heavy atoms alone, synthetic: an atom of three bonds at the origin, its neighbours below it round z - and
  // its mirror image, z turned; as the plugin answers such a pair, its toolkit fixing no P, As or aziridine N
  // from a geometry: the centre unspecified, one key for both)
  const below = Math.sin((19.5 * Math.PI) / 180);
  /** Atoms by element, placed where `xyz` puts them, and bonds of order 1: a geometry as an entry holds one. */
  const placed = (els: string[], bonds: [number, number][], xyz: number[]) => ({
    atoms: els.map((el, i) => ({ el, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] })),
    bonds: bonds.map(([a1, a2]) => ({ a1, a2, order: 1 })),
    xyz,
  });
  const pyramidOf = (el: string, r: number, mirror: boolean) => {
    const round = [0, 120, 240].map((t) => [r * Math.cos((t * Math.PI) / 180), r * Math.sin((t * Math.PI) / 180), -r * below]);
    const xyz = [[0, 0, 0], ...round, [-1.6, 2.4, -0.3]].flatMap(([x, y, z]) => [x, y, mirror ? -z : z]);
    return placed([el, "C", "C", "Cl", "C"], [[0, 1], [0, 2], [0, 3], [2, 4]], xyz);
  };
  const aziridine = (side: 1 | -1, on = "Cl") =>
    placed(["N", "C", "C", on, "C"], [[0, 1], [0, 2], [1, 2], [0, 3], [1, 4]], [0, 0, 0, 1.47, 0, 0, 0.74, 1.27, 0, -0.9, -0.6, 1.3 * side, 2.2, -0.9, 0.9]);
  /** The phosphine flattened: its three neighbours in the P's plane, 120 degrees apart. */
  const flatP = () => {
    const g = pyramidOf("P", 1.85, false);
    const xyz = g.xyz.map((v, k) => (k % 3 === 2 && k < 12 ? 0 : v));
    return placed(["P", "C", "C", "Cl", "C"], [[0, 1], [0, 2], [0, 3], [2, 4]], xyz);
  };
  const unspecified = { elements: [{ kind: "centre" as const, atoms: [0], specified: false }], key: "CCP(C)Cl" };
  /** Free energies at 298.15 K, `kcal` above -100 Eh, worked out alike: an entry of `g` in `group`, perceived as the plugin answers it. */
  const entryOf = (g: ReturnType<typeof placed>, id: string, kcal: number, group: string): Entry => ({
    id,
    from: [],
    structure: { atoms: g.atoms.map((a) => ({ el: a.el })), bonds: g.bonds.map((b) => ({ ...b, order: 1 as const })) },
    geometry: { kind: "3d", xyz: g.xyz },
    species: { charge: 0, multiplicity: 1, from: { charge: "atoms", multiplicity: "atoms" } },
    properties: {
      [PROPERTY.freeEnergy]: {
        value: -100 + convert(kcal, "kcal/mol", "Eh"),
        unit: "Eh",
        at: { geometry: geometryKey(g.xyz), kelvin: 298.15, atm: 1 },
        by: { program: "P", method: "M", basis: "B", treatment: "T" },
        status: "computed",
      },
      group: { value: group, unit: "none", status: "computed" },
    },
    status: "done",
    stereo: stereoKnown(g)!,
  });

  it("is read from the geometry, specified, its configuration in the key: a phosphine's P-epimers, an arsine's, an N-chloro aziridine's told apart", () => {
    for (const [name, pair] of [
      ["P", [pyramidOf("P", 1.85, false), pyramidOf("P", 1.85, true)]],
      ["As", [pyramidOf("As", 1.95, false), pyramidOf("As", 1.95, true)]],
      ["N", [aziridine(1), aziridine(-1)]],
    ] as const) {
      const [one, other] = pair.map((g) => withLonePairs(g, unspecified));
      expect(one.elements, name).toEqual([{ kind: "centre", atoms: [0], specified: true }]);
      expect(other.elements, name).toEqual([{ kind: "centre", atoms: [0], specified: true }]);
      expect(one.key.startsWith("CCP(C)Cl|"), name).toBe(true);
      expect(one.key, name).not.toBe(other.key);
    }
  });

  it("leaves what the plugin specified as it is: a sulfoxide's S-epimers, keyed apart already", () => {
    const sulfoxide = (mirror: boolean) => {
      const g = pyramidOf("S", 1.8, mirror);
      return { ...g, atoms: g.atoms.map((a, i) => ({ ...a, el: ["S", "C", "C", "O", "C"][i] })) };
    };
    const answers = [
      { elements: [{ kind: "centre" as const, atoms: [0], specified: true }], key: "CC[S@](C)=O" },
      { elements: [{ kind: "centre" as const, atoms: [0], specified: true }], key: "CC[S@@](C)=O" },
    ];
    expect([false, true].map((m, i) => withLonePairs(sulfoxide(m), answers[i]))).toEqual(answers);
  });

  it("lets Populations weigh a phosphine, and keeps its two P-epimers two: never one sum over both", async () => {
    // (each answered as the plugin answers it, then perceived)
    const pair = [pyramidOf("P", 1.85, false), pyramidOf("P", 1.85, true)];
    const { asker } = plugin(() => unspecified);
    await perceiveStereo(pair, asker);
    // (each alone in its group: weighed, its configuration known)
    const apart = populations([entryOf(pair[0], "p0", 0, "a"), entryOf(pair[1], "p1", 1, "b")], { kelvin: 298.15 });
    if (!apart.ok) throw new Error(apart.said);
    expect(apart.exits.done.map((e) => e.id)).toEqual(["p0", "p1"]);
    // (the two in one group: two configurations, not weighed in one sum)
    const together = populations([entryOf(pair[0], "p0", 0, "a"), entryOf(pair[1], "p1", 1, "a")], { kelvin: 298.15 });
    if (!together.ok) throw new Error(together.said);
    expect(together.exits.done).toEqual([]);
    expect(together.exits.failed.map((e) => e.status)).toEqual([
      { failed: expect.stringMatching(/holds 2 configurations/) },
      { failed: expect.stringMatching(/holds 2 configurations/) },
    ]);
  });

  it("stays unspecified where it is too close to flat to have a configuration, saying how flat, or where an atom is placed nowhere: the key the plugin's", () => {
    const flat = withLonePairs(flatP(), unspecified);
    expect(flat.elements).toEqual([{ kind: "centre", atoms: [0], specified: false, flat: expect.closeTo(360, 6) }]);
    expect(flat.key).toBe(unspecified.key);
    const nowhere = pyramidOf("P", 1.85, false);
    expect(withLonePairs({ ...nowhere, xyz: nowhere.xyz.map((v, k) => (k === 3 ? Number.NaN : v)) }, unspecified)).toEqual(unspecified);
  });

  it("goes where its lone pair keeps no configuration: a plain N-methyl aziridine's N, its two invertomers then one stereoisomer", () => {
    const answer = { elements: [{ kind: "centre" as const, atoms: [0], specified: false }], key: "CC1CN1C" };
    const [one, other] = [aziridine(1, "C"), aziridine(-1, "C")].map((g) => withLonePairs(g, answer));
    expect(one).toEqual({ elements: [], key: "CC1CN1C" });
    expect(other).toEqual(one);
  });

  it("is asked only of a centre of one atom: an element of another kind at the same atom, or of two atoms, is as the plugin gave it", () => {
    const g = pyramidOf("P", 1.85, false);
    for (const elements of [
      [{ kind: "other" as const, atoms: [0], specified: false }],
      [{ kind: "centre" as const, atoms: [0, 1], specified: false }],
      [{ kind: "double" as const, atoms: [0, 1], specified: false }],
    ]) {
      const answer = { elements, key: "CCP(C)Cl" };
      expect(withLonePairs(g, answer)).toEqual(answer);
    }
  });

  it("marks a centre the plugin gives twice specified twice, keyed as if given once", () => {
    const g = pyramidOf("P", 1.85, false);
    const twice = withLonePairs(g, { elements: [...unspecified.elements, ...unspecified.elements], key: unspecified.key });
    expect(twice.elements).toEqual([
      { kind: "centre", atoms: [0], specified: true },
      { kind: "centre", atoms: [0], specified: true },
    ]);
    expect(twice.key).toBe(withLonePairs(g, unspecified).key);
  });

  it("lets Populations name a centre too close to flat to have a configuration, and weigh a plain N-methyl aziridine's two invertomers in one sum", async () => {
    const p = flatP();
    const invertomers = [aziridine(1, "C"), aziridine(-1, "C")];
    await perceiveStereo([p], plugin(() => unspecified).asker);
    await perceiveStereo(invertomers, plugin(() => ({ elements: [{ kind: "centre", atoms: [0], specified: false }], key: "CC1CN1C" })).asker);
    const flat = populations([entryOf(p, "flat", 0, "a")], { kelvin: 298.15 });
    if (!flat.ok) throw new Error(flat.said);
    expect(flat.exits.failed.map((e) => e.status)).toEqual([{ failed: "P (atom 1) is too close to flat to have a configuration" }]);
    const both = populations([entryOf(invertomers[0], "n0", 0, "a"), entryOf(invertomers[1], "n1", 0.5, "a")], { kelvin: 298.15 });
    if (!both.ok) throw new Error(both.said);
    expect(both.exits.done.map((e) => e.id)).toEqual(["n0", "n1"]);
  });
});
