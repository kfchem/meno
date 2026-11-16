/**
 * A ring in perspective drawn with no depth, recognised as one, through Meno's own moves (chem/depthHeld; docs/EDITOR-2D.md, *Drawn in
 * perspective*): turned on the page by any angle, and turned over either way, it is the same compound - as a drawing with its depth stored
 * is - never its mirror image, and never unread with no word. Undone, the drawing is as it was, no depth stored.
 */
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Model } from "../store/types";
import { chair, haworth } from "../../../../lib/layout/testdata/projections";
import type { DrawnAtom, DrawnBond } from "../../../../lib/layout/drawn";
import { chair as solidChair, fused } from "../../../../lib/chem/perception/projection/solids";
import { drawn as drawnByRule } from "../../../../lib/chem/perception/projection/views";
import { identityOfDrawn } from "./identityOf";
import { turned, turnedOver } from "../utils/selection";
import type { Drawn } from "../store/types";

/** A drawing with its depth taken away, as the document holds one drawn bond by bond. */
function bare(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, scale = 1): Model {
  return {
    atoms: d.atoms.map((a, i) => ({ id: i + 1, el: a.el ?? "C", x: scale * a.x, y: scale * a.y, r: 0.9 })) as Model["atoms"],
    bonds: d.bonds.map((b, k) => ({ id: 100 + k, a: b.a + 1, b: b.b + 1, order: b.order as 1 | 2 | 3 })),
  };
}

/** A decalin as projection/views draws it, with a methyl on one free place. */
function decalin(how: "trans" | { cis: 1 | -1 }, at: number): Model {
  const s = fused(solidChair(), 0, "chair", how);
  const d = drawnByRule(s, 0)!;
  const atoms: DrawnAtom[] = d.atoms.map((p) => ({ x: 1.5 * p.x, y: 1.5 * p.y, hs: 0 }));
  const bonds: DrawnBond[] = s.bonds.map(([a, b]) => ({ a, b, order: 1 }));
  const f = d.free[at];
  atoms.push({ x: atoms[f.free.at].x + 1.5 * f.x, y: atoms[f.free.at].y + 1.5 * f.y, hs: 3 });
  bonds.push({ a: f.free.at, b: atoms.length - 1, order: 1 });
  return bare({ atoms, bonds });
}

const drawings: Record<string, Model> = {
  "a chair of menthol": bare(chair({ 0: { place: "equatorial", el: "O", hs: 1 }, 1: { place: "equatorial", hs: 1, branches: 2 }, 4: "equatorial" }), 1.5),
  "a chair of trans-1,2-dimethylcyclohexane": bare(chair({ 0: "equatorial", 1: "equatorial" }), 1.5),
  "trans-decalin with a methyl": decalin("trans", 2),
  "cis-decalin with a methyl": decalin({ cis: 1 }, 3),
  "beta-D-glucopyranose in Haworth's ring": bare(haworth([true, false, true, false, true]), 1.5),
};

function editor(m: Model) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().pasteModel(m as Drawn);
  const s = store.getState();
  s.setSel({ atoms: new Set(s.model.atoms.map((a) => a.id)), bonds: new Set() });
  return { doc, state: () => store.getState() };
}
const identityOf = (m: Model) => identityOfDrawn(m).text;

describe("a ring in perspective with no depth, through Meno's own moves", () => {
  it("has a configuration to keep: each reads as a chiral compound with no depth stored", () => {
    for (const [name, m] of Object.entries(drawings)) expect(identityOf(m), name).toMatch(/@/);
  });

  it("is the same compound turned over, either way - not its mirror image - and its depth is stored with it", () => {
    for (const [name, m] of Object.entries(drawings)) {
      for (const axis of ["vertical", "horizontal"] as const) {
        const { state } = editor(m);
        const before = identityOf(state().model);
        state().turnSelectionOver(axis);
        expect(identityOf(state().model), `${name}, turned over ${axis}`).toBe(before);
        expect(state().model.atoms.some((a) => a.z != null), name).toBe(true);
      }
    }
  });

  it("is the same compound turned on the page by any angle the turn's handle gives, never unread", () => {
    for (const [name, m] of Object.entries(drawings)) {
      for (const deg of [15, 30, 45, 90, 135, 180, 270]) {
        const { state } = editor(m);
        const before = identityOf(state().model);
        const gesture = `turn-test-${deg}`;
        const from = state().model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y }));
        // (as the selection's handle does: the depth held as the turn begins, then the atoms carried round, in one step)
        state().holdRecognisedDepth(state().sel.atoms, gesture);
        state().moveAtoms(turned(from, { x: 0.2, y: -0.1 }, (deg * Math.PI) / 180), gesture);
        expect(identityOf(state().model), `${name}, turned ${deg}`).toBe(before);
      }
    }
  });

  it("is undone in one step: as it was drawn, no depth stored", () => {
    const { doc, state } = editor(drawings["a chair of menthol"]);
    const before = state().model;
    state().turnSelectionOver("vertical");
    doc.undo();
    expect(state().model.atoms.map((a) => [a.x, a.y, a.z])).toEqual(before.atoms.map((a) => [a.x, a.y, a.z]));
  });

  it("would read the mirror image turned half round or over with nothing held: why the depth is stored", () => {
    const m = drawings["a chair of menthol"];
    const all = new Set(m.atoms.map((a) => a.id));
    const over = turnedOver(m, all, "vertical");
    const moved = { ...m, atoms: m.atoms.map((a) => ({ ...a, ...over.atoms.find((q) => q.id === a.id)! })) };
    expect(identityOf(moved)).not.toBe(identityOf(m));
  });
});
