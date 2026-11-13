import { describe, expect, it } from "vitest";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawingOf, forFlatReaders } from "./drawing";
import { laidOut } from "./cleanUp";
import { MENO } from "../../../../lib/chem/style";

// A cage drawn in perspective is written for flat readers (a MOL file, RDKit) with a wedge at each centre; where its projection
// leaves two of a centre's bonds in one line - epibatidine's C2, its pyridyl straight on from a bridgehead - a wedge there says
// nothing surely, and Meno's own reader left it open: its H is drawn in the widest gap and wedged instead.

/** Each centre's configuration as `model` is read, by atom id; an H drawn as an atom counted as the centre's own (-1). */
function configurations(model: Model) {
  const d = drawingOf(model);
  const ids = model.atoms.map((a) => a.id);
  const isH = (i: number) => model.atoms[i].el === "H";
  const out = new Map<number, { neighbours: number[]; volume: 1 | -1 }>();
  for (const [c, t] of readStereo(d.atoms, d.bonds).tetra) out.set(ids[c], { neighbours: t.neighbours.map((n) => (n < 0 || isH(n) ? -1 : ids[n])), volume: t.volume });
  return out;
}

describe("a cage written for flat readers", () => {
  for (const smiles of ["Clc1ccc(cn1)[C@H]1C[C@@H]2CC[C@H]1N2", "[C@@H]12CC[C@@H](N1)[C@H](C2)c1ccc(Cl)nc1"]) {
    it(`says every centre the drawing shows, as the drawing has it, and cleans up: epibatidine, ${smiles}`, { timeout: 120000 }, async () => {
      const drawn = drawnFromSmiles(smiles);
      const before = configurations(drawn);
      expect(before.size).toBe(3);
      const flat = forFlatReaders(drawn) as unknown as Model;
      const strip = { atoms: flat.atoms.map(({ id, x, y, el }) => ({ id, x, y, el, r: 0.9 })), bonds: flat.bonds } as unknown as Model;
      const after = configurations(strip);
      for (const [c, t] of before) {
        const r = after.get(c);
        expect(r, `centre ${c}`).toBeDefined();
        expect(sameConfiguration(r!, t), `centre ${c}`).toBe(true);
      }
      await expect(laidOut(strip, MENO)).resolves.toBeDefined();
    });
  }
});
