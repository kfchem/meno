import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from ".";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { projectionsIn } from "../projections/rings";
import { chairDrawing, seenPlaces } from "../projections/chair";
import { newmanDrawing, newmansIn } from "../projections/newman";
import { centredAt } from "../utils/copyPaste";

// Angles in degrees, counter-clockwise from the page's right, y up (as the model stores it).
function drawing() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

const deg = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  const d = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return Math.round(d * 1000) / 1000;
};
const same = (p: number, q: number) => Math.abs((((p - q) % 360) + 540) % 360 - 180) < 1e-6;

/** One double-click's bond on atom `id`: the new atom, its angle and length from `id`; none where nothing was added. */
function doubleClick(st: ReturnType<typeof drawing>["st"], id: number) {
  const n = st().model.atoms.length;
  const got = st().bondOut(id, { x: 0, y: 0 });
  if (got == null) {
    expect(st().model.atoms).toHaveLength(n);
    return null;
  }
  const here = st().model.atoms.find((a) => a.id === id)!;
  const end = st().model.atoms.find((a) => a.id === got)!;
  // (a new atom every time: never joined to one already there)
  expect(st().model.atoms).toHaveLength(n + 1);
  return { angle: deg(here, end), length: Math.hypot(end.x - here.x, end.y - here.y) };
}

describe("a double-click on an atom of a chair", () => {
  // (the tool's chair, form 1 (from above and from the right, Brecher 2006 ST-3.1): atom k of the solid, its equatorial and its axial bond)
  const EQUATORIAL = [-165, 165, -60, 15, -15, 120];
  const AXIAL = [90, -90, 90, -90, 90, -90];

  it("adds the equatorial bond first, then the axial one, a bond long, then nothing", () => {
    const { doc, st } = drawing();
    st().putChair({ x: 0, y: 0 });
    const found = projectionsIn(st().model)[0];
    expect(found.kind).toBe("chair");
    // (the page's atom at each atom k of the tool's chair as drawn: the solid's numbering, whichever way round the ring is found)
    const atoms = st().model.atoms;
    const middle = { x: atoms.reduce((s, a) => s + a.x, 0) / 6, y: atoms.reduce((s, a) => s + a.y, 0) / 6 };
    const tool = chairDrawing({ at: middle, firstId: 1, firstBondId: 1 });
    const byK = tool.atoms.map((p) => atoms.reduce((best, a) => (Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? a : best)).id);
    expect(new Set(byK).size).toBe(6);
    for (let k = 0; k < 6; k++) {
      const first = doubleClick(st, byK[k])!;
      expect(same(first.angle, EQUATORIAL[k])).toBe(true);
      expect(first.length).toBeCloseTo(L, 6);
    }
    for (let k = 0; k < 6; k++) {
      const second = doubleClick(st, byK[k])!;
      expect(same(second.angle, AXIAL[k])).toBe(true);
      expect(second.length).toBeCloseTo(L, 6);
    }
    // (both positions held: nothing added, by no other rule)
    for (let k = 0; k < 6; k++) expect(doubleClick(st, byK[k])).toBeNull();
    // (the chair is still the tool's, its twelve groups each one undo step)
    expect(projectionsIn(st().model)).toHaveLength(1);
    for (let i = 0; i < 12; i++) doc.undo();
    expect(st().model.atoms).toHaveLength(6);
  });
});

describe("a double-click on an atom of a Haworth ring", () => {
  for (const size of [6, 5] as const) {
    it(`adds the bond straight up first, then straight down, at the drawn length - a ring of ${size} - and joins no other atom`, () => {
      const { st } = drawing();
      st().putHaworth({ x: 0, y: 0 });
      // (the icon again on the ring just put down: the other size in its place)
      if (size === 5) st().putHaworth({ x: 0, y: 0 });
      const found = projectionsIn(st().model)[0];
      expect(found.kind).toBe("haworth");
      expect(found.ring).toHaveLength(size);
      const ids = [...found.ring];
      // (the drawn length of an up and a down group at each atom: the tool's own)
      const drawnLength = (id: number, kind: "up" | "down") => {
        const k = found.index.get(id)!;
        const p = seenPlaces(found.drawing, k).find((q) => q.free.kind === kind)!;
        return Math.hypot(p.place.x - found.drawing.atoms[k].x, p.place.y - found.drawing.atoms[k].y);
      };
      for (const id of ids) {
        const up = doubleClick(st, id)!;
        expect(same(up.angle, 90)).toBe(true);
        expect(up.length).toBeCloseTo(drawnLength(id, "up"), 6);
      }
      for (const id of ids) {
        const down = doubleClick(st, id)!;
        expect(same(down.angle, -90)).toBe(true);
        expect(down.length).toBeCloseTo(drawnLength(id, "down"), 6);
      }
      for (const id of ids) expect(doubleClick(st, id)).toBeNull();
      // (every new group is its own atom: no ring was closed onto a group already there)
      expect(st().model.atoms).toHaveLength(3 * size);
      expect(st().model.bonds).toHaveLength(3 * size);
    });
  }
});

describe("a double-click on an atom of a Newman pair", () => {
  it("adds front bonds at 90, 210, 330 and back bonds at 270, 30, 150, a bond long from the centre, then nothing", () => {
    const { st } = drawing();
    st().pasteModel(centredAt(newmanDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 }), { x: 0, y: 0 }));
    const pair = newmansIn(st().model)[0];
    const centre = pair.at;
    const spoke = (id: number) => {
      const n = st().model.atoms.length;
      expect(st().bondOut(id, centre)).not.toBeNull();
      const end = st().model.atoms[n];
      expect(Math.hypot(end.x - centre.x, end.y - centre.y)).toBeCloseTo(L, 6);
      return deg(centre, end);
    };
    const front = [spoke(pair.front), spoke(pair.front), spoke(pair.front)];
    expect(front.map((a, i) => same(a, [90, 210, 330][i]))).toEqual([true, true, true]);
    const back = [spoke(pair.back), spoke(pair.back), spoke(pair.back)];
    expect(back.map((a, i) => same(a, [270, 30, 150][i]))).toEqual([true, true, true]);
    expect(st().bondOut(pair.front, centre)).toBeNull();
    expect(st().bondOut(pair.back, centre)).toBeNull();
    // (still a Newman pair, staggered: the first front and the first back group anti)
    const now = newmansIn(st().model)[0];
    expect(now.groups.front).toHaveLength(3);
    expect(now.groups.back).toHaveLength(3);
  });

  it("goes on the set an atom's groups already stand on", () => {
    const { st } = drawing();
    st().pasteModel(centredAt(newmanDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 }), { x: 0, y: 0 }));
    const pair = newmansIn(st().model)[0];
    // (a front group on the other set, at 150: the front's set is 30, 150, 270, and the next counter-clockwise from 90 is 270)
    const g = st().addAtomBonded(pair.front, pair.at.x + L * Math.cos((150 * Math.PI) / 180), pair.at.y + L * Math.sin((150 * Math.PI) / 180));
    expect(g).not.toBeNull();
    const n = st().model.atoms.length;
    st().bondOut(pair.front, pair.at);
    expect(same(deg(pair.at, st().model.atoms[n]), 270)).toBe(true);
  });
});
