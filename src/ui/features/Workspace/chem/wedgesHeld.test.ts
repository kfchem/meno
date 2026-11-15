import { describe, expect, it } from "vitest";
import { readStereo, sameConfiguration } from "../../../../lib/layout/drawn";
import type { Tetrahedral } from "../../../../lib/layout/stereo";
import { appendModel, createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { degrees, drawingOf, narrowEnd, wedgesHeld } from "./drawing";
import { sameStereo } from "./engineLayout";

/**
 * A wedge's narrow end is kept by atom (`Bond.narrow`): a bond added or
 * taken away beside it does not move it, as the end with more bonds,
 * counted again after each edit, did - turning one configuration into
 * another with nothing said.
 */

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

/** The centre at `id` as the drawing reads it, its neighbours by id (an H not drawn, -1). */
function centreAt(m: Model, id: number): Tetrahedral | undefined {
  const d = drawingOf(m);
  const t = readStereo(d.atoms, d.bonds).tetra.get(d.index.get(id)!);
  return t && { neighbours: t.neighbours.map((n) => (n === -1 ? -1 : m.atoms[n].id)), volume: t.volume };
}

describe("a wedge's narrow end, kept by atom", () => {
  it("stays at its centre when bonds are added at its wide end, and the configuration reads back the same", () => {
    const { st } = editor();
    // a centre (c) with three bonds, the wedge to a methyl (m) drawn from the methyl
    const c = st().addAtom(0, 0, "C");
    const m = st().addAtom(0, 1.5, "C");
    const o = st().addAtom(1.3, -0.75, "O");
    const e = st().addAtom(-1.3, -0.75, "C");
    const w = st().addBond(m, c);
    st().addBond(c, o);
    st().addBond(c, e);
    st().setBondStereo(w, "up");
    const before = st().model;
    expect(before.bonds.find((b) => b.id === w)!.narrow).toBe(c);
    const was = centreAt(before, c)!;
    expect(was).toBeDefined();

    // two bonds out of the methyl: as many bonds at the wide end as at the
    // centre, where the wedge read narrow at its first atom, the methyl
    const p = st().addAtom(-1.3, 2.25, "C");
    const q = st().addAtom(1.3, 2.25, "C");
    st().addBond(m, p);
    st().addBond(m, q);
    const after = st().model;
    const bond = after.bonds.find((b) => b.id === w)!;
    expect(degrees(after.bonds).get(m)).toBe(degrees(after.bonds).get(c));
    expect(bond.narrow).toBe(c);
    expect(narrowEnd(bond, degrees(after.bonds))).toBe(c);
    expect(sameConfiguration(was, centreAt(after, c)!)).toBe(true);
    // (and the methyl, now a carbon with three bonds, is said to be no centre)
    expect(centreAt(after, m)).toBeUndefined();
    expect(sameStereo(before, after)).toBe(true);
  });

  it("stays at its centre when a bond at the centre is taken away, and the configuration reads back the same", () => {
    const { st } = editor();
    // a centre (c) with four bonds, one to an H drawn beside the wedge; the wedge's wide end with three
    const c = st().addAtom(0, 0, "C");
    const wide = st().addAtom(0, 1.5, "C");
    const h = st().addAtom(1.3, 0.75, "H");
    const w = st().addBond(wide, c);
    st().addBond(c, st().addAtom(1.3, -0.75, "O"));
    st().addBond(c, st().addAtom(-1.3, -0.75, "C"));
    const gone = st().addBond(c, h);
    st().addBond(wide, st().addAtom(-1.3, 2.25, "C"));
    st().addBond(wide, st().addAtom(1.3, 2.25, "C"));
    st().setBondStereo(w, "down");
    const before = st().model;
    expect(before.bonds.find((b) => b.id === w)!.narrow).toBe(c);
    expect(centreAt(before, c)).toBeDefined();

    // the H's bond taken away: the centre down to three bonds, as many as the wide end
    st().deleteBond(gone);
    const after = st().model;
    const bond = after.bonds.find((b) => b.id === w)!;
    expect(degrees(after.bonds).get(c)).toBe(degrees(after.bonds).get(wide));
    expect(bond.narrow).toBe(c);
    expect(narrowEnd(bond, degrees(after.bonds))).toBe(c);
    // (the H drawn and the H not drawn alike: the same configuration)
    expect(sameConfiguration(centreAt(before, c)!, centreAt(after, c)!, (x) => (x === h ? -1 : x))).toBe(true);
    expect(centreAt(after, wide)).toBeUndefined();
  });

  it("gives a wedge made with no narrow end the one its drawing has, and keeps one it had when the edit took that atom from it", () => {
    const model: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 0, y: 1.5, r: 0.9, el: "C" },
        { id: 3, x: 1.3, y: -0.75, r: 0.9, el: "O" },
      ],
      bonds: [
        { id: 4, a: 2, b: 1, order: 1, stereo: "up" },
        { id: 5, a: 1, b: 3, order: 1, stereo: "none" },
      ],
    };
    // (none given: the end with more bonds)
    expect(wedgesHeld(model).bonds[0].narrow).toBe(1);
    // (as the edit before had it: there, narrow at 2)
    const before: Model = { ...model, bonds: [{ ...model.bonds[0], narrow: 2 }, model.bonds[1]] };
    expect(wedgesHeld(model, before).bonds[0].narrow).toBe(2);
    // (every wedge held: the same model back)
    const held = wedgesHeld(model);
    expect(wedgesHeld(held)).toBe(held);
  });

  it("goes with its atom when the structure is copied in with new ids", () => {
    const doc = createWorkspaceDocument().getState();
    const model: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 0, y: 1.5, r: 0.9, el: "C" },
        { id: 3, x: 1.3, y: -0.75, r: 0.9, el: "O" },
      ],
      // (narrow at the end with fewer bonds)
      bonds: [
        { id: 4, a: 1, b: 2, order: 1, stereo: "up", narrow: 2 },
        { id: 5, a: 1, b: 3, order: 1, stereo: "none" },
      ],
    };
    const once = appendModel(doc, model);
    const twice = appendModel(once, model);
    const copied = twice.model.bonds.filter((b) => b.stereo === "up");
    expect(copied).toHaveLength(2);
    for (const b of copied) {
      expect(b.narrow).toBe(b.b);
      expect(twice.model.atoms.find((a) => a.id === b.narrow)!.y).toBe(1.5);
    }
  });
});
