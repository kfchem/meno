import { describe, expect, it } from "vitest";
import * as ops from "../document";
import { emptyWorkspaceDocument } from "../document";
import type { Atom, Bond } from "../store/types";
import { chairDrawing, seenPlaces } from "./chair";
import { haworthDrawing } from "./haworth";
import { groupBend } from "./extend";

// A group made linear on a projection's ring atom - a nitrile, an alkyne - is drawn straight on (Brecher 2008, GR-4.1.1): the order is set
// after the stroke, which bent it (`groupBend`), so setting it straightens what lies beyond.

type Pt = { x: number; y: number };
const angleAt = (at: Pt, a: Pt, b: Pt) => {
  const u = Math.atan2(a.y - at.y, a.x - at.x);
  const v = Math.atan2(b.y - at.y, b.x - at.x);
  return Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v)));
};

/** A projection with a group at atom k's `kind` place - its first atom 900 - and the next atom, 901, where the stroke's bend puts it; `more` atoms on, in a chain, after that. */
function drawnWith(kind: "up" | "down" | "axial" | "equatorial", k: number, more = 0) {
  const d = kind === "up" || kind === "down" ? haworthDrawing({ at: { x: 0, y: 0 }, size: 6, firstId: 1, firstBondId: 1 }) : chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 1 });
  const p = seenPlaces(d, k).find((f) => f.free.kind === kind)!;
  const atoms: Atom[] = [...d.atoms, { ...d.atoms[k], id: 900, el: "C", x: p.place.x, y: p.place.y } as Atom];
  const plain = d.bonds.find((b) => !b.display && b.stereo == null) ?? d.bonds[0];
  const bond = (id: number, a: number, b: number): Bond => ({ ...plain, id, a, b, order: 1, display: undefined, narrow: undefined, stereo: undefined }) as Bond;
  const bonds: Bond[] = [...d.bonds, bond(900, d.ring[k], 900)];
  const root = d.atoms[k];
  const at = atoms[atoms.length - 1];
  const bend = groupBend({ atoms, bonds }, 900, { x: at.x + 3 * (at.x - root.x) + 0.3, y: at.y + 3 * (at.y - root.y) }, 1)!;
  atoms.push({ ...at, id: 901, el: more ? "C" : "N", x: bend.end.x, y: bend.end.y } as Atom);
  bonds.push(bond(901, 900, 901));
  for (let i = 0; i < more; i++) {
    const last = atoms[atoms.length - 1];
    atoms.push({ ...last, id: 902 + i, el: "C", x: last.x + 0.87, y: last.y + (i % 2 ? 0.5 : -0.5) } as Atom);
    bonds.push(bond(902 + i, 901 + i, 902 + i));
  }
  return { doc: { ...emptyWorkspaceDocument(), model: { atoms, bonds } }, root };
}
const where = (doc: ReturnType<typeof drawnWith>["doc"], id: number) => doc.model.atoms.find((a) => a.id === id)!;

describe("a projection's group made linear", () => {
  it("a nitrile on a chair's equatorial place and on a Haworth ring's up place: its C-N made triple, the N straight on from the ring atom, a bond's length off", () => {
    for (const [kind, k] of [["equatorial", 3], ["up", 5], ["axial", 2], ["down", 0]] as const) {
      const { doc, root } = drawnWith(kind, k);
      const before = where(doc, 901);
      const c = where(doc, 900);
      expect(angleAt(c, root, before)).toBeCloseTo((2 * Math.PI) / 3, 9);
      const made = ops.updateBond(doc, 901, { order: 3 });
      const n = where(made, 901);
      expect(angleAt(c, root, n), `${kind}`).toBeCloseTo(Math.PI, 9);
      expect(Math.hypot(n.x - c.x, n.y - c.y)).toBeCloseTo(Math.hypot(before.x - c.x, before.y - c.y), 9);
      // (nothing else moved)
      for (const a of doc.model.atoms) if (a.id !== 901) expect(where(made, a.id)).toEqual(a);
    }
  });

  it("an alkyne with a chain on: the chain turned with it, as drawn; and two double bonds at the atom too", () => {
    const { doc, root } = drawnWith("up", 5, 2);
    const made = ops.updateBond(doc, 901, { order: 3 });
    const c = where(made, 900);
    expect(angleAt(c, root, where(made, 901))).toBeCloseTo(Math.PI, 9);
    // (the chain's own lengths and angles kept)
    const d0 = (q: typeof doc, a: number, b: number) => Math.hypot(where(q, a).x - where(q, b).x, where(q, a).y - where(q, b).y);
    expect(d0(made, 901, 902)).toBeCloseTo(d0(doc, 901, 902), 9);
    expect(d0(made, 900, 903)).toBeCloseTo(d0(doc, 900, 903), 9);
    expect(angleAt(where(made, 901), where(made, 900), where(made, 902))).toBeCloseTo(angleAt(where(doc, 901), where(doc, 900), where(doc, 902)), 9);
    // (an exocyclic allene's middle atom: a double bond to the ring atom is no group's here, so one at the group's atom and one on)
    const twice = ops.updateBond(ops.updateBond(drawnWith("up", 5, 1).doc, 900, { order: 2 }), 901, { order: 2 });
    expect(angleAt(where(twice, 900), root, where(twice, 901))).toBeCloseTo(Math.PI, 9);
  });

  it("leaves alone: a double bond alone (not linear), a group moved off its place, and a bond made single again", () => {
    const { doc, root } = drawnWith("up", 5);
    const c = where(doc, 900);
    expect(angleAt(c, root, where(ops.updateBond(doc, 901, { order: 2 }), 901))).toBeCloseTo((2 * Math.PI) / 3, 9);
    const off = { ...doc, model: { ...doc.model, atoms: doc.model.atoms.map((a) => (a.id === 900 ? { ...a, x: a.x + 0.4 } : a)) } };
    const made = ops.updateBond(off, 901, { order: 3 });
    expect(where(made, 901)).toEqual(where(off, 901));
    const triple = ops.updateBond(doc, 901, { order: 3 });
    expect(where(ops.updateBond(triple, 901, { order: 1 }), 901)).toEqual(where(triple, 901));
  });
});
