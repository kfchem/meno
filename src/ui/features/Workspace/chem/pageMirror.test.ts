import { describe, expect, it } from "vitest";
import { readMolfile } from "../../../../lib/chem/ctfile";
import type { ChemClient } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { blocksOf, conformersOf } from "./make3d";
import { hasConfiguration, madeAs, mirroredConfiguration, mirroredPart, reflectedConformers } from "./pageMirror";

/** Butan-2-ol drawn: C1-C2(-O5)-C3-C4, its O on a wedge out of C2, up or down - the same places, mirror images. */
const butanol = (stereo: "up" | "down"): Model => ({
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1.3, y: 0.75, r: 0.9, el: "C" },
    { id: 3, x: 2.6, y: 0, r: 0.9, el: "C" },
    { id: 4, x: 3.9, y: 0.75, r: 0.9, el: "C" },
    { id: 5, x: 1.3, y: 2.25, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1 },
    { id: 12, a: 2, b: 3, order: 1 },
    { id: 13, a: 3, b: 4, order: 1 },
    { id: 14, a: 2, b: 5, order: 1, stereo },
  ],
});
const none = { centres: [], doubles: [] };

/**
 * A plugin that makes a block's one conformer where its drawing puts its
 * atoms - each wedged atom lifted out of the page, each hashed one behind
 * it - so that it has the configuration drawn; labelled R where the wedge
 * is up, as a stand-in for the toolkit's label. It records what it was asked.
 */
function plugin(wrongWhenMirrored = false) {
  const asked: { molblock: string; isomers: unknown[] }[] = [];
  const chem = {
    request: async (_op: string, args: { molblock: string; isomers: unknown[] }) => {
      asked.push({ molblock: args.molblock, isomers: args.isomers });
      const ct = readMolfile(args.molblock)!;
      const z = ct.atoms.map(() => 0);
      // (or, asked for a mirror image, one made the other way round: as a toolkit might, where it does)
      const turn = wrongWhenMirrored && asked.length === 1 ? -1 : 1;
      for (const b of ct.bonds) if (b.stereo === "up" || b.stereo === "down") z[b.a2] = (b.stereo === "up" ? 1 : -1) * turn;
      const up = ct.bonds.some((b) => b.stereo === "up");
      return {
        isomers: args.isomers.map(() => ({
          atoms: ct.atoms.map((a) => ({ el: a.symbol, charge: 0 })),
          bonds: ct.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: 1 })),
          frames: [ct.atoms.flatMap((a, i) => [a.x, a.y, z[i]])],
          field: "MMFF94",
          cip: { atoms: { "1": up ? "R" : "S" }, bonds: {} },
          smiles: up ? "CC[C@@H](C)O" : "CC[C@H](C)O",
        })),
      };
    },
  } as unknown as ChemClient;
  return { chem, asked };
}

/** The plugin that finds stereoisomers: the drawing's one centre given, nothing left open. */
const stereo = {
  request: async (op: string) => (op === "stereo_elements" ? { read: true, elements: [{ kind: "centre", at: 1, state: "specified" }] } : Promise.reject(new Error(`no ${op} here`))),
} as unknown as ChemClient;

describe("the page's mirror images", () => {
  it("makes one of two enantiomers itself and the other as its mirror image, by which identity comes first", () => {
    const as = (["up", "down"] as const).map((s) => madeAs(butanol(s), none));
    expect([...as].sort()).toEqual(["itself", "mirror"]);
  });

  it("makes itself a structure with no stereo, a meso form, one with a label written out, or a wedge it cannot read", () => {
    const ethanol: Model = { atoms: butanol("up").atoms.slice(0, 3), bonds: butanol("up").bonds.slice(0, 2) };
    expect(madeAs(ethanol, none)).toBe("itself");
    // (meso-butane-2,3-diol drawn as a zigzag, its two O across the chain from each other: one on a wedge, the other
    //  on hashes - R and S. Both on wedges is the R,R or S,S form, chiral)
    const meso: Model = {
      atoms: [...butanol("up").atoms, { id: 6, x: 2.6, y: -1.5, r: 0.9, el: "O" }],
      bonds: [...butanol("up").bonds, { id: 15, a: 3, b: 6, order: 1, stereo: "down" }],
    };
    expect(madeAs(meso, none)).toBe("itself");
    expect(madeAs(mirroredPart(meso), none)).toBe("itself");
    const rr: Model = { ...meso, bonds: meso.bonds.map((x) => (x.id === 15 ? { ...x, stereo: "up" as const } : x)) };
    expect([madeAs(rr, none), madeAs(mirroredPart(rr), none)].sort()).toEqual(["itself", "mirror"]);
    const labelled: Model = { ...butanol("up"), atoms: butanol("up").atoms.map((a) => (a.id === 4 ? { ...a, el: "Ph" } : a)) };
    expect(madeAs(labelled, none)).toBe("itself");
  });

  it("asks the plugin for the same structure whichever of the two is asked for, and gives the other its reflection", async () => {
    const made = [];
    const sent = [];
    for (const s of ["up", "down"] as const) {
      const { chem, asked } = plugin();
      const [block] = blocksOf(butanol(s), [1]);
      made.push((await conformersOf(chem, stereo, block, "one"))[0]);
      sent.push(asked.map((a) => a.molblock));
    }
    // (one request each, of one and the same block: the two drawings' one that is made itself)
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]).toEqual(sent[1]);
    // (each with the configuration drawn, its R or S as its own: the reflection's turned)
    expect(made.map((c) => c.cip.atoms["1"]).sort()).toEqual(["R", "S"]);
    const [up, down] = made;
    expect(down.frames[0].map((v, k) => (k % 3 === 0 ? -v : v))).toEqual(up.frames[0].map((v) => v));
  });

  it("makes one itself where the reflection of its mirror image has not its configuration after all", async () => {
    // (the drawing made as a mirror image: the one that is)
    const twin = (["up", "down"] as const).find((s) => madeAs(butanol(s), none) === "mirror")!;
    const { chem, asked } = plugin(true);
    const [block] = blocksOf(butanol(twin), [1]);
    const [c] = await conformersOf(chem, stereo, block, "one");
    // (asked for the mirror image, then for itself: its own block, its own conformer, as drawn)
    expect(asked).toHaveLength(2);
    expect(asked[1].molblock).toBe(block.molblock);
    expect(hasConfiguration(c, block.part, none)).toBe(true);
  });

  it("reflects conformers through a plane and turns R and S, M and P - not r and s, nor E and Z", () => {
    const c = reflectedConformers({
      atoms: [],
      bonds: [],
      frames: [[1, 2, 3, -4, 5, 6]],
      field: "UFF",
      cip: { atoms: { "0": "R", "1": "s", "2": "M" }, bonds: { "3": "E" } },
      smiles: "C[C@@H](O)[C@H](N)C",
    });
    expect(c.frames).toEqual([[-1, 2, 3, 4, 5, 6]]);
    expect(c.cip).toEqual({ atoms: { "0": "S", "1": "s", "2": "P" }, bonds: { "3": "E" } });
    expect(c.smiles).toBe("C[C@H](O)[C@@H](N)C");
  });

  it("turns a chosen configuration's centres, not its double bonds", () => {
    expect(mirroredConfiguration({ centres: [{ atom: 1, neighbours: [0, 2, 4], sense: 1 }], doubles: [{ bond: 2, ends: [0, 3], cis: true }] })).toEqual({
      centres: [{ atom: 1, neighbours: [0, 2, 4], sense: -1 }],
      doubles: [{ bond: 2, ends: [0, 3], cis: true }],
    });
  });

  it("says whether conformers have the configuration asked for: a reflection that did not give it is made itself", () => {
    const part = butanol("up");
    // (C2 at the origin, its O out of the page as drawn, or behind it)
    const at = (oz: number) => [[0, 0, 0, 1.3, 0.75, 0, 2.6, 0, 0, 3.9, 0.75, 0, 1.3, 2.25, oz]];
    expect(hasConfiguration({ frames: at(1) }, part, none)).toBe(true);
    expect(hasConfiguration({ frames: at(-1) }, part, none)).toBe(false);
  });
});
