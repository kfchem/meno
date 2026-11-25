import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from ".";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { bondLengthFrom } from "../utils/magnified";
import { newBondFrom } from "../utils/geometry";
import { bondOutEnd } from "../projections/extend";
import { haworthDrawing } from "../projections/haworth";
import { chairDrawing } from "../projections/chair";
import { newmanDrawing } from "../projections/newman";
import type { ChairDrawing } from "../projections/chair";

function page(d: ChairDrawing) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().pasteModel({ atoms: d.atoms, bonds: d.bonds } as never);
  return { doc, st: () => store.getState() };
}

/** The atom `bondOut` made: the one that was not there before. */
function newest(st: () => ReturnType<ReturnType<typeof page>["st"]>, id: number | null) {
  return st().model.atoms.find((a) => a.id === id)!;
}

describe("a double-click on an atom of a projection draws its bond at a free position of it", () => {
  // A Haworth ring's group stands straight up or straight down the page from its ring atom (the same x), a place each, at one distance.
  // An atom of the front (bottom) edge has the ring centre above it, so the plain rule's end is below it: the first bond goes to the place
  // below; the second, the only place left, above; the third has no place and goes where the plain rule puts it, at neither.
  const centreOf = (d: ChairDrawing) => ({ x: d.atoms.reduce((s, a) => s + a.x, 0) / d.atoms.length, y: d.atoms.reduce((s, a) => s + a.y, 0) / d.atoms.length });

  for (const edge of ["front", "back"] as const) {
    it(`takes the two places of an atom of the ${edge} edge in turn, then the plain rule's end`, () => {
      const d = haworthDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
      const c = centreOf(d);
      const sorted = [...d.atoms].sort((p, q) => p.y - q.y);
      // (the bottom-most atom is of the front edge, the top-most of the back)
      const atom = edge === "front" ? sorted[0] : sorted[sorted.length - 1];
      const away = Math.sign(atom.y - c.y);
      const { st } = page(d);
      const first = newest(st, st().bondOut(atom.id, { x: atom.x, y: atom.y + 5 * away }));
      expect(first.x).toBeCloseTo(atom.x, 6);
      expect(Math.sign(first.y - atom.y)).toBe(away);
      const second = newest(st, st().bondOut(atom.id, { x: atom.x, y: atom.y + 5 * away }));
      expect(second.x).toBeCloseTo(atom.x, 6);
      expect(Math.sign(second.y - atom.y)).toBe(-away);
      const third = newest(st, st().bondOut(atom.id, { x: atom.x, y: atom.y + 5 * away }));
      expect(Math.abs(third.x - atom.x)).toBeGreaterThan(1e-3);
    });
  }

  it("takes, on a chair's atom, the axial place straight up or down the page, then the equatorial", () => {
    const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
    // (an axial bond is vertical: the atom's group is straight above or below; the equatorial one is not)
    const atom = d.atoms[2];
    const { st } = page(d);
    const toward = { x: atom.x, y: atom.y + (atom.y >= 0 ? 5 : -5) };
    const first = newest(st, st().bondOut(atom.id, toward));
    const second = newest(st, st().bondOut(atom.id, toward));
    const vertical = (p: { x: number }) => Math.abs(p.x - atom.x) < 1e-6;
    expect([vertical(first), vertical(second)].filter(Boolean)).toHaveLength(1);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(1e-3);
  });

  it("takes, on a Newman pair's front atom, a spoke: a bond long from the centre, at 90, 210 or 330 degrees", () => {
    const d = newmanDrawing({ at: { x: 3, y: 4 }, firstId: 1, firstBondId: 100 });
    const { st } = page(d);
    const end = newest(st, st().bondOut(1, { x: 3, y: 9 }));
    expect(Math.hypot(end.x - 3, end.y - 4)).toBeCloseTo(NOMINAL_BOND_LENGTH, 6);
    const deg = (((Math.atan2(end.y - 4, end.x - 3) * 180) / Math.PI) % 360 + 360) % 360;
    expect([90, 210, 330].some((s) => Math.abs(deg - s) < 1e-6)).toBe(true);
  });

  it("is the plain rule's end on a hexagon with no projection", () => {
    const atoms = [0, 1, 2, 3, 4, 5].map((k) => ({ id: k + 1, el: "C", r: 0.9, x: NOMINAL_BOND_LENGTH * Math.cos((k * Math.PI) / 3), y: NOMINAL_BOND_LENGTH * Math.sin((k * Math.PI) / 3) }));
    const bonds = atoms.map((a, k) => ({ id: 100 + k, a: a.id, b: atoms[(k + 1) % 6].id, order: 1 as const }));
    const toward = { x: 20, y: 0 };
    expect(bondOutEnd({ atoms, bonds }, 1, toward, NOMINAL_BOND_LENGTH)).toEqual(newBondFrom(atoms, bonds, 1, toward, NOMINAL_BOND_LENGTH));
  });

  it("shows, in the preview, the end the store then draws", () => {
    const d = haworthDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
    const atom = [...d.atoms].sort((p, q) => p.y - q.y)[0];
    const { st } = page(d);
    const toward = { x: atom.x, y: atom.y - 5 };
    for (let i = 0; i < 3; i++) {
      const shown = bondOutEnd(st().model, atom.id, toward, bondLengthFrom(st().model.atoms, atom.id))!;
      const made = newest(st, st().bondOut(atom.id, toward));
      expect(made.x).toBeCloseTo(shown.x, 6);
      expect(made.y).toBeCloseTo(shown.y, 6);
    }
  });
});
