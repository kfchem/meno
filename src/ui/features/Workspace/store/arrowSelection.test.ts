import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { carriedWithMore, selectionScheme } from "../utils/selectionScheme";
import { arrowsIn } from "../utils/selection";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, st: () => store.getState() };
}

/** A slide with an arrow standing alone on it, pointing at words, and a "+" - and, beside it, a reaction: two atoms, an arrow between them. */
function page() {
  const e = editor();
  const { st } = e;
  const slide = st().addSlide({ x: 0, y: 0, w: 32, h: 18 })!;
  const lone = st().addArrowBetween({ x: -6, y: 0 }, { x: 0, y: 2 });
  const plus = st().addPlus(5, -3);
  const a = st().addAtom(40, 0, "C");
  const reacting = st().addArrow(40 + 3 * L, 0, 0, 3 * L);
  const b = st().addAtom(40 + 6 * L, 0, "N");
  return { ...e, slide, lone, plus, a, b, reacting };
}

describe("arrows and \"+\" signs selected for themselves", () => {
  it("are carried with what the selection's atoms carry - an arrow among them and selected too, once", () => {
    const { store, st, lone, reacting, a, b } = page();
    st().setSel({ atoms: new Set([a, b]), bonds: new Set() });
    expect(selectionScheme(st()).arrows.map((x) => x.id)).toEqual([reacting]);
    // (the reaction's arrow selected for itself as well, as a box over all of it does: still once)
    st().selectArrows([reacting, lone]);
    expect(selectionScheme(st()).arrows.map((x) => x.id).sort()).toEqual([lone, reacting].sort());
    // (a press on the lone arrow takes all of it; on the reaction's arrow, too)
    expect(carriedWithMore(store, "arrow", lone)).toBe(true);
  });

  it("are selected with Select All, and let go with the rest", () => {
    const { st, lone, reacting, plus } = page();
    st().selectAll();
    expect([...st().selArrows].sort()).toEqual([lone, reacting].sort());
    expect([...st().selPluses]).toEqual([plus]);
    st().clearSel();
    expect(st().selArrows.size + st().selPluses.size).toBe(0);
  });

  it("are taken by a box or a lasso wholly round them - each end and corner of an arrow - and by a slide's Select what is on it", () => {
    const arrows = [
      { id: 1, x: 0, y: 0, angle: 0, length: 4 },
      { id: 2, x: 10, y: 0, angle: 0, length: 4 },
    ];
    // (the second's point beyond the box: not taken)
    expect(arrowsIn(arrows, "box", [{ x: -3, y: -1 }, { x: 11, y: 1 }])).toEqual([1]);
    expect(arrowsIn(arrows, "lasso", [{ x: -3, y: -1 }, { x: 13, y: -1 }, { x: 13, y: 1 }, { x: -3, y: 1 }])).toEqual([1, 2]);
    // (bent, its corner too)
    expect(arrowsIn([{ ...arrows[0], corners: [{ along: 0.5, across: 3 }] }], "box", [{ x: -3, y: -1 }, { x: 3, y: 1 }])).toEqual([]);
    const { st, slide, lone, plus } = page();
    st().selectOnSlide(slide);
    expect([...st().selArrows]).toEqual([lone]);
    expect([...st().selPluses]).toEqual([plus]);
  });

  it("are deleted with the selection, the words over an arrow with it, as one step", () => {
    const { doc, st, lone, plus } = page();
    const words = st().addCaption("look", -3, 1.5, lone);
    const depth = doc.history().undoDepth;
    st().selectArrows([lone]);
    st().selectPluses([plus]);
    st().deleteSelection();
    expect(st().arrows.some((x) => x.id === lone)).toBe(false);
    expect(st().pluses).toEqual([]);
    expect(st().captions.some((c) => c.id === words)).toBe(false);
    expect(doc.history().undoDepth).toBe(depth + 1);
  });

  it("are pasted alone, selected, to be moved on at once", () => {
    const { st } = editor();
    st().pasteModel({ atoms: [], bonds: [], arrows: [{ id: 7, x: 0, y: 0, angle: 0, length: 3 * L }], pluses: [{ id: 3, x: 5, y: 0 }] });
    expect(st().arrows).toHaveLength(1);
    expect(st().pluses).toHaveLength(1);
    expect([...st().selArrows]).toEqual([st().arrows[0].id]);
    expect([...st().selPluses]).toEqual([st().pluses[0].id]);
  });

  it("are let go of when an undo takes them away", () => {
    const { doc, st } = editor();
    const id = st().addArrow(0, 0);
    st().selectArrows([id]);
    doc.undo();
    expect(st().selArrows.size).toBe(0);
  });
});
