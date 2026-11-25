import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import * as ops from "../document";
import { createWorkspaceDocument } from "../document";
import { centredAt, partToCopy, readRecord, recordText } from "../utils/copyPaste";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { drawnOf, exportedDrawn, structureFileText } from "../fileActions";
import { drawnOf as drawnRead } from "../utils/io";
import { readStructures } from "../../../../lib/io/structures";
import { rigidFit, tiedCaptionOf } from "../utils/tiedCaptions";
import type { Molecule3D } from "./types";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

// (an invented bent three-atom chain, and its text three bonds under its middle atom)
function chainWithText() {
  const e = editor();
  e.state().pasteModel(readRecord(JSON.stringify({
    format: "meno-structure",
    version: 1,
    atoms: [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 3, y: 1, el: "O" },
    ],
    bonds: [
      { id: 4, a: 1, b: 2, order: 1 },
      { id: 5, a: 2, b: 3, order: 1 },
    ],
  }))!);
  const atoms = e.state().model.atoms.map((a) => a.id);
  const x0 = e.state().model.atoms[0].x;
  const y0 = e.state().model.atoms[0].y;
  const id = e.state().addCaption("compound Q7", x0 + 1.5, y0 - 4.5, undefined, undefined, undefined, undefined, { of: { atom: atoms[0] } });
  return { ...e, atoms, id, x0, y0 };
}

const words = (state: () => ReturnType<ReturnType<typeof editor>["state"]>, id: number) => state().captions.find((c) => c.id === id);

describe("text that belongs to a structure", () => {
  it("is added belonging to it, one step, and found as its text", () => {
    const { doc, state, atoms, id } = chainWithText();
    expect(words(state, id)?.of).toEqual({ atom: atoms[0] });
    expect(doc.history().undoLabel).toBe("add text");
    expect(tiedCaptionOf(state(), { atom: atoms[2] })?.id).toBe(id);
  });

  it("moves with its structure, in the same step, and the undo takes both back", () => {
    const { doc, state, atoms, id, x0, y0 } = chainWithText();
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: a.x + 10, y: a.y + 5 })), "drag");
    expect(words(state, id)).toMatchObject({ x: x0 + 11.5, y: y0 + 0.5, of: { atom: atoms[0] } });
    doc.undo();
    expect(words(state, id)).toMatchObject({ x: x0 + 1.5, y: y0 - 4.5 });
    doc.redo();
    expect(words(state, id)).toMatchObject({ x: x0 + 11.5, y: y0 + 0.5 });
  });

  it("turns with its structure about it, its words upright (no turn of their own), and is turned over with it", () => {
    const { state, id, x0, y0 } = chainWithText();
    // (a quarter turn about the middle atom: the text three bonds under it goes three bonds to its right... less the 1.5 across)
    const cx = x0 + 1.5;
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: cx - (a.y - y0), y: y0 + (a.x - cx) })), "turn");
    const turned = words(state, id)!;
    expect(turned.x).toBeCloseTo(cx + 4.5, 9);
    expect(turned.y).toBeCloseTo(y0, 9);
    expect(Object.keys(turned)).not.toContain("angle");
    // (turned back, then over left to right about its middle: under it still)
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: cx + (a.y - y0), y: y0 - (a.x - cx) })), "turn back");
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: 2 * cx - a.x, y: a.y })), "flip");
    expect(words(state, id)!.x).toBeCloseTo(cx, 9);
    expect(words(state, id)!.y).toBeCloseTo(y0 - 4.5, 9);
  });

  it("dragged by itself, keeps its new place beside its structure and still belongs to it", () => {
    const { state, atoms, id, x0, y0 } = chainWithText();
    state().updateCaption(id, { x: x0 + 6, y: y0 + 2 }, "drag");
    expect(words(state, id)).toMatchObject({ x: x0 + 6, y: y0 + 2, of: { atom: atoms[0] } });
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: a.x - 1, y: a.y })), "drag");
    expect(words(state, id)).toMatchObject({ x: x0 + 5, y: y0 + 2 });
  });

  it("is deleted with its structure, and comes back belonging to it with the undo", () => {
    const { doc, state, atoms, id } = chainWithText();
    state().selectStructure(atoms[0]);
    state().deleteSelection();
    expect(state().captions).toEqual([]);
    doc.undo();
    expect(words(state, id)?.of).toEqual({ atom: atoms[0] });
  });

  it("belongs to the nearest atom left of its structure when the one it named is deleted", () => {
    const { state, atoms, id } = chainWithText();
    state().deleteAtom(atoms[0]);
    expect(words(state, id)?.of).toEqual({ atom: atoms[1] });
  });

  it("is copied with its structure however far from it, free text that far only where selected; pasted, it belongs to the copy", () => {
    const { state, atoms, id } = chainWithText();
    const far = state().addCaption("free words", 100, 100);
    const part = partToCopy(drawnOf(state()), { atoms: new Set(), bonds: new Set() }, atoms[1])!;
    expect(part.captions?.map((c) => c.text)).toEqual(["compound Q7"]);
    // (and a selection of the whole structure takes it too)
    const sel = partToCopy(drawnOf(state()), { atoms: new Set(atoms), bonds: new Set() }, null)!;
    expect(sel.captions?.map((c) => c.id)).toEqual([id]);
    expect(sel.captions?.some((c) => c.id === far)).toBe(false);
    // (pasted twice - a duplicate: each its own structure's)
    for (const at of [{ x: 40, y: 0 }, { x: 80, y: 0 }]) state().pasteModel(centredAt(readRecord(recordText(part))!, at));
    const tied = state().captions.filter((c) => c.of);
    expect(tied).toHaveLength(3);
    const owners = tied.map((c) => (c.of as { atom: number }).atom);
    expect(new Set(owners).size).toBe(3);
    for (const a of owners) expect(state().model.atoms.some((x) => x.id === a)).toBe(true);
  });

  it("is cut with its structure: gone from the page, back belonging to the structure pasted", () => {
    const { state, atoms } = chainWithText();
    const part = partToCopy(drawnOf(state()), { atoms: new Set(), bonds: new Set() }, atoms[1])!;
    state().selectStructure(atoms[0]);
    state().deleteSelection();
    expect(state().captions).toEqual([]);
    state().pasteModel(centredAt(readRecord(recordText(part))!, { x: 0, y: 0 }));
    const c = state().captions[0];
    expect(c.text).toBe("compound Q7");
    expect(state().model.atoms.some((a) => "atom" in c.of! && a.id === c.of.atom)).toBe(true);
  });

  it("is freed in one step: then left where it is as its structure moves, and never tied again by being near", () => {
    const { doc, state, atoms, id, x0, y0 } = chainWithText();
    state().freeCaption(id);
    expect(doc.history().undoLabel).toBe("free text");
    expect(words(state, id)?.of).toBeUndefined();
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: a.x + 3, y: a.y })), "drag");
    expect(words(state, id)).toMatchObject({ x: x0 + 1.5, y: y0 - 4.5 });
    doc.undo();
    doc.undo();
    expect(words(state, id)?.of).toEqual({ atom: atoms[0] });
  });

  it("is saved with its tie and read back so", () => {
    const { state, atoms, id } = chainWithText();
    const back = readWorkspace(workspaceText(state()))!;
    expect(back.drawn.captions?.find((c) => c.id === id)?.of).toEqual({ atom: atoms[0] });
  });

  it("goes out as its SD record's Caption item and comes back belonging to its structure", () => {
    const { state } = chainWithText();
    const sdf = structureFileText(exportedDrawn(state()), "q.sdf");
    expect(sdf).toContain("> <Caption>\ncompound Q7\n\n");
    const read = readStructures("sdf", "q.sdf", sdf);
    const drawn = drawnRead(read);
    expect(drawn.captions).toHaveLength(1);
    const c = drawn.captions![0];
    expect(c.text).toBe("compound Q7");
    expect(drawn.atoms.some((a) => "atom" in c.of! && a.id === c.of.atom)).toBe(true);
    // (under its structure, as text is put under one)
    expect(c.y).toBeLessThan(Math.min(...drawn.atoms.map((a) => a.y)));
  });

  it("of a molecule in 3D: moves with it, goes out as its record's item, is deleted with it", () => {
    const { doc, state } = editor();
    const water: Omit<Molecule3D, "id"> = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0.96, y: 0, z: 0 },
        { el: "H", x: -0.24, y: 0.93, z: 0 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 20, y: 20 },
    };
    doc.edit("add", (d) => ops.addMolecule3d(d, water));
    const m = state().molecules3d[0].id;
    const id = state().addCaption("solvent W", 20, 14, undefined, undefined, undefined, undefined, { of: { molecule: m } });
    state().moveMolecule3d(m, { x: 30, y: 25 });
    expect(words(state, id)).toMatchObject({ x: 30, y: 19, of: { molecule: m } });
    expect(structureFileText(exportedDrawn(state()), "w.sdf")).toContain("> <Caption>\nsolvent W\n\n");
    state().removeMolecule3d(m);
    expect(state().captions).toEqual([]);
  });

  it("of a set's member: carried as the set moves it", () => {
    const { state, id, x0, y0 } = chainWithText();
    const set = state().addSet({ x0: x0 - 2, y0: y0 - 2, x1: x0 + 5, y1: y0 + 2 });
    const before = words(state, id)!;
    state().moveSet(set, 7, 3);
    const moved = state().model.atoms[0].x - x0;
    expect(moved).not.toBe(0);
    expect(words(state, id)!.x - before.x).toBeCloseTo(moved, 9);
  });
});

describe("the fit that carries text with its structure", () => {
  it("is a shift for one point, a turn for a turned body, a mirror for a mirrored one", () => {
    expect(rigidFit([{ x: 1, y: 1 }], [{ x: 3, y: 0 }])({ x: 0, y: 0 })).toEqual({ x: 2, y: -1 });
    const body = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
    const turned = rigidFit(body, body.map((p) => ({ x: -p.y, y: p.x })))({ x: 1, y: -3 });
    expect(turned.x).toBeCloseTo(3, 9);
    expect(turned.y).toBeCloseTo(1, 9);
    const mirrored = rigidFit(body, body.map((p) => ({ x: -p.x, y: p.y })))({ x: 1, y: -3 });
    expect(mirrored.x).toBeCloseTo(-1, 9);
    expect(mirrored.y).toBeCloseTo(-3, 9);
  });
});
