import { describe, expect, it } from "vitest";
import type { Atom, Bond, Model } from "../store/types";
import { seenPlaces, snapTo } from "./chair";
import { chairExtension } from "./extend";
import { haworthDrawing, haworthOf, haworthsIn } from "./haworth";
import { chairDrawing } from "./chair";
import { isProjection } from "./rings";

type Group = { at: number; face: 1 | -1; el: string; then?: string };

/** A Haworth ring with the groups given: each at its atom's free position of that face - a `then` atom beyond it, straight up the page. */
function ring(size: 5 | 6, groups: Group[]): Model {
  const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 100 });
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach((g, i) => {
    const free = d.solid.free.find((f) => f.at === g.at && f.face === g.face)!;
    const place = seenPlaces(d, g.at).find((p) => p.free === free)!;
    const id = 50 + 2 * i;
    atoms.push({ id, el: g.el, r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + 2 * i, a: d.ring[g.at], b: id, order: 1 });
    if (g.then) {
      atoms.push({ id: id + 1, el: g.then, r: 0.9, x: place.place.x + 0.5, y: place.place.y + (g.face === 1 ? 0.5 : -0.5) });
      bonds.push({ id: 201 + 2 * i, a: id, b: id + 1, order: 1 });
    }
  });
  return { atoms, bonds };
}

const all = (m: Model) => new Set(m.atoms.map((a) => a.id));
describe("the Haworth tool's drawing", () => {
  it("is a pyranose of six - the ring O at the back right, C-1 at the right, the front edge lower and bold - or a furanose of five, O at the back", () => {
    const six = haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 });
    expect(six.atoms.map((a) => a.el)).toEqual(["O", "C", "C", "C", "C", "C"]);
    const [o, c1, c2, c3, c4, c5] = six.atoms;
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBeGreaterThan(c2.y);
    expect(c1.x).toBeGreaterThan(o.x);
    expect(c4.x).toBeLessThan(0);
    // (the nearer edge, C-2 to C-3, lower than the farther, O to C-5)
    expect(c2.y).toBeLessThan(o.y);
    expect(c3.y).toBeLessThan(c5.y);
    expect(six.bonds.filter((b) => b.display === "bold").map((b) => [b.a, b.b])).toEqual([[3, 4]]);
    const five = haworthDrawing({ at: { x: 0, y: 0 }, size: 5, firstId: 1, firstBondId: 1 });
    expect(five.atoms).toHaveLength(5);
    expect(five.atoms[0].el).toBe("O");
    expect(Math.abs(five.atoms[0].x)).toBeLessThan(1e-9);
    // (every bond as long as a bond at its longest, the longest the style's)
    expect(Math.max(...six.bonds.map((b) => Math.hypot(six.atoms[b.a - 1].x - six.atoms[b.b - 1].x, six.atoms[b.a - 1].y - six.atoms[b.b - 1].y)))).toBeCloseTo(six.scale * 1, 6);
  });

  it("offers up and down at every ring atom, vertical on the page, up above and down below", () => {
    for (const size of [5, 6] as const) {
      const d = haworthDrawing({ at: { x: 0, y: 0 }, size, firstId: 1, firstBondId: 1 });
      for (let k = 0; k < size; k++) {
        const [up, down] = [seenPlaces(d, k).find((p) => p.free.kind === "up")!, seenPlaces(d, k).find((p) => p.free.kind === "down")!];
        expect(Math.abs(up.place.x - d.atoms[k].x)).toBeLessThan(1e-9);
        expect(up.place.y).toBeGreaterThan(d.atoms[k].y);
        expect(down.place.y).toBeLessThan(d.atoms[k].y);
        expect(snapTo(d, k, { x: d.atoms[k].x + 0.3, y: d.atoms[k].y + 5 })?.free.kind).toBe("up");
      }
    }
  });

  it("is found as the tool's, a pyranose and a furanose, whatever the ring O is made, and no chair", () => {
    for (const size of [5, 6] as const) {
      const m = ring(size, []);
      expect(haworthOf(m, m.atoms.slice(0, size).map((a) => a.id))?.size).toBe(size);
      expect(haworthsIn(m, all(m))).toHaveLength(1);
      const changed = { atoms: m.atoms.map((a) => (a.id === 1 ? { ...a, el: "N" } : a)), bonds: m.bonds };
      expect(haworthsIn(changed, all(changed))).toHaveLength(1);
    }
    const chair = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
    expect(haworthsIn({ atoms: chair.atoms, bonds: chair.bonds }, new Set(chair.atoms.map((a) => a.id)))).toEqual([]);
    expect(isProjection(ring(6, []), all(ring(6, [])))).toBe(true);
  });

  it("leads a bond out of a ring atom to up or down, and holds the one a group stands at", () => {
    const m = ring(6, []);
    const at = m.atoms[2];
    expect(chairExtension(m, 3, { x: at.x, y: at.y + 9 })?.name).toBe("up");
    expect(chairExtension(m, 3, { x: at.x, y: at.y - 9 })?.name).toBe("down");
    const held = ring(6, [{ at: 2, face: 1, el: "O" }]);
    expect(chairExtension(held, 3, { x: at.x, y: at.y + 9 })?.name).toBe("down");
  });
});

// (Known answers that need the depth read of F8: today a ring all of whose atoms carry a depth is taken as a cage's solid by `cageFits`
// (lib/layout/drawn), and a planar Haworth ring read so gives its centres no configuration - measured: the same ring with one atom's depth
// left out reads each centre. They are written down here, to be switched on when F8 is on main, with D-glucopyranose built from ring O, C1 to C5: the CH2OH up at C5, each OH - beta up at C1, alpha down - C2 down, C3 up, C4 down; its SMILES beta
// C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O, alpha C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O.)
describe("what the Haworth tool draws, read as Meno reads a drawing (known answers, after F8)", () => {
  it.todo("makes beta-D-glucopyranose: one identity with its SMILES, the alpha anomer another");
  it.todo("is laid out flat by Draw flat with the same identity, and is the same compound as the 4C1 chair built with the chair tool");
  it.todo("is asked about for 3D as a flat MOL whose wedges read as the configuration the ring drew");
});


describe("a Haworth ring put down from Quick Add", () => {
  it("is where Quick Add was opened, its depth and the drawing's own configuration kept, R and S asked for", async () => {
    const { createWorkspaceDocument } = await import("../document");
    const { connectStoreToDocument, createEditorStore } = await import("../store");
    const { centredAt } = await import("../utils/copyPaste");
    const at = { x: 12, y: -7 };
    for (const size of [5, 6] as const) {
      const doc = createWorkspaceDocument();
      const store = createEditorStore(doc);
      connectStoreToDocument(store, doc);
      store.getState().pasteModel(centredAt(haworthDrawing({ at, size, firstId: 1, firstBondId: 1 }), at));
      const m = doc.getState().model;
      expect(m.atoms).toHaveLength(size);
      expect(m.atoms.map((a) => a.el)).toEqual(["O", ...Array(size - 1).fill("C")]);
      expect(m.atoms.every((a) => typeof a.z === "number" && a.stereoCentre === true && a.stereoShown === true)).toBe(true);
      // (centred as anything put down is: the middle of its box where Quick Add was opened)
      const xs = m.atoms.map((a) => a.x);
      const ys = m.atoms.map((a) => a.y);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(at.x, 6);
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(at.y, 6);
      expect(m.bonds.filter((b) => b.display === "bold")).toHaveLength(1);
    }
  });
});
