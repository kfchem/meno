import { describe, expect, it, vi } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import { identity } from "../../../../lib/chem/identity";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import type { ChemClient } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { identityOfDrawn } from "./identityOf";
import { configurationOf, molblockOf, polygon } from "./testdata/givenPictures";

/**
 * Every route that lays out a plugin's drawing passes the configuration the plugin sent beside it (backlog 106 B): a typed SMILES, a
 * formula drawn of a molecule in 3D, a step's stereoisomers and a step's structures made as SMILES. The plugin stood in for: a ring-36
 * lactone's polygon, whose centre its picture cannot state, and the field naming it.
 */

const LACTONE = "C[C@@H]1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O1";
const MIRROR = "C[C@H]1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O1";
const BLOCK = molblockOf(polygon(LACTONE));
const own = (smiles: string) => identity(smilesInput(smiles)).text;

/** A plugin that answers `op` with the block and `configuration`, and nothing else. */
function plugin(op: string, answer: (args: Record<string, unknown>) => unknown): ChemClient {
  return { request: async (asked: string, args: Record<string, unknown>) => (asked === op ? answer(args) : Promise.reject(new Error(`no ${asked} here`))) } as unknown as ChemClient;
}

let smilesPlugin: ChemClient;
vi.mock("../../../../lib/roles/worker", async (actual) => ({ ...(await actual<typeof import("../../../../lib/roles/worker")>()), chemWorker: async () => smilesPlugin }));

describe("a typed SMILES (structureFromSmiles)", () => {
  it("is laid out from the field: the ring-36 lactone and its mirror image each its own SMILES - and as it came without the field", async () => {
    const { structureFromSmiles } = await import("./fromSmiles");
    for (const smiles of [LACTONE, MIRROR]) {
      smilesPlugin = plugin("from_smiles", () => ({ molblock: BLOCK, configuration: configurationOf(smiles) }));
      const drawn = await structureFromSmiles(smiles, MENO);
      expect(drawn.asCame, smiles).toBeUndefined();
      expect(identityOfDrawn(drawn).text, smiles).toBe(own(smiles));
    }
    smilesPlugin = plugin("from_smiles", () => ({ molblock: BLOCK }));
    const without = await structureFromSmiles(LACTONE, MENO);
    expect(identityOfDrawn(without).text).not.toBe(own(LACTONE));
  }, 60000);
});

describe("a formula drawn of a molecule in 3D (formulaOf)", () => {
  it("is laid out from the field the plugin read of it in 3D", async () => {
    const { formulaOf } = await import("./make3d");
    const picture = polygon(LACTONE);
    // (the molecule in 3D: the picture's heavy atoms, flat - its bonds' orders given, so the plugin is asked only to draw it)
    const molecule = { id: 1, at: { x: 0, y: 0 }, atoms: picture.atoms.map((a) => ({ el: a.el ?? "C", x: a.x, y: a.y, z: 0 })), bonds: bondsOf(picture), wholeWithoutH: true as const };
    for (const smiles of [LACTONE, MIRROR]) {
      const chem = plugin("drawing_of", () => ({ molblock: BLOCK, perceived: true, configuration: configurationOf(smiles) }));
      const { model } = await formulaOf(chem, molecule as never, 0, MENO);
      expect(identityOfDrawn(model).text, smiles).toBe(own(smiles));
    }
  }, 60000);
});

describe("a step's structures", () => {
  it("made as drawings (madeDrawn): each laid out from its own field, the second's from the second", async () => {
    const { madeDrawn } = await import("./fromSmiles");
    const drawn = await madeDrawn({ made: [BLOCK, BLOCK], configurations: [configurationOf(LACTONE), configurationOf(MIRROR)] }, MENO);
    expect(drawn.map((d) => identityOfDrawn(d).text)).toEqual([own(LACTONE), own(MIRROR)]);
  }, 60000);

  it("made as SMILES (smilesMadeDrawn): laid out from what the plugin read beside its block", async () => {
    const { smilesMadeDrawn } = await import("./fromSmiles");
    for (const smiles of [LACTONE, MIRROR]) {
      const drawn = await smilesMadeDrawn(smiles, { molblock: BLOCK, configuration: configurationOf(smiles) }, MENO);
      expect(identityOfDrawn(drawn).text, smiles).toBe(own(smiles));
    }
  }, 60000);
});

/** A drawing's bonds by its atoms' places in it, as a molecule in 3D has them. */
function bondsOf(m: Model): { a1: number; a2: number; order: number }[] {
  const index = new Map(m.atoms.map((a, i) => [a.id, i]));
  return m.bonds.map((b) => ({ a1: index.get(b.a)!, a2: index.get(b.b)!, order: b.order }));
}

