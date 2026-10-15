import type { DocumentStore } from "../../../../../lib/doc";
import { gestureStep } from "../../../../../lib/doc/document";
import { marksAll } from "../../../../../lib/chem/captions";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import { EditorState } from "../types";
import { StoreApi } from "zustand";
import type { StyleChoice } from "../../../../../lib/chem/style";
import { isElementSymbol } from "../../../../../lib/roles/molblock";
import { labelTextOf, readLabel } from "../../utils/labelTyping";
import { abbreviationOf } from "../../../../../lib/chem/abbreviations";
import { restyledDocument } from "../../restyle";
import { easeStyle } from "../../styleEase";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** How many label edits have begun: each its own number. */
let labelEdits = 0;

export function createUiSlice(
  doc: DocumentStore<WorkspaceDocument>,
  set: SetState,
  get: GetState,
) {
  // A slider's drag in the Drawing style card, by its key: the workspace as
  // the drag began, each tick converted from it - the starting style to the
  // current one, never tick upon tick, so no error builds up - and the
  // workspace the last tick left, to tell a drag gone on from one begun
  // after another edit (docs/WORKSPACE.md, *Drawing style*).
  let drag: { key: string; start: WorkspaceDocument; last: WorkspaceDocument } | null = null;
  return {
    setCover: (px: number) => {
      if (Math.abs(get().cover - px) > 0.25) set({ cover: px });
    },
    markSavedAs: (path: string, written?: WorkspaceDocument) => {
      set((prev: EditorState) => ({ ...prev, savedPath: path }));
      doc.markSaved(written);
    },
    writing: () => doc.getState(),
    markOpenedOver: (name: string) =>
      set((prev: EditorState) => ({ ...prev, savedPath: null, openedName: name })),

    beginLabelEdit: (atomId: number, initial = "") =>
      set((prev: EditorState) => {
        const base = prev.model.atoms.find((a) => a.id === atomId);
        // (an atom no longer drawn has no label to write)
        if (!base) return prev;
        // (with its charge and mass number, as they are typed: N+, 13C - or the letter it is begun with, as typed)
        const val = initial.length ? initial : base ? labelTextOf(base) : "";
        return {
          ...prev,
          labelEdit: {
            active: true,
            atomId,
            value: val,
            opened: { at: typeof performance !== "undefined" ? performance.now() : Date.now(), value: val },
            n: ++labelEdits,
          },
        };
      }),

    setLabelEditValue: (value: string) =>
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { ...prev.labelEdit, value },
      })),

    commitLabelEdit: (typed?: string) => {
      const { labelEdit } = get();
      if (!labelEdit.active || labelEdit.atomId == null) return;
      const id = labelEdit.atomId;
      // (full-width letters, from an input method, as the ordinary ones)
      const value = labelEdit.value.normalize("NFKC").trim();
      // An empty input keeps the current label.
      // An element with a charge, or a charge alone, sets the atom's
      // chemistry (labelTyping); a group named as an element is - Ac, Pr,
      // Ts, Fm, At - is the group (the maintainer, 2026-10-10), holding it;
      // anything else is a label as typed.
      const atom = get().model.atoms.find((a) => a.id === id);
      let changed = false;
      if (value && atom) {
        const read = readLabel(value, isElementSymbol);
        const named = read.kind === "element" && isElementSymbol(value) && abbreviationOf(value);
        const chem = (d: WorkspaceDocument) =>
          named
            ? { el: value, abbrev: ops.groupHeldAt(d, id, value) }
            : read.kind === "charge"
            ? { ...atom, charge: read.charge }
            : read.kind === "element"
              ? {
                  el: read.el,
                  charge: read.charge,
                  isotope: read.isotope,
                  // (an unpaired electron stays with its element)
                  radical: read.el === atom.el ? atom.radical : undefined,
                }
              : // R1, R2: an Rgroup, drawn R¹ (IUPAC GR-9.1)
                /^R\d+$/.test(read.el)
                ? { el: "R#", rgroups: [Number.parseInt(read.el.slice(1), 10)] }
                : { el: read.el };
        // (what was typed, where it is read as something else: to be had back from the atom's menu)
        const as = typed != null && typed.normalize("NFKC").trim() !== value ? typed.normalize("NFKC").trim() : undefined;
        changed = doc.edit("rename atom", (d) => ops.setAtomChemistry(d, id, chem(d), as));
      }
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "" },
        // (written anew: drawn as written until the drawing's own label is)
        labelLeft: changed && labelEdit.n != null ? { atomId: id, n: labelEdit.n, text: value } : prev.labelLeft,
      }));
    },

    labelAsTyped: (atomId: number) => {
      const atom = get().model.atoms.find((a) => a.id === atomId);
      if (!atom?.typed) return;
      const typed = atom.typed;
      doc.edit("label as typed", (d) => ops.setAtomChemistry(d, atomId, { el: typed }));
    },

    labelShown: () => set((prev: EditorState) => (prev.labelLeft ? { ...prev, labelLeft: null } : prev)),

    cancelLabelEdit: () =>
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "" },
      })),

    setAromaticEnabled: (v: boolean) => {
      doc.edit("aromatic circles", (d) => ops.setAromaticEnabled(d, v));
    },

    setDocumentStyle: (style: StyleChoice, coalesceKey?: string) => {
      // (once: the style set and the page converted with it, one step)
      if (!coalesceKey) {
        drag = null;
        doc.edit("drawing style", (d) => restyledDocument(d, style));
        return;
      }
      // (a slider's tick: from the workspace as its drag began; a new drag,
      // or one after another edit, begins again from the workspace as it is)
      const now = doc.getState();
      if (!drag || drag.key !== coalesceKey || drag.last !== now) drag = { key: coalesceKey, start: now, last: now };
      const start = drag.start;
      doc.edit("drawing style", () => restyledDocument(start, style), { coalesceKey });
      drag.last = doc.getState();
    },

    easeDocumentStyle: (style: StyleChoice) => {
      // (a preset chosen: its bond eased in, one step - ./styleEase)
      drag = null;
      easeStyle(doc, style);
    },

    toggleAromatic: () => {
      doc.edit("aromatic circles", (d) =>
        ops.setAromaticEnabled(d, !d.aromaticEnabled),
      );
    },

    colourParts: (parts: { atoms: Iterable<number>; bonds: Iterable<number>; pushes?: Iterable<number> }, which: "color" | "highlight", color: string | null, gesture?: string) => {
      doc.edit(which === "color" ? "colour" : "highlight", (d) => ops.colourParts(d, parts, which, color), gesture ? gestureStep(`colour:${which}:${gesture}`) : undefined);
    },

    // (one colour given to all a selection holds - atoms and bonds, electron
    // arrows, words, reaction arrows, writing by hand, catalytic cycles - as one step; the
    // system's chooser dragged through colours, one step for all of it)
    colourTogether: (
      what: { atoms?: Iterable<number>; bonds?: Iterable<number>; pushes?: Iterable<number>; words?: readonly number[]; arrows?: readonly number[]; inks?: readonly number[]; cycles?: readonly number[] },
      color: string | null,
      gesture?: string,
    ) => {
      doc.edit(
        "colour",
        (d) => {
          let n = ops.colourParts(d, { atoms: what.atoms ?? [], bonds: what.bonds ?? [], pushes: what.pushes ?? [] }, "color", color);
          if (what.words?.length) n = ops.markCaptions(n, what.words, (c) => marksAll(c.text, c.marks, { color }));
          if (what.arrows?.length) n = ops.setArrowForm(n, what.arrows, { color });
          if (what.inks?.length) n = ops.colourInks(n, what.inks, color);
          for (const id of what.cycles ?? []) n = ops.updateCycle(n, id, { color });
          return n;
        },
        gesture ? gestureStep(`colour:color:${gesture}`) : undefined,
      );
    },

    fillRings: (keys: readonly string[], color: string | null, gesture?: string) => {
      doc.edit("fill ring", (d) => ops.fillRings(d, keys, color), gesture ? gestureStep(`fill:${gesture}`) : undefined);
    },

    setRingEnabled: (key: string, v: boolean) => {
      doc.edit("aromatic circle", (d) => ops.setRingEnabled(d, key, v));
    },

    toggleRing: (key: string) => {
      doc.edit("aromatic circle", (d) =>
        ops.setRingEnabled(d, key, !d.aromaticRings[key]),
      );
    },

    requestFit: () =>
      set((prev: EditorState) => ({ ...prev, fitNonce: prev.fitNonce + 1 })),

    beginAutoFitSuspend: () =>
      set((prev: EditorState) => ({ ...prev, autoFitSuspended: true })),

    endAutoFitSuspend: () =>
      set((prev: EditorState) => ({ ...prev, autoFitSuspended: false })),

    suppressDoubleClick: (ms = 120) =>
      set((prev: EditorState) => ({
        ...prev,
        suppressDblClickUntil: Math.max(
          prev.suppressDblClickUntil,
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + ms,
        ),
      })),
  };
}
