import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import * as ops from "../document";
import { createWorkspaceDocument } from "../document";
import { centredAt, partToCopy, readRecord, recordText } from "../utils/copyPaste";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { drawnOf, exportedDrawn, structureFileText } from "../fileActions";
import { drawnOf as drawnRead } from "../utils/io";
import { readStructures } from "../../../../lib/io/structures";
import { drawnStructureBox, keptAgainstBox, tiedCaptionOf } from "../utils/tiedCaptions";
import { markGlideStep, type MarkGlides } from "../utils/markGlide";
import { selectionScheme } from "../utils/selectionScheme";
import { wordsSet } from "../../../../lib/chem/captions";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { editorLayoutOptions } from "../layoutOptions";
import { DURATION, easeOut } from "../../../theme/motion";

const GLIDE = DURATION.move * 1000;
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

  it("of three lines with a blank line among them goes out and comes back as three lines", () => {
    const { state, id } = chainWithText();
    state().updateCaption(id, { text: "line one\nline two\n\nline three" });
    const sdf = structureFileText(exportedDrawn(state()), "q.sdf");
    expect(drawnRead(readStructures("sdf", "q.sdf", sdf)).captions?.[0].text).toBe("line one\nline two\nline three");
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

// (an invented ring of six carbons with one carbon on it - no labels - and its text under it, as "Add text" puts it)
function ringWithText() {
  const e = editor();
  const ring = Array.from({ length: 6 }, (_, k) => ({ id: k + 1, x: 1.5 * Math.cos(Math.PI / 2 + (k * Math.PI) / 3), y: 1.5 * Math.sin(Math.PI / 2 + (k * Math.PI) / 3), el: "C" }));
  e.state().pasteModel(readRecord(JSON.stringify({
    format: "meno-structure",
    version: 1,
    atoms: [...ring, { id: 7, x: ring[5].x + 1.3, y: ring[5].y + 0.75, el: "C" }],
    bonds: [...ring.map((r, k) => ({ id: 10 + k, a: r.id, b: ring[(k + 1) % 6].id, order: 1 })), { id: 20, a: 6, b: 7, order: 1 }],
  }))!);
  const atoms = e.state().model.atoms.map((a) => a.id);
  const b = box(e.state, atoms[0])!;
  const id = e.state().addCaption("compound Q7", (b.x0 + b.x1) / 2, b.y0 - 1, undefined, undefined, undefined, undefined, { of: { atom: atoms[0] } });
  return { ...e, atoms, id };
}

type State = () => ReturnType<ReturnType<typeof editor>["state"]>;
const box = (state: State, atom: number) => drawnStructureBox(state().model, new Set(state().model.atoms.filter((a) => a.id !== atom).map((a) => a.id).concat(atom)));
const half = (state: State, id: number) => {
  const w = wordsSet(words(state, id)!, editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE)));
  return { w: w.halfW, h: w.halfH };
};
// (a quarter turn about `c`, a turn over left to right about the line x = `m`)
const quarter = (state: State, c: { x: number; y: number }, gesture = "turn") => state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: c.x - (a.y - c.y), y: c.y + (a.x - c.x) })), gesture);
const overAbout = (state: State, m: number) => state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: 2 * m - a.x, y: a.y })), "flip");

describe("text that belongs to a structure keeps its place against the structure's box", () => {
  it("turned a quarter: under the new box, centred on it, at the same gap", () => {
    const { state, atoms, id } = ringWithText();
    const b0 = box(state, atoms[0])!;
    const h = half(state, id);
    const gap = b0.y0 - (words(state, id)!.y + h.h);
    quarter(state, { x: 0.4, y: -0.3 });
    const b1 = box(state, atoms[0])!;
    const w = words(state, id)!;
    expect(w.x).toBeCloseTo((b1.x0 + b1.x1) / 2, 9);
    expect(b1.y0 - (w.y + h.h)).toBeCloseTo(gap, 9);
    // (the box itself turned: wider than tall, then taller than wide)
    expect(b0.x1 - b0.x0).toBeCloseTo(b1.y1 - b1.y0, 6);
  });

  it("turned over left to right about its box's middle: unmoved; a straight chain likewise", () => {
    const { state, atoms, id } = ringWithText();
    const was = { ...words(state, id)! };
    const b = box(state, atoms[0])!;
    overAbout(state, (b.x0 + b.x1) / 2);
    expect(words(state, id)!.x).toBeCloseTo(was.x, 9);
    expect(words(state, id)!.y).toBeCloseTo(was.y, 9);
    const line = editor();
    line.state().pasteModel(readRecord(JSON.stringify({
      format: "meno-structure",
      version: 1,
      atoms: [{ id: 1, x: 0, y: 0, el: "C" }, { id: 2, x: 1.5, y: 0, el: "C" }, { id: 3, x: 3, y: 0, el: "C" }],
      bonds: [{ id: 4, a: 1, b: 2, order: 1 }, { id: 5, a: 2, b: 3, order: 1 }],
    }))!);
    const first = line.state().model.atoms[0];
    const lb = box(line.state, first.id)!;
    const t = line.state().addCaption("compound Q7", (lb.x0 + lb.x1) / 2, lb.y0 - 1, undefined, undefined, undefined, undefined, { of: { atom: first.id } });
    overAbout(line.state, (lb.x0 + lb.x1) / 2);
    expect(words(line.state, t)!.x).toBeCloseTo((lb.x0 + lb.x1) / 2, 9);
    expect(words(line.state, t)!.y).toBeCloseTo(lb.y0 - 1, 9);
  });

  it("an atom drawn below its lowest: lower by what the box grew, at the same gap", () => {
    const { state, atoms, id } = ringWithText();
    const b0 = box(state, atoms[0])!;
    const y0 = words(state, id)!.y;
    const lowest = state().model.atoms.reduce((l, a) => (a.y < l.y ? a : l));
    expect(state().bondOut(lowest.id, { x: lowest.x, y: lowest.y - 3 })).not.toBeNull();
    const b1 = box(state, atoms[0])!;
    expect(b1.y0).toBeLessThan(b0.y0 - 1);
    expect(words(state, id)!.y).toBeCloseTo(y0 + (b1.y0 - b0.y0), 9);
  });

  it("put at the right side: still there after a quarter turn - the same gap, the same place along the side", () => {
    const { state, atoms, id } = ringWithText();
    const b0 = box(state, atoms[0])!;
    const h = half(state, id);
    state().updateCaption(id, { x: b0.x1 + 0.8 + h.w, y: (b0.y0 + b0.y1) / 2 + 0.4 }, "drag");
    quarter(state, { x: 0.4, y: -0.3 });
    const b1 = box(state, atoms[0])!;
    const w = words(state, id)!;
    expect(w.x - h.w - b1.x1).toBeCloseTo(0.8, 9);
    expect(w.y - (b1.y0 + b1.y1) / 2).toBeCloseTo(0.4, 9);
  });

  it("put inside the box: kept against its middle - through a move, and as the box grows", () => {
    const { state, atoms, id } = ringWithText();
    const b0 = box(state, atoms[0])!;
    state().updateCaption(id, { x: (b0.x0 + b0.x1) / 2 + 0.2, y: (b0.y0 + b0.y1) / 2 - 0.1 }, "drag");
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: a.x + 3, y: a.y - 2 })), "drag");
    const b1 = box(state, atoms[0])!;
    expect(words(state, id)!.x - (b1.x0 + b1.x1) / 2).toBeCloseTo(0.2, 9);
    expect(words(state, id)!.y - (b1.y0 + b1.y1) / 2).toBeCloseTo(-0.1, 9);
    expect(keptAgainstBox({ x0: 0, y0: 0, x1: 4, y1: 2 }, { x0: 0, y0: -2, x1: 6, y1: 2 }, { x: 2.5, y: 1 }, { w: 3, h: 0.5 })).toEqual({ x: 3.5, y: 0 });
  });

  it("moved by (dx, dy): by exactly (dx, dy)", () => {
    const { state, id } = ringWithText();
    const was = { ...words(state, id)! };
    state().moveAtoms(state().model.atoms.map((a) => ({ id: a.id, x: a.x + 0.7, y: a.y - 2.25 })), "drag");
    expect(words(state, id)!.x - was.x).toBeCloseTo(0.7, 12);
    expect(words(state, id)!.y - was.y).toBeCloseTo(-2.25, 12);
  });

  it("keeps the side it stands at by the most, below first", () => {
    const b = { x0: 0, y0: 0, x1: 4, y1: 2 };
    const grown = { x0: -1, y0: -1, x1: 5, y1: 4 };
    expect(keptAgainstBox(b, grown, { x: 2, y: -1 }, { w: 1, h: 0.25 })).toEqual({ x: 2, y: -2 });
    expect(keptAgainstBox(b, grown, { x: 2, y: 3 }, { w: 1, h: 0.25 })).toEqual({ x: 2, y: 5 });
    expect(keptAgainstBox(b, grown, { x: -2, y: 1.5 }, { w: 1, h: 0.25 })).toEqual({ x: -3, y: 2 });
    expect(keptAgainstBox(b, grown, { x: 6, y: 1 }, { w: 1, h: 0.25 })).toEqual({ x: 7, y: 1.5 });
    // (as far below as to the left: below)
    expect(keptAgainstBox(b, grown, { x: -1.5, y: -1.5 }, { w: 0.5, h: 0.5 })).toEqual({ x: -1.5, y: -2.5 });
  });

  it("on an undo of a move, drawn part-way between where it was and where it goes as the structure eases", () => {
    const glides: MarkGlides = new Map();
    const at = (x: number, y: number) => [{ key: "1", x, y }];
    markGlideStep(glides, at(10, 5), 0, () => false, GLIDE, easeOut);
    // (the undo: placed back at once in the document; drawn on the drawing's curve, over its time)
    const mid = markGlideStep(glides, at(0, 0), 1000, () => false, GLIDE, easeOut);
    expect(mid.marks[0]).toEqual({ key: "1", x: 10, y: 5 });
    const part = markGlideStep(glides, at(0, 0), 1000 + GLIDE / 2, () => false, GLIDE, easeOut);
    expect(part.moving).toBe(true);
    expect(part.marks[0].x).toBeCloseTo(10 * (1 - easeOut(0.5)), 9);
    expect(part.marks[0].x).toBeGreaterThan(0);
    expect(part.marks[0].x).toBeLessThan(10);
    expect(markGlideStep(glides, at(0, 0), 1000 + GLIDE, () => false, GLIDE, easeOut).marks[0]).toEqual({ key: "1", x: 0, y: 0 });
    // (with a button held - a drag, a turn by the handle - at once)
    expect(markGlideStep(glides, at(4, 4), 3000, () => true, GLIDE, easeOut).marks[0]).toEqual({ key: "1", x: 4, y: 4 });
  });
});

// (the rotate handle as Selection2D turns the selection at each frame: the selected atoms and what the selection carries - its words among
//  them - turned from where they were as the turn began, about `about`, written in one step of the gesture)
function handleTurn(state: State, about: { x: number; y: number }) {
  const st = state();
  const from = st.model.atoms.filter((a) => st.sel.atoms.has(a.id));
  const words = selectionScheme(st).captions;
  const gesture = `turn-${Math.random()}`;
  const turn = <T extends { x: number; y: number }>(ps: readonly T[], angle: number) =>
    ps.map((p) => ({ ...p, x: about.x + Math.cos(angle) * (p.x - about.x) - Math.sin(angle) * (p.y - about.y), y: about.y + Math.sin(angle) * (p.x - about.x) + Math.cos(angle) * (p.y - about.y) }));
  return {
    words,
    to: (angle: number) => state().moveAtoms(turn(from, angle).map((a) => ({ id: a.id, x: a.x, y: a.y })), gesture, words.length ? { captions: turn(words, angle).map((c) => ({ id: c.id, x: c.x, y: c.y })) } : undefined),
    end: () => state().settleMove(gesture, from.map((a) => a.id)),
  };
}

describe("text that belongs to a structure, through the turns a chemist makes", () => {
  const under = (state: State, atom: number, id: number, gap: number) => {
    const b = box(state, atom)!;
    const w = words(state, id)!;
    const h = half(state, id);
    expect(w.x).toBeCloseTo((b.x0 + b.x1) / 2, 9);
    expect(b.y0 - (w.y + h.h)).toBeCloseTo(gap, 9);
  };
  const gapOf = (state: State, atom: number, id: number) => box(state, atom)!.y0 - (words(state, id)!.y + half(state, id).h);

  it("the whole structure selected - its words carried by the selection - turned a quarter by the handle: under the new box, centred, the same gap", () => {
    const { state, atoms, id } = ringWithText();
    const gap = gapOf(state, atoms[0], id);
    state().selectStructure(atoms[0]);
    const t = handleTurn(state, { x: 0.3, y: 0.2 });
    expect(t.words.map((c) => c.id)).toEqual([id]);
    t.to(Math.PI / 2);
    t.end();
    under(state, atoms[0], id, gap);
  });

  it("only the ring's atoms selected and turned a quarter: under the whole structure's new box", () => {
    const { state, atoms, id } = ringWithText();
    const gap = gapOf(state, atoms[0], id);
    const ring = new Set(atoms.slice(0, 6));
    state().setSel({ atoms: ring, bonds: new Set(state().model.bonds.filter((b) => ring.has(b.a) && ring.has(b.b)).map((b) => b.id)) });
    const t = handleTurn(state, { x: 0, y: 0 });
    t.to(Math.PI / 2);
    t.end();
    under(state, atoms[0], id, gap);
  });

  it("turned over left to right from the selection's menu after a quarter turn: still under", () => {
    const { state, atoms, id } = ringWithText();
    const gap = gapOf(state, atoms[0], id);
    state().selectStructure(atoms[0]);
    const t = handleTurn(state, { x: 0.3, y: 0.2 });
    t.to(Math.PI / 2);
    t.end();
    state().turnSelectionOver("vertical");
    under(state, atoms[0], id, gap);
    state().turnSelectionOver("horizontal");
    under(state, atoms[0], id, gap);
  });

  it("a live turn: under the box at every frame - sampled at three angles", () => {
    const { state, atoms, id } = ringWithText();
    const gap = gapOf(state, atoms[0], id);
    state().selectStructure(atoms[0]);
    const t = handleTurn(state, { x: 0.3, y: 0.2 });
    for (const angle of [Math.PI / 7, Math.PI / 3, (3 * Math.PI) / 4]) {
      t.to(angle);
      under(state, atoms[0], id, gap);
    }
    t.end();
    under(state, atoms[0], id, gap);
  });
});
