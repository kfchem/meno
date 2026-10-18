import { describe, expect, it, vi } from "vitest";
import type { FigureResult } from "../utils/figures";

// (a figure read as the test gives it: two carbons a bond apart, about naught)
const read: FigureResult = {
  model: {
    atoms: [
      { id: 1, x: -0.7, y: 0, r: 0.9, el: "C" },
      { id: 2, x: 0.7, y: 0, r: 0.9, el: "C" },
    ],
    bonds: [{ id: 1, a: 1, b: 2, order: 1 }],
  },
};
vi.mock("../utils/figures", async (actual) => ({ ...(await actual<typeof import("../utils/figures")>()), readBox: () => Promise.resolve(read) }));

import { readStructure } from "./readStructure";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { captionBox } from "../utils/extent";
import { editorLayoutOptions } from "../layoutOptions";
import { styleOf } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

const said: (string | null)[] = [];
const ui = { working: () => {}, say: (w: string | null) => void said.push(w), view: () => null, fit: () => {} };

describe("a structure read from a PDF's figure, put on the page", () => {
  it("is put clear of all there is: words put down before, as much as structures", async () => {
    // (the region read beside, and words already lying where the structure would go - a scheme's, read before)
    const region = { x0: 0, y0: 0, x1: 10, y1: 8 };
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().putRead({ atoms: [], bonds: [] }, { captions: [{ x: 10 + 3 * NOMINAL_BOND_LENGTH, y: 8, text: "standard conditions" }] });
    expect(store.getState().captions).toHaveLength(1);
    await readStructure(store, { sha256: "a".repeat(64), page: 0, box: [0, 0, 10, 10] }, region, ui);
    const st = store.getState();
    const words = captionBox(st.captions[0], editorLayoutOptions(styleOf(st.docStyle)));
    const placed = st.model.atoms;
    expect(said.filter(Boolean)).toEqual([]);
    expect(placed).toHaveLength(2);
    expect(Math.min(...placed.map((a) => a.x))).toBeGreaterThan(words.x1);
  });
});
