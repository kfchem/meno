import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { colourTargetGone, menuTargetGone } from "./menuTarget";
import { ringKeyOf } from "./rings";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import type { MenuTarget } from "../PartMenu";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

const on = (kind: MenuTarget["kind"], id: number | null): MenuTarget => ({
  kind,
  id,
  selection: "none",
  at: { x: 0, y: 0 },
  x: 0,
  y: 0,
  within: { width: 800, height: 600 },
});

describe("a right-click menu over a part gone (Workspace closes it)", () => {
  it("knows words, an arrow, a plus undone away while their menu is open - Cmd+Z reaches the document with it open", () => {
    const { doc, store, state } = editor();
    const words = state().addCaption("K2CO3, DMF", 1, 2);
    const arrow = state().addArrow(4, 0);
    const plus = state().addPlus(8, 0);
    for (const t of [on("caption", words), on("arrow", arrow), on("plus", plus)]) expect(menuTargetGone(t, store.getState())).toBe(false);
    // (the plus undone: its menu's part gone, the others' still there)
    doc.undo();
    expect(menuTargetGone(on("plus", plus), state())).toBe(true);
    expect(menuTargetGone(on("arrow", arrow), state())).toBe(false);
    doc.undo();
    doc.undo();
    expect(menuTargetGone(on("caption", words), state())).toBe(true);
    expect(menuTargetGone(on("arrow", arrow), state())).toBe(true);
    // (back again with redo: there)
    doc.redo();
    expect(menuTargetGone(on("caption", words), state())).toBe(false);
  });

  it("knows writing by hand rubbed out or undone away", () => {
    const { doc, state } = editor();
    const k = state().writeStroke({ pen: "pen", width: 1 }, { points: [0, 0, 0.5, 1, 1, 0.5] })!;
    expect(menuTargetGone(on("ink", k), state())).toBe(false);
    doc.undo();
    expect(menuTargetGone(on("ink", k), state())).toBe(true);
  });

  it("knows an atom deleted, and leaves a menu on empty space be", () => {
    const { state } = editor();
    const c = state().addAtom(0, 0, "C");
    expect(menuTargetGone(on("atom", c), state())).toBe(false);
    state().deleteAtom(c);
    expect(menuTargetGone(on("atom", c), state())).toBe(true);
    expect(menuTargetGone(on(null, null), state())).toBe(false);
  });
});

describe("a colour card over what an undo took away (it closes; a ring is filled only while drawn)", () => {
  it("knows a ring undone away, fills it with nothing, and a ring drawn again with its ids comes up plain", () => {
    const { doc, store, state } = editor();
    // a ring, drawn as one step as Quick Add's is
    const ring = (ox: number) => {
      doc.edit("add ring", (d) => {
        let x = d;
        const ids: number[] = [];
        for (let k = 0; k < 6; k++) {
          ids.push(x.nextId);
          const at = { x: ox + L * Math.cos((k * Math.PI) / 3), y: L * Math.sin((k * Math.PI) / 3) };
          x = { ...x, nextId: x.nextId + 1, model: { atoms: [...x.model.atoms, { id: x.nextId, ...at, r: 0.9, el: "C" }], bonds: x.model.bonds } };
        }
        for (let k = 0; k < 6; k++) {
          const id = x.nextId;
          x = { ...x, nextId: id + 1, model: { atoms: x.model.atoms, bonds: [...x.model.bonds, { id, a: ids[k], b: ids[(k + 1) % 6], order: 1, stereo: "none", stereoOrient: "principle" }] } };
        }
        return x;
      });
      return state().model.atoms.slice(-6).map((a) => a.id);
    };
    const ids = ring(0);
    const key = ringKeyOf(ids);
    const target = { atoms: [], bonds: [], rings: [key] };
    expect(colourTargetGone(target, store.getState())).toBe(false);
    // Cmd+Z with the card open
    doc.undo();
    expect(colourTargetGone(target, store.getState())).toBe(true);
    // a swatch pressed all the same: no step, nothing filled
    const depth = doc.history().undoDepth;
    state().fillRings([key], "#ff0000");
    expect(doc.history().undoDepth).toBe(depth);
    expect(state().ringFills[key]).toBeUndefined();
    // the next ring takes the same ids, and is drawn plain
    expect(ringKeyOf(ring(20))).toBe(key);
    expect(state().ringFills[key]).toBeUndefined();
    // and an atom or a bond of a card's target, likewise
    const bond = state().model.bonds[0].id;
    expect(colourTargetGone({ atoms: [ids[0]], bonds: [bond], rings: [] }, store.getState())).toBe(false);
    doc.undo();
    expect(colourTargetGone({ atoms: [ids[0]], bonds: [], rings: [] }, store.getState())).toBe(true);
    expect(colourTargetGone({ atoms: [], bonds: [bond], rings: [] }, store.getState())).toBe(true);
  });
});
