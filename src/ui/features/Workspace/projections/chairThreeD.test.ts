import { describe, expect, it } from "vitest";
import { moleculesToEditorModel, readMoleculesFromText } from "../../../../utils/importers";
import { identityOfDrawn } from "../chem/identityOf";
import { blocksOf } from "../chem/make3d";
import type { Atom, Bond, Model } from "../store/types";
import { editorModelOf } from "../utils/io";
import { chairDrawing, seenPlaces } from "./chair";

/** The chair (`form`, `flip`) with a methyl on each (atom, face) given. */
function methylated(groups: [number, 1 | -1][], form: 0 | 1, flip: boolean): Model {
  const d = chairDrawing({ at: { x: 0, y: 0 }, form, flip, firstId: 1, firstBondId: 100 });
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach(([k, face], i) => {
    const free = d.solid.free.find((f) => f.at === k && f.face === face)!;
    const place = seenPlaces(d, k).find((p) => p.free === free)!;
    atoms.push({ id: 50 + i, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + i, a: d.ring[k], b: 50 + i, order: 1 });
  });
  return { atoms, bonds };
}

describe("3D made from a chair (the maintainer's ruling: the configuration only, never the drawn conformation)", () => {
  it("is asked about as a flat MOL with wedges - no depth in it - that reads, as any flat drawing does, as the configuration the chair drew", () => {
    for (const form of [0, 1] as const) {
      for (const flip of [false, true]) {
        for (let k1 = 0; k1 < 6; k1++) {
          for (let k2 = k1 + 1; k2 < 6; k2++) {
            for (const f1 of [1, -1] as const) {
              for (const f2 of [1, -1] as const) {
                const chair = methylated([[k1, f1], [k2, f2]], form, flip);
                const [block] = blocksOf(chair, [1]);
                // (2D, every z 0: the places the chair is drawn at are not a start for any conformation)
                expect(block.molblock).toMatch(/^\s*\n\s*Meno\s+2D/);
                expect(block.molblock.split("\n").filter((l) => l.startsWith("M  V30 ") && /^M {2}V30 \d+ [A-Z][a-z]? /.test(l)).every((l) => l.trim().split(/\s+/)[6] === "0")).toBe(true);
                const flat = editorModelOf(moleculesToEditorModel(readMoleculesFromText(block.molblock, "mol")).model);
                expect(identityOfDrawn(flat).text, `form ${form} flip ${flip} ${k1}${f1} ${k2}${f2}`).toBe(identityOfDrawn(chair).text);
              }
            }
          }
        }
      }
    }
  });

  it("is the same request for the same compound drawn by either chair: trans diequatorial and its flip, diaxial", () => {
    const eq = methylated([[0, 1], [1, -1]], 0, false);
    const ax = methylated([[0, 1], [1, -1]], 0, true);
    const text = (m: Model) => identityOfDrawn(editorModelOf(moleculesToEditorModel(readMoleculesFromText(blocksOf(m, [1])[0].molblock, "mol")).model)).text;
    expect(text(ax)).toBe(text(eq));
  });
});
