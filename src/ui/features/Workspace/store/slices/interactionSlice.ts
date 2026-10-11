import { EditorState } from "../types";
import { StoreApi } from "zustand";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import {
  advanceStroke,
  finishStroke,
  holdStroke,
  NEW_ATOM,
  startStroke,
  type Stroke,
} from "../../utils/stroke";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** No stroke under way. */
export const ended: EditorState["extend"] = {
  active: false,
  atomId: null,
  pointer: null,
  mode: "snap",
  stroke: null,
  preview: null,
};

/** No atom being dragged. */
export const noMoveDrag: EditorState["moveDrag"] = {
  active: false,
  atomId: null,
  pointer: null,
  mode: "snap",
  preview: null,
};

export function createInteractionSlice(set: SetState, get: GetState) {
  return {
    setPressHold: (h: EditorState["pressHold"]) =>
      set((prev: EditorState) => (prev.pressHold === h ? prev : { ...prev, pressHold: h })),
    startExtend: (atomId: number, kind: Stroke["kind"] = "bond", tracing = false) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: {
          active: true,
          atomId,
          pointer: null,
          mode: "snap",
          stroke: startStroke(kind, atomId, prev.model, undefined, NOMINAL_BOND_LENGTH),
          preview: null,
          tracing,
        },
        suppressDblClickUntil: Math.max(prev.suppressDblClickUntil, now() + 120),
      })),
    startChainAt: (x: number, y: number, tracing = false) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: {
          active: true,
          atomId: null,
          pointer: null,
          mode: "snap",
          stroke: startStroke("chain", NEW_ATOM, prev.model, { x, y }, NOMINAL_BOND_LENGTH),
          preview: null,
          tracing,
        },
        suppressDblClickUntil: Math.max(prev.suppressDblClickUntil, now() + 120),
      })),

    updateExtend: (x: number, y: number) =>
      set((prev: EditorState) => {
        if (!prev.extend.active || !prev.extend.stroke) return prev;
        const pointer = { x, y };
        const stroke = advanceStroke(
          prev.model,
          prev.extend.stroke,
          pointer,
          NOMINAL_BOND_LENGTH,
        );
        return { ...prev, extend: { ...prev.extend, pointer, stroke } };
      }),

    holdExtend: () =>
      set((prev: EditorState) => {
        const { stroke, pointer } = prev.extend;
        if (!prev.extend.active || !stroke || !pointer) return prev;
        const next = holdStroke(prev.model, stroke, pointer, NOMINAL_BOND_LENGTH);
        if (next === stroke) return prev;
        return {
          ...prev,
          extend: {
            ...prev.extend,
            stroke: next,
            mode: next.free ? "free" : "snap",
          },
        };
      }),

    commitExtend: () => {
      const st = get();
      const { stroke, pointer } = st.extend;
      if (st.extend.active && stroke) {
        const nodes = pointer
          ? finishStroke(st.model, stroke, pointer, NOMINAL_BOND_LENGTH)
          : stroke.nodes;
        if (nodes.length && stroke.baseId === NEW_ATOM && stroke.start) st.drawStrokeAt(stroke.start, nodes);
        else if (nodes.length) st.drawStroke(stroke.baseId, nodes, stroke.kind);
      }
      set((prev: EditorState) => ({
        ...prev,
        extend: ended,
        suppressDblClickUntil: now() + 120,
      }));
    },

    cancelExtend: () =>
      set((prev: EditorState) => ({
        ...prev,
        extend: ended,
        suppressDblClickUntil: now() + 120,
      })),

    setExtendPreview: (
      x: number,
      y: number,
      join?: { atomId?: number; pathIndex?: number },
    ) =>
      set((prev: EditorState) => {
        if (!prev.extend.active) return prev;
        const cur = prev.extend.preview;
        if (
          cur &&
          Math.abs(cur.x - x) < 1e-4 &&
          Math.abs(cur.y - y) < 1e-4 &&
          cur.atomId === join?.atomId &&
          cur.pathIndex === join?.pathIndex
        ) {
          return prev;
        }
        return {
          ...prev,
          extend: { ...prev.extend, preview: { x, y, ...join } },
        };
      }),

    beginMoveDrag: (
      atomId: number,
      pointer?: { x: number; y: number } | null,
    ) =>
      set((prev: EditorState) => {
        // Clear hover if it currently targets the moving atom or its bonds
        let hovered = prev.hovered;
        if (hovered.atomId === atomId)
          hovered = { atomId: null, bondId: hovered.bondId };
        const bondsOfAtom = new Set(
          prev.model.bonds
            .filter((b) => b.a === atomId || b.b === atomId)
            .map((b) => b.id),
        );
        if (hovered.bondId != null && bondsOfAtom.has(hovered.bondId)) {
          hovered = { atomId: hovered.atomId, bondId: null };
        }
        return {
          ...prev,
          moveDrag: {
            active: true,
            atomId,
            pointer: pointer ?? null,
            mode: "snap",
            preview: pointer ?? null,
          },
          hovered,
        };
      }),

    /**
     * Preview position of the dragged atom, written by MovePreview2D once per
     * frame. Ignore sub-pixel jitter so the layers reading it do not re-render
     * for movement nobody can see.
     */
    setMoveDragPreview: (x: number, y: number) =>
      set((prev: EditorState) => {
        if (!prev.moveDrag.active) return prev;
        const cur = prev.moveDrag.preview;
        if (cur && Math.abs(cur.x - x) < 1e-4 && Math.abs(cur.y - y) < 1e-4) {
          return prev;
        }
        return { ...prev, moveDrag: { ...prev.moveDrag, preview: { x, y } } };
      }),

    updateMovePointer: (x: number, y: number) =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: prev.moveDrag.active
          ? { ...prev.moveDrag, pointer: { x, y } }
          : prev.moveDrag,
      })),

    setMoveMode: (mode: "snap" | "free") =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: prev.moveDrag.active
          ? { ...prev.moveDrag, mode }
          : prev.moveDrag,
      })),

    endMoveDrag: () =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: noMoveDrag,
      })),

    beginPanHold: (pointerId: number | null) =>
      set((prev: EditorState) => ({
        ...prev,
        panHold: { active: true, pointerId: pointerId ?? null },
      })),

    endPanHold: (pointerId?: number | null) =>
      set((prev: EditorState) => {
        if (!prev.panHold.active) return prev;
        if (
          pointerId == null ||
          prev.panHold.pointerId == null ||
          prev.panHold.pointerId === pointerId
        ) {
          return { ...prev, panHold: { active: false, pointerId: null } };
        }
        return prev;
      }),

    letGo: () =>
      set((prev: EditorState) => ({
        ...prev,
        // nothing under the pointer
        hovered: { atomId: null, bondId: null },
        hovered3d: null,
        hoveredAtom3d: null,
        figureLit: null,
        hoveredMeasure3d: null,
        hoveredArrow: null,
        hoveredPlus: null,
        hoveredCaption: null,
        hoveredMark: null,
        hoveredPdf: null,
        hoveredPicture: null,
        hoveredSlide: null,
        hoveredShape: null,
        shapeDraft: null,
        hoveredText: null,
        hoveredSet: null,
        hoveredStep: null,
        hoveredWire: null,
        litPdf: null,
        // no gesture under way
        boxSelect: { active: false, kind: "box", points: [] },
        pressHold: null,
        doubleClickBond: null,
        extend: ended,
        moveDrag: { active: false, atomId: null, pointer: null, mode: "snap", preview: null },
        panHold: { active: false, pointerId: null },
        wireDrag: null,
        // nothing being written, carried or asked over the canvas
        labelEdit: { active: false, atomId: null, value: "" },
        captionEdit: null,
        captionLeft: null,
        pushDraw: null,
        wordsWriting: null,
        quickAdd: null,
        workflowMenu: null,
        pdfWords: null,
        pdfPicture: null,
        menuAsk: null,
        // (and no talk being given: one that failed ends)
        presenting: null,
        guides: null,
      })),
  };
}
