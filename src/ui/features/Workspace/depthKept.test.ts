/**
 * A drawing in perspective keeps its depth through the .meno and the clipboard (docs/EDITOR-2D.md, *Drawn in perspective*): each atom's depth,
 * that its configuration is the drawing's own, each ring bond's near-edge look - so it opens, and pastes, with the same places, the same
 * configuration and the same bonds broken where one passes behind another.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "./store";
import { createWorkspaceDocument } from "./document";
import { readWorkspace, workspaceText } from "./utils/workspace";
import { readRecord, recordText } from "./utils/copyPaste";
import { drawingOf } from "./chem/drawing";
import type { Atom, Bond, Drawn, Model } from "./store/types";
import { readStereo, sameConfiguration } from "../../../lib/layout/drawn";
import { buildAllPrimitives, type Atom as LayoutAtom, type Bond as LayoutBond } from "../../../lib/chem/layout2d";
import { acsWorldOptions } from "../../../lib/chem/acs";
import { chair } from "../../../lib/chem/perception/projection/solids";
import { drawn } from "../../../lib/chem/perception/projection/views";

/**
 * Cyclohexane's chair as the textbook draws it (scaled to the editor's bond), a methyl straight up or down from each ring atom, two of them
 * on centres of the drawing's own, and the near edge drawn as one: ring atoms with depth, methyls with none.
 */
function chairModel(): { atoms: Atom[]; bonds: Bond[] } {
  const L = 1.5;
  const ring = drawn(chair())!.atoms.map((p) => ({ x: L * p.x, y: L * p.y, z: L * p.z }));
  const atoms: Atom[] = ring.map((p, k) => ({ id: k + 1, el: "C", r: 0.9, x: p.x, y: p.y, z: p.z, ...(k < 2 ? { stereoCentre: true } : {}) }));
  const bonds: Bond[] = ring.map((_, k) => ({ id: 100 + k, a: k + 1, b: ((k + 1) % 6) + 1, order: 1 }));
  ring.forEach((p, k) => {
    const up = Math.sign(p.y - (ring[(k + 1) % 6].y + ring[(k + 5) % 6].y) / 2);
    atoms.push({ id: 7 + k, el: "C", r: 0.9, x: p.x, y: p.y + L * up });
    bonds.push({ id: 200 + k, a: k + 1, b: 7 + k, order: 1 });
  });
  // (the nearer edge: the bond between the two nearest ring atoms, drawn as a near edge, narrow at the farther end)
  const near = [...ring.keys()].sort((p, q) => ring[q].z - ring[p].z).slice(0, 2);
  const edge = bonds.findIndex((b) => near.includes(b.a - 1) && near.includes(b.b - 1) && b.id < 200);
  if (edge >= 0) bonds[edge] = { ...bonds[edge], display: "wedge" };
  return { atoms, bonds };
}

/** The lines the drawing is made of, at one size, as the canvas draws it: a bond broken where it passes behind another is in pieces. */
function linesOf(m: Pick<Model, "atoms" | "bonds">) {
  const index = new Map(m.atoms.map((a, i) => [a.id, i]));
  const atoms: LayoutAtom[] = m.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el, ...(a.z != null ? { z: a.z } : {}) }));
  const bonds: LayoutBond[] = m.bonds.map((b) => ({
    a1: index.get(b.a)!,
    a2: index.get(b.b)!,
    order: b.order,
    ...(b.stereo ? { stereo: b.stereo } : {}),
    ...(b.display ? { display: b.display } : {}),
    ...(b.narrow != null ? { narrow: index.get(b.narrow)! } : {}),
  }));
  const built = buildAllPrimitives(atoms, bonds, acsWorldOptions([], [], { units: "world" }), 40);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    lines: built.lines.map((l) => [l.x1, l.y1, l.x2, l.y2].map(round)),
    polys: built.polys.map((p) => p.points.flatMap((q) => [q.x, q.y].map(round))),
  };
}

/** The atoms and bonds by their order, without the ids a paste gives anew: what the drawing is. */
function asDrawn(m: Pick<Model, "atoms" | "bonds">) {
  const index = new Map(m.atoms.map((a, i) => [a.id, i]));
  return {
    atoms: m.atoms.map((a) => ({ x: a.x, y: a.y, z: a.z, centre: !!a.stereoCentre })),
    bonds: m.bonds.map((b) => ({ a: index.get(b.a), b: index.get(b.b), display: b.display })),
  };
}

function expectSameDrawing(was: Pick<Model, "atoms" | "bonds">, now: Pick<Model, "atoms" | "bonds">, moved = { x: 0, y: 0 }) {
  const shifted = { atoms: was.atoms.map((a) => ({ ...a, x: a.x + moved.x, y: a.y + moved.y })), bonds: was.bonds };
  const [p, q] = [asDrawn(shifted), asDrawn(now)];
  expect(q.bonds).toEqual(p.bonds);
  q.atoms.forEach((a, i) => {
    expect(a.x).toBeCloseTo(p.atoms[i].x, 9);
    expect(a.y).toBeCloseTo(p.atoms[i].y, 9);
    expect(a.z).toBe(p.atoms[i].z);
    expect(a.centre).toBe(p.atoms[i].centre);
  });
  // (the same configuration read, and the same bonds broken: two, as a chair's axial bonds cross)
  const [r, s] = [readStereo(drawingOf(shifted as Model).atoms, drawingOf(shifted as Model).bonds).tetra, readStereo(drawingOf(now as Model).atoms, drawingOf(now as Model).bonds).tetra];
  expect([...s.keys()]).toEqual([...r.keys()]);
  for (const [c, t] of r) expect(sameConfiguration(t, s.get(c)!)).toBe(true);
  const [l0, l1] = [linesOf(shifted), linesOf(now)];
  expect(l1).toEqual(l0);
  // (two bonds broken, each in two pieces drawn as the shapes they fill)
  const flat = linesOf({ atoms: shifted.atoms.map(({ z: _z, ...a }) => a), bonds: shifted.bonds });
  expect(l0.lines.length).toBe(flat.lines.length - 2);
  expect(l0.polys.length).toBe(flat.polys.length + 4);
}

describe("a drawing in perspective, kept", () => {
  it("opens from its .meno with its depth, its centres and its near edge as drawn - the same bonds broken", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const chair = chairModel();
    store.getState().pasteModel({ atoms: chair.atoms, bonds: chair.bonds } as Drawn);
    const saved = store.getState().model;
    expect(saved.atoms.filter((a) => a.z != null)).toHaveLength(6);
    expect(saved.bonds).toHaveLength(12);
    const text = workspaceText(store.getState());
    const otherDoc = createWorkspaceDocument();
    const other = createEditorStore(otherDoc);
    connectStoreToDocument(other, otherDoc);
    other.getState().openWorkspace(readWorkspace(text)!, true);
    expectSameDrawing(saved, other.getState().model);
  });

  it("pastes from the clipboard's record with its depth, its centres and its near edge as drawn - the same bonds broken", () => {
    const chair = chairModel();
    const pasted = readRecord(recordText({ atoms: chair.atoms, bonds: chair.bonds } as Drawn))!;
    expect(pasted).not.toBeNull();
    expectSameDrawing(chair, pasted);
  });
});
