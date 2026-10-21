import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Configured } from "../../../../lib/roles/client";
import { forgetStereo, perceiveStereo, stereoKnown, type Asker } from "./configurations";
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

describe("the RDKit the configurations were checked with", () => {
  it("is the one the plugin's lock fixes: a new one runs the known cases again first (scripts/calc/test_plugin_rdkit.py, Configurations)", () => {
    // (RDKit marks FindPotentialStereo experimental; its answers on the known cases passed with this version - when
    // the lock moves, CI's plugins job runs those tests with the new one: once they pass, write it here)
    const CHECKED_WITH = "2026.3.6";
    const lock = readFileSync(resolve(__dirname, "../../../../../src-tauri/resources/plugins/rdkit/requirements.lock"), "utf8");
    expect(lock.match(/^rdkit==(\S+)/m)?.[1]).toBe(CHECKED_WITH);
  });
});
