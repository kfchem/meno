import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Bond, Model } from "../store/types";
import { cleanUp } from "./cleanUp";
import { cipMarksOf } from "./cipMarks";
import { layoutJob, sameStereo } from "./engineLayout";
import { measured } from "../../../../testing/timeouts";

// An H with a mass number - a 2H, a 3H - on a stereocentre, through Clean-up (docs/EDITOR-2D.md, Clean-up on the engine): kept, as drawn,
// and its centre a centre though its groups differ only by isotope. Each drawn here by hand.

const atom = (id: number, x: number, y: number, el = "C", isotope?: number) => ({ id, x, y, r: 0.9, el, ...(isotope ? { isotope } : {}) });
const bond = (id: number, a: number, b: number, stereo?: "up" | "down"): Bond => ({ id, a, b, order: 1, ...(stereo ? { stereo } : {}) });

/** `m` cleaned up: what it became, and why not where it was refused. */
async function cleaned(m: Model): Promise<{ model: Model; refused: string }> {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model: m, nextId: 2000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  let refused = "";
  await cleanUp(store).catch((e: unknown) => (refused = String(e)));
  return { model: store.getState().model, refused };
}

/** Each centre's R or S, by atom id. */
const rs = (m: Model) => Object.fromEntries(cipMarksOf({ ...m, atoms: m.atoms.map((a) => ({ ...a, stereoShown: true as const })) }).centres);
/** The atoms with a mass number, by id. */
const labelled = (m: Model) => Object.fromEntries(m.atoms.filter((a) => a.isotope).map((a) => [a.id, `${a.isotope}${a.el}`]));

// (butan-2-ol-2-d: C-2 with an ethyl, a methyl, the OH and a 2H on a wedge - four groups anyway)
const butanolD: Model = {
  atoms: [atom(1, 0, 0), atom(2, -0.866, 0.5), atom(5, -1.732, 0), atom(3, 0.866, 0.5, "O"), atom(6, 0, -1), atom(4, 0.5, -0.8, "H", 2)],
  bonds: [bond(10, 1, 2), bond(13, 2, 5), bond(11, 1, 3), bond(14, 1, 6), bond(12, 1, 4, "up")],
};
// (ethanol-1-d: C-1 with the methyl, the OH, a 2H on a wedge and an H not drawn - a centre by its isotopes alone)
const ethanolD: Model = {
  atoms: [atom(1, 0, 0), atom(2, -0.866, 0.5), atom(3, 0.866, 0.5, "O"), atom(4, 0, -1, "H", 2)],
  bonds: [bond(10, 1, 2), bond(11, 1, 3), bond(12, 1, 4, "up")],
};
// (ethanol-1-d-1-t: a 2H on a wedge and a 3H plain)
const ethanolDT: Model = {
  atoms: [atom(1, 0, 0), atom(2, -0.866, 0.5), atom(3, 0.866, 0.5, "O"), atom(4, -0.5, -0.8, "H", 2), atom(5, 0.5, -0.8, "H", 3)],
  bonds: [bond(10, 1, 2), bond(11, 1, 3), bond(12, 1, 4, "up"), bond(13, 1, 5)],
};
/** Cyclohexane-1,2-d2: a 2H out of each of two neighbouring ring atoms, on wedges `s1` and `s2` - both up, cis; one down, trans. */
function cyclohexaneD2(s1: "up" | "down", s2: "up" | "down"): Model {
  const ring = [0, 1, 2, 3, 4, 5].map((k) => atom(k + 1, Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)));
  return {
    atoms: [...ring, atom(7, 2, 0, "H", 2), atom(8, 1, 1.732, "H", 2)],
    bonds: [...[0, 1, 2, 3, 4, 5].map((k) => bond(20 + k, k + 1, ((k + 1) % 6) + 1)), bond(30, 1, 7, s1), bond(31, 2, 8, s2)],
  };
}
// ((S)-butan-2-ol with its H drawn on a wedge: an H that is only an H)
const butanolH: Model = { ...butanolD, atoms: butanolD.atoms.map((a) => (a.id === 4 ? atom(4, 0.5, -0.8, "H") : a)) };

describe("an H with a mass number on a stereocentre, through Clean-up", () => {
  it(
    "is kept, its centre's R or S with it - not folded away into its centre's H's as an H is",
    async () => {
      const { model, refused } = await cleaned(butanolD);
      expect(refused).toBe("");
      expect(labelled(model)).toEqual({ 4: "2H" });
      expect(model.bonds.some((b) => (b.a === 1 && b.b === 4) || (b.a === 4 && b.b === 1))).toBe(true);
      expect(rs(model)).toEqual(rs(butanolD));
      expect(rs(butanolD)[1]).toMatch(/^[RS]$/);
    },
    measured(60_000),
  );

  it(
    "keeps a centre whose groups differ only by isotope a centre: laid out, not refused, its R or S kept",
    async () => {
      for (const m of [ethanolD, ethanolDT, cyclohexaneD2("up", "up"), cyclohexaneD2("up", "down")]) {
        expect(Object.keys(rs(m)).length, JSON.stringify(labelled(m))).toBeGreaterThan(0);
        const { model, refused } = await cleaned(m);
        expect(refused, JSON.stringify(labelled(m))).toBe("");
        expect(labelled(model)).toEqual(labelled(m));
        expect(rs(model)).toEqual(rs(m));
      }
    },
    measured(60_000),
  );

  it("is told from the H not drawn where it is all a centre has to differ by: the configuration turned is seen as turned", () => {
    // (Clean-up's check of what it laid out: ethanol-1-d with its 2H's wedge turned is the other hand, not the same drawing)
    const turned: Model = { ...ethanolD, bonds: ethanolD.bonds.map((b) => (b.stereo ? { ...b, stereo: "down" as const } : b)) };
    expect(rs(turned)).not.toEqual(rs(ethanolD));
    expect(sameStereo(ethanolD, turned)).toBe(false);
    expect(sameStereo(ethanolD, ethanolD)).toBe(true);
    // (and the same drawing, its bonds held in another order - as a layout hands them back - is the same)
    const reordered: Model = { ...ethanolD, bonds: [...ethanolD.bonds].reverse() };
    expect(sameStereo(ethanolD, reordered)).toBe(true);
    expect(sameStereo(ethanolD, { ...turned, bonds: [...turned.bonds].reverse() })).toBe(false);
    // (two labelled H's on one centre, a 2H and a 3H: told apart however the bonds are listed - the same drawing the same, the
    // wedge on the other the other hand)
    const otherHand: Model = { ...ethanolDT, bonds: ethanolDT.bonds.map((b) => (b.id === 12 ? { ...b, stereo: undefined } : b.id === 13 ? { ...b, stereo: "up" as const } : b)) };
    expect(rs(otherHand)).not.toEqual(rs(ethanolDT));
    const orders = [[10, 11, 12, 13], [10, 11, 13, 12], [13, 12, 11, 10], [12, 10, 13, 11], [11, 13, 10, 12]];
    const listed = (m: Model, order: number[]) => ({ ...m, bonds: order.map((id) => m.bonds.find((b) => b.id === id)!) });
    for (const order of orders) {
      expect(sameStereo(ethanolDT, listed(ethanolDT, order)), `same, ${order}`).toBe(true);
      expect(sameStereo(ethanolDT, listed(otherHand, order)), `other hand, ${order}`).toBe(false);
    }
  });

  it("keeps an H with a charge, or anything more than an H, as an atom of its own: not folded into its centre", () => {
    const charged: Model = { ...butanolH, atoms: butanolH.atoms.map((a) => (a.id === 4 ? { ...a, charge: 1 } : a)) };
    const job = layoutJob(charged);
    expect(job.ids).toContain(4);
    expect([...job.folded.values()].flat()).not.toContain(4);
    // (the H that is only an H, folded)
    expect(layoutJob(butanolH).ids).not.toContain(4);
  });

  it(
    "where the H is only an H, folds it into its centre as before: the centre's configuration kept, shown another way",
    async () => {
      const { model, refused } = await cleaned(butanolH);
      expect(refused).toBe("");
      expect(model.atoms.some((a) => a.id === 4)).toBe(false);
      expect(rs(model)).toEqual(rs(butanolH));
    },
    measured(60_000),
  );
});
