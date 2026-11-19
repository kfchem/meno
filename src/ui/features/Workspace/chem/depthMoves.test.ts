/**
 * Meno's own moves keep a drawing's depth (docs/EDITOR-2D.md, *Drawn in perspective*): turned in the page, turned over, scaled - the compound
 * the same - and mirrored in the page with its depth as it was - its mirror image. Read as the chemist's drawing is: through identity.
 */
import { describe, expect, it } from "vitest";
import { chair, haworth, newman } from "../../../../lib/layout/testdata/projections";
import type { DrawnAtom, DrawnBond } from "../../../../lib/layout/drawn";
import type { Model } from "../store/types";
import { turned, turnedOver } from "../utils/selection";
import { emptyWorkspaceDocument, placeAtoms } from "../document";
import { identityOfDrawn } from "./identityOf";
import { blocksOf } from "./make3d";
import { editorModelOf, processFileContent } from "../utils/io";

/** A drawing in perspective as the document holds it: its ring atoms with their depth, each a stereocentre by the drawing's own say. */
function modelOf(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): Model {
  return {
    atoms: d.atoms.map((a, i) => ({ id: i + 1, el: a.el ?? "C", x: a.x, y: a.y, r: 0.9, ...(a.z != null ? { z: a.z } : {}), ...(a.centre ? { stereoCentre: true as const } : {}) })) as Model["atoms"],
    bonds: d.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
  };
}

const withPlaces = (m: Model, places: { id: number; x: number; y: number; z?: number }[]): Model => ({
  ...m,
  atoms: m.atoms.map((a) => {
    const p = places.find((q) => q.id === a.id);
    return p ? { ...a, x: p.x, y: p.y, ...(p.z != null ? { z: p.z } : {}) } : a;
  }),
});

const projections: Record<string, Model> = {
  "a chair of 1,2-dimethylcyclohexane, diequatorial": modelOf(chair({ 0: "equatorial", 1: "equatorial" })),
  "a chair of menthol": modelOf(chair({ 0: { place: "equatorial", el: "O", hs: 1 }, 1: { place: "equatorial", hs: 1, branches: 2 }, 4: "equatorial" })),
  "beta-D-glucopyranose in Haworth's ring": modelOf(haworth([true, false, true, false, true])),
  "a staggered Newman projection of 2,3-dibromobutane": modelOf(newman({ methyl: 90, bromine: 210 }, { methyl: 270, bromine: 150 })),
};

const identityOf = (m: Model) => identityOfDrawn(m).text;
const all = (m: Model) => new Set(m.atoms.map((a) => a.id));

describe("a drawing in perspective, through Meno's own moves", () => {
  it("has a configuration to keep: each is a chiral compound", () => {
    for (const [name, m] of Object.entries(projections)) expect(identityOf(m), name).toMatch(/@/);
  });

  it("is the same compound turned in the page, by any angle, depth as it is", () => {
    for (const [name, m] of Object.entries(projections)) {
      for (const angle of [Math.PI / 6, Math.PI / 2, 2.4, -1]) {
        const moved = withPlaces(m, turned(m.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y })), { x: 0.3, y: -0.2 }, angle));
        expect(identityOf(moved), `${name}, turned ${angle}`).toBe(identityOf(m));
      }
    }
  });

  it("is the same compound turned over, either way: its depth turned with the page mirrored - not its mirror image", () => {
    for (const [name, m] of Object.entries(projections)) {
      for (const axis of ["vertical", "horizontal"] as const) {
        const over = turnedOver(m, all(m), axis);
        expect(over.atoms.every((a, i) => (a.z == null) === (m.atoms[i].z == null)), name).toBe(true);
        expect(identityOf(withPlaces(m, over.atoms)), `${name}, turned over ${axis}`).toBe(identityOf(m));
      }
    }
  });

  it("is the same compound scaled, depth with it", () => {
    for (const [name, m] of Object.entries(projections)) {
      const scaled = withPlaces(m, m.atoms.map((a) => ({ id: a.id, x: a.x * 1.7, y: a.y * 1.7, ...(a.z != null ? { z: a.z * 1.7 } : {}) })));
      expect(identityOf(scaled), name).toBe(identityOf(m));
    }
  });

  it("is the mirror image where the page is mirrored and the depth left as it was", () => {
    for (const [name, m] of Object.entries(projections)) {
      const mirrored = withPlaces(m, m.atoms.map((a) => ({ id: a.id, x: -a.x, y: a.y, ...(a.z != null ? { z: a.z } : {}) })));
      expect(identityOf(mirrored), name).not.toBe(identityOf(m));
      // (and the mirror image turned over is still the mirror image: turned over keeps the compound)
      const back = withPlaces(mirrored, turnedOver(mirrored, all(mirrored), "vertical").atoms);
      expect(identityOf(back), name).toBe(identityOf(mirrored));
    }
  });
});

describe("a drawing in perspective, made in 3D", () => {
  it("goes to the plugin as a MOL block that says what the drawing says: read back, the same compound - a chair, a Haworth ring, a Newman projection", async () => {
    for (const [name, m] of Object.entries(projections)) {
      const [block] = blocksOf(m, m.atoms.map((a) => a.id));
      expect(block, name).toBeDefined();
      const read = editorModelOf((await processFileContent("drawing.mol", block.molblock)).model);
      expect(identityOfDrawn(read).text, name).toBe(identityOf(m));
    }
  });
});

describe("a drawing in perspective, edited", () => {
  it("keeps the depth of an atom dragged, and its being a stereocentre", () => {
    const m = projections["a chair of menthol"];
    const doc = placeAtoms({ ...emptyWorkspaceDocument(), model: m }, [{ id: 2, x: m.atoms[1].x + 0.2, y: m.atoms[1].y - 0.1 }]);
    const moved = doc.model.atoms.find((a) => a.id === 2)!;
    expect(moved.z).toBe(m.atoms[1].z);
    expect(moved.stereoCentre).toBe(true);
    expect(moved.x).toBeCloseTo(m.atoms[1].x + 0.2);
  });
});
