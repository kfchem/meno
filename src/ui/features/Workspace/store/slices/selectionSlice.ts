import { EditorState, type Sel, type SelFlow } from "../types";
import { StoreApi } from "zustand";
import { fragmentOf } from "../../chem/cleanUp";
import { pathBetween } from "../../utils/selection";

type SetState = StoreApi<EditorState>["setState"];

const none = (): Sel => ({ atoms: new Set(), bonds: new Set() });

/**
 * Whether anything is selected - atoms or bonds, molecules in 3D, a
 * workflow's sets or steps, pictures, texts' sheets, PDFs, slides, shapes,
 * arrows and "+" signs - and whether any of it is the drawing's: what the
 * keys act on, and whose menu a right-click on empty space opens.
 */
export function selectedOf(st: Pick<EditorState, "sel" | "sel3d" | "selFlow" | "selPictures" | "selTexts" | "selCaptions" | "selPdfs"> & Partial<Pick<EditorState, "selSlides" | "selShapes" | "selArrows" | "selPluses" | "selInks">>): { any: boolean; drawing: boolean } {
  const drawing = st.sel.atoms.size > 0 || st.sel.bonds.size > 0;
  return {
    drawing,
    any:
      drawing ||
      st.sel3d.size > 0 ||
      st.selFlow.sets.size > 0 ||
      st.selFlow.steps.size > 0 ||
      st.selPictures.size > 0 ||
      st.selTexts.size > 0 ||
      st.selCaptions.size > 0 ||
      st.selPdfs.size > 0 ||
      (st.selSlides?.size ?? 0) > 0 ||
      (st.selShapes?.size ?? 0) > 0 ||
      (st.selArrows?.size ?? 0) > 0 ||
      (st.selPluses?.size ?? 0) > 0 ||
      (st.selInks?.size ?? 0) > 0,
  };
}
const noFlow = (): SelFlow => ({ sets: new Set(), steps: new Set() });

/**
 * What is selected, and the last atom chosen - where a Shift+click's path
 * starts from. The selection is the view's, not the document's: it is not
 * undone, and it forgets what an edit takes away (modelSlice).
 */
export function createSelectionSlice(set: SetState) {
  return {
    setSel: (sel: Sel, anchor: number | null = null) =>
      set((prev: EditorState) => ({ ...prev, sel, selAnchor: anchor })),

    /** An atom added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
    toggleAtomSel: (id: number) =>
      set((prev: EditorState) => {
        const atoms = new Set(prev.sel.atoms);
        const bonds = new Set(prev.sel.bonds);
        if (atoms.has(id)) {
          atoms.delete(id);
          // (a bond goes with either of its atoms)
          for (const b of prev.model.bonds) if (b.a === id || b.b === id) bonds.delete(b.id);
        } else {
          atoms.add(id);
        }
        return { ...prev, sel: { atoms, bonds }, selAnchor: atoms.has(id) ? id : prev.selAnchor };
      }),

    /** A bond added to the selection with its atoms, or taken out of it. */
    toggleBondSel: (id: number) =>
      set((prev: EditorState) => {
        const bond = prev.model.bonds.find((b) => b.id === id);
        if (!bond) return prev;
        const atoms = new Set(prev.sel.atoms);
        const bonds = new Set(prev.sel.bonds);
        if (bonds.has(id)) bonds.delete(id);
        else {
          bonds.add(id);
          atoms.add(bond.a);
          atoms.add(bond.b);
        }
        return { ...prev, sel: { atoms, bonds } };
      }),

    /** Everything along the bonds from the last atom chosen to this one, added (Shift and a click). */
    selectPathTo: (id: number) =>
      set((prev: EditorState) => {
        const from = prev.selAnchor;
        const path = from != null ? pathBetween(prev.model, from, id) : null;
        const add = path ?? { atoms: new Set([id]), bonds: new Set<number>() };
        return {
          ...prev,
          sel: {
            atoms: new Set([...prev.sel.atoms, ...add.atoms]),
            bonds: new Set([...prev.sel.bonds, ...add.bonds]),
          },
          selAnchor: id,
        };
      }),

    /** A whole structure: every atom bonded to this one, however far along, and their bonds. */
    selectStructure: (id: number) =>
      set((prev: EditorState) => {
        const atoms = fragmentOf(prev.model, id);
        const bonds = new Set(prev.model.bonds.filter((b) => atoms.has(b.a)).map((b) => b.id));
        return { ...prev, sel: { atoms, bonds }, selAnchor: id };
      }),

    /** Everything on the canvas, the molecules in 3D, the pictures, texts' sheets, PDFs, slides, shapes, arrows, "+" signs, the words and the workflow's sets and steps with it. */
    selectAll: () =>
      set((prev: EditorState) => ({
        ...prev,
        sel: { atoms: new Set(prev.model.atoms.map((a) => a.id)), bonds: new Set(prev.model.bonds.map((b) => b.id)) },
        sel3d: new Set(prev.molecules3d.map((m) => m.id)),
        selPictures: new Set(prev.pictures.map((p) => p.id)),
        selTexts: new Set(prev.texts.filter((t) => t.at).map((t) => t.id)),
        selPdfs: new Set(prev.pdfs.map((p) => p.id)),
        selCaptions: new Set(prev.captions.map((c) => c.id)),
        selSlides: new Set(prev.slides.map((s) => s.id)),
        selShapes: new Set(prev.shapes.map((s) => s.id)),
        selArrows: new Set(prev.arrows.map((a) => a.id)),
        selPluses: new Set(prev.pluses.map((p) => p.id)),
        selInks: new Set(prev.inks.map((k) => k.id)),
        selFlow: { sets: new Set(prev.sets.map((b) => b.id)), steps: new Set(prev.steps.map((s) => s.id)) },
      })),

    /** Nothing selected, and no atom of a molecule in 3D chosen. */
    clearSel: () =>
      set((prev: EditorState) =>
        prev.sel.atoms.size || prev.sel.bonds.size || prev.sel3d.size || prev.chosen3d || prev.selFlow.sets.size || prev.selFlow.steps.size || prev.pdfSel || prev.pdfBox || prev.selPictures.size || prev.selTexts.size || prev.selCaptions.size || prev.selPdfs.size || prev.selSlides.size || prev.selShapes.size || prev.selArrows.size || prev.selPluses.size || prev.selInks.size
          ? { ...prev, sel: none(), selAnchor: null, sel3d: new Set<number>(), chosen3d: null, selFlow: noFlow(), pdfSel: null, pdfBox: null, selPictures: new Set<number>(), selTexts: new Set<number>(), selCaptions: new Set<number>(), selPdfs: new Set<number>(), selSlides: new Set<number>(), selShapes: new Set<number>(), selArrows: new Set<number>(), selPluses: new Set<number>(), selInks: new Set<number>() }
          : prev,
      ),

    /** Arrows and "+" signs selected for themselves - added to those selected, or in their place. */
    // (only those there: an id an undo has taken away is no selection - as for shapes)
    selectArrows: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selArrows: new Set([...(add ? prev.selArrows : []), ...[...ids].filter((id) => prev.arrows.some((a) => a.id === id))]) })),
    selectPluses: (ids: Iterable<number>, add = false) =>
      set((prev: EditorState) => ({ ...prev, selPluses: new Set([...(add ? prev.selPluses : []), ...[...ids].filter((id) => prev.pluses.some((p) => p.id === id))]) })),
    toggleArrowSel: (id: number) =>
      set((prev: EditorState) => {
        const selArrows = new Set(prev.selArrows);
        if (!selArrows.delete(id)) selArrows.add(id);
        return { ...prev, selArrows };
      }),
    togglePlusSel: (id: number) =>
      set((prev: EditorState) => {
        const selPluses = new Set(prev.selPluses);
        if (!selPluses.delete(id)) selPluses.add(id);
        return { ...prev, selPluses };
      }),

    /** A set or a step of a workflow added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
    toggleFlowSel: (part: { set: number } | { step: number }) =>
      set((prev: EditorState) => {
        const sets = new Set(prev.selFlow.sets);
        const steps = new Set(prev.selFlow.steps);
        const [ids, id] = "set" in part ? [sets, part.set] : [steps, part.step];
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { ...prev, selFlow: { sets, steps } };
      }),

    /** The sets and steps selected: these, or (`add`) these besides those already. */
    selectFlow: (flow: { sets: Iterable<number>; steps: Iterable<number> }, add = false) =>
      set((prev: EditorState) => ({
        ...prev,
        selFlow: {
          sets: new Set([...(add ? prev.selFlow.sets : []), ...flow.sets]),
          steps: new Set([...(add ? prev.selFlow.steps : []), ...flow.steps]),
        },
      })),

    setBoxSelect: (box: EditorState["boxSelect"]) => set((prev: EditorState) => ({ ...prev, boxSelect: box })),
  };
}
