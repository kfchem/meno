import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { EditorState } from "./types";

// A right-click on a thing not selected selects it alone - whatever was selected let go, of every kind (docs/EDITOR-2D.md, *Selecting*).

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { store, st: () => store.getState() };
}

/** Each kind's selection, as a list of ids: what is selected of it. */
const selected = (s: EditorState) => ({
  atoms: [...s.sel.atoms],
  bonds: [...s.sel.bonds],
  molecules3d: [...s.sel3d],
  sets: [...s.selFlow.sets],
  steps: [...s.selFlow.steps],
  pictures: [...s.selPictures],
  texts: [...s.selTexts],
  captions: [...s.selCaptions],
  pdfs: [...s.selPdfs],
  slides: [...s.selSlides],
  shapes: [...s.selShapes],
  arrows: [...s.selArrows],
  pluses: [...s.selPluses],
  inks: [...s.selInks],
  cycles: [...s.selCycles],
});

describe("a thing selected alone", () => {
  it("lets go of what was selected of every kind, and selects that one only", () => {
    const { store, st } = editor();
    const a = st().addAtom(0, 0, "C");
    const many = new Set([91, 92]);
    const everything = () =>
      store.setState({
        sel: { atoms: new Set([a]), bonds: new Set([99]) },
        sel3d: new Set(many),
        selFlow: { sets: new Set(many), steps: new Set(many) },
        selPictures: new Set(many),
        selTexts: new Set(many),
        selCaptions: new Set(many),
        selPdfs: new Set(many),
        selSlides: new Set(many),
        selShapes: new Set(many),
        selArrows: new Set(many),
        selPluses: new Set(many),
        selInks: new Set(many),
        selCycles: new Set(many),
      } as Partial<EditorState>);
    const kinds = [
      ["molecule3d", "molecules3d"],
      ["arrow", "arrows"],
      ["plus", "pluses"],
      ["caption", "captions"],
      ["text", "texts"],
      ["ink", "inks"],
      ["cycle", "cycles"],
      ["shape", "shapes"],
      ["picture", "pictures"],
      ["pdf", "pdfs"],
      ["slide", "slides"],
      ["set", "sets"],
      ["step", "steps"],
    ] as const;
    for (const [kind, field] of kinds) {
      everything();
      st().selectAlone(kind, 5);
      const left = selected(st());
      for (const [k, ids] of Object.entries(left)) expect(ids, `${kind}: ${k}`).toEqual(k === field ? [5] : []);
    }
    // (an atom: it alone, as the anchor a Shift-click's path starts from)
    everything();
    st().selectAlone("atom", a);
    const left = selected(st());
    for (const [k, ids] of Object.entries(left)) expect(ids, `atom: ${k}`).toEqual(k === "atoms" ? [a] : []);
    expect(st().selAnchor).toBe(a);
  });
});
