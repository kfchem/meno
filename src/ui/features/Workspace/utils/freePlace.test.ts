import { describe, expect, it } from "vitest";
import { freePlace, labelBoxes, labelledPart, pageBoxes } from "./freePlace";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { editorLayoutOptions } from "../layoutOptions";
import { styleOf } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

const foot = { x0: -2, y0: -1, x1: 2, y1: 1 };

describe("where a file opened onto a page goes", () => {
  it("goes in the middle of the view where nothing is there", () => {
    expect(freePlace([], foot, { x: 3, y: 4 }, 1.5)).toEqual({ x: 3, y: 4 });
    // (nor anything near: what is there, well clear of it)
    expect(freePlace([{ x0: 20, y0: 20, x1: 30, y1: 30 }], foot, { x: 0, y: 0 }, 1.5)).toEqual({ x: 0, y: 0 });
  });

  it("goes in the nearest clear place where something is drawn there, kept a step from it", () => {
    const drawn = { x0: -5, y0: -3, x1: 5, y1: 3 };
    const at = freePlace([drawn], foot, { x: 0, y: 0 }, 1.5);
    const box = { x0: at.x + foot.x0, y0: at.y + foot.y0, x1: at.x + foot.x1, y1: at.y + foot.y1 };
    const apart = Math.max(box.x0 - drawn.x1, drawn.x0 - box.x1, box.y0 - drawn.y1, drawn.y0 - box.y1);
    expect(apart).toBeGreaterThanOrEqual(1.5 - 1e-9);
    // (above or below it, the nearer way out: its box is wider than it is tall)
    expect(at.x).toBe(0);
    expect(Math.abs(at.y)).toBe(6);
  });

  it("goes below what is there, of places as near where right and left are taken", () => {
    const one = { x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 };
    const there = [{ x0: -0.4, y0: -0.4, x1: 0.4, y1: 0.4 }, { x0: 0.6, y0: -0.4, x1: 1.4, y1: 0.4 }, { x0: -1.4, y0: -0.4, x1: -0.6, y1: 0.4 }];
    // (above and below as near, and both clear: below - the y axis up)
    expect(freePlace(there, one, { x: 0, y: 0 }, 1, 0)).toEqual({ x: 0, y: -1 });
  });

  it("goes past the right of all there is where nothing near is clear, never over it", () => {
    // (a drawing far wider than the reach - 24 steps - about the view's middle)
    const wide = { x0: -200, y0: -200, x1: 200, y1: 200 };
    const at = freePlace([wide], foot, { x: 0, y: 0 }, 1.5);
    expect(at.x + foot.x0).toBeGreaterThanOrEqual(wide.x1 + 1.5);
    expect(at.y).toBe(0);
  });

  it("goes to the right of what is there, of places as near", () => {
    const at = freePlace([{ x0: -3, y0: -3, x1: 3, y1: 3 }], { x0: -1, y0: -1, x1: 1, y1: 1 }, { x: 0, y: 0 }, 1);
    expect(at).toEqual({ x: 5, y: 0 });
  });

  it("goes past the right of a page that fills all near the view, at the view's height", () => {
    const everywhere = { x0: -1000, y0: -1000, x1: 1000, y1: 1000 };
    const at = freePlace([everywhere], foot, { x: 1, y: 2 }, 1.5);
    expect(at.y).toBe(2);
    expect(at.x + foot.x0).toBeGreaterThanOrEqual(1000 + 1.5);
  });
});

describe("all there is on a page, as what is put down takes it", () => {
  it("takes a structure's labels as far as the layout sets their letters: put down beside an NHBoc, clear of all of it", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().appendModel({
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: NOMINAL_BOND_LENGTH, y: 0, r: 0.9, el: "NHBoc" },
      ],
      bonds: [{ id: 1, a: 1, b: 2, order: 1 }],
    });
    const st = store.getState();
    const style = styleOf(st.docStyle);
    const letters = labelBoxes(labelledPart(st.model), style);
    const font = editorLayoutOptions(style).fontPx;
    const n = st.model.atoms.find((a) => a.el === "NHBoc")!;
    // (its letters reach far past the pad round its atom)
    expect(Math.max(...letters.map((b) => b.x1))).toBeGreaterThan(n.x + 2 * font);
    // (something small asked to go among them, two letters on from its atom: put clear of every letter)
    const foot = { x0: -font / 4, y0: -font / 4, x1: font / 4, y1: font / 4 };
    const at = freePlace(pageBoxes(st, style), foot, { x: n.x + 2 * font, y: n.y }, font / 2, 0);
    const box = { x0: at.x + foot.x0, y0: at.y + foot.y0, x1: at.x + foot.x1, y1: at.y + foot.y1 };
    expect(letters.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)).toBe(false);
  });
});
