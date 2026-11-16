import { describe, expect, it } from "vitest";
import { readStereo } from "../../../../lib/layout/drawn";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { MENO } from "../../../../lib/chem/style";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawingOf as readDrawing, forFlatReaders } from "./drawing";
import { drawingOf } from "./fromSmiles";
import { laidOut } from "./cleanUp";
import heldOut from "../../../../../scripts/layout/heldout.json";

// A typed SMILES comes back from the plugin as a MOL block with wedges, read as a file and laid out by Meno's engine (chem/fromSmiles
// `drawingOf`). Where the engine left two of a centre's bonds in one line with the wedge on one of them - a sugar's C1 on a ring
// (doxorubicin, ouabain), a lactone's carbon (ginkgolide B, bilobalide), vinblastine's C5 - Meno's reader could not read the centre,
// and Clean-up refused the drawing. Its H is now drawn in the widest gap and wedged instead. (The block here is Meno's own writing of
// the SMILES, wedged, in the plugin's place: the route from the block on is the app's.)

const named = (name: string) => (heldOut as { molecules: { name: string; smiles: string }[] }).molecules.find((m) => m.name === name)!.smiles;

/** How many centres `model` shows, as Meno reads it. */
const centres = (model: Model) => {
  const d = readDrawing(model);
  return readStereo(d.atoms, d.bonds).tetra.size;
};

describe("a structure from a typed SMILES", () => {
  for (const [name, smiles, n] of [
    ["vinblastine", named("Vinblastine"), 9],
    ["ginkgolide B", named("Ginkgolide B"), 11],
    ["bilobalide", named("Bilobalide"), 6],
    ["doxorubicin", named("Doxorubicin"), 6],
    ["ouabain", named("Ouabain"), 15],
    ["aconitine", named("Aconitine"), 14],
    ["epibatidine", "Clc1ccc(cn1)[C@H]1C[C@@H]2CC[C@H]1N2", 3],
  ] as const) {
    it(`shows every centre, and cleans up: ${name}`, { timeout: 180000 }, async () => {
      const typed = await drawingOf(writeMolfile(forFlatReaders(drawnFromSmiles(smiles))));
      expect(typed.asCame, name).toBeUndefined();
      expect(centres(typed), name).toBe(n);
      const cleaned = await laidOut(typed, MENO);
      expect(centres(cleaned), name).toBe(n);
    });
  }
});
