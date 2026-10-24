import type { Table } from "../../../../../lib/table";
import { gestureStep } from "../../../../../lib/doc/document";
import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import { valuesOf } from "../../../../../lib/options";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import type { WorkspaceDocument } from "../../document";
import { style3dOf } from "../../style3d";
import { ONE_INPUT } from "../../workflow/kinds";
import { reachOverFrames } from "../../utils/molecule3d";
import { freePlace, pageBoxes } from "../../utils/freePlace";
import { styleOf } from "../../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import { byOf, kindsOf, optionsFor } from "../../workflow/doers";
import type { StepKind } from "../../workflow/kinds";
import * as wf from "../../workflow/model";
import { appendParts, partsBounds } from "../../workflow/parts";
import { placeCard } from "../../workflow/place";
import { proceduresSaved } from "../../workflow/procedures";
import { fitResultSets, placeAsSet, type RunWith } from "../../workflow/run";
import { holdsOwn, type Frame } from "../../workflow/entries";
import type { EditorState, Molecule3D, WorkflowView } from "../types";
import { createStepRuns } from "./stepRuns";
import { positionIds } from "../../workflow/substituents";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** The role a kind of step's defaults are kept under, as who does it takes them - set in Settings, Calculations (lib/settings/appSettings `options`). */
export const stepRole = (kind: StepKind, by: string) => `step:${by}:${kind}`;

/**
 * A workflow on the page (docs/WORKFLOWS.md): its sets, steps and wires,
 * edits to the document - so that undo takes each back and Save keeps it;
 * what is under the pointer, chosen, open or being drawn, the view's.
 */
export function createWorkflowSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState) {
  const coalesce = (what: string, id: number, gesture?: string) => (gesture ? gestureStep(`${what}:${id}:${gesture}`) : {});
  const { forgetJobs, ...runs } = createStepRuns(doc, set, get, { extentOf: (m, turn) => reachOverFrames({ ...m, id: 0 }, style3dOf(get()), turn) });
  return {
    ...runs,
    forgetStepJobs: forgetJobs,
    setWorkflowView: (patch: Partial<Pick<EditorState, WorkflowView>>) => set(patch),
    fitResultSets: () => {
      // (each molecule's reach worked out once, however many of the history's states hold it)
      const style = style3dOf(get());
      const { turns3d } = get();
      const reach = new WeakMap<object, Frame>();
      const extentOf: RunWith["extentOf"] = (m, turn) => {
        if (!reach.has(m)) reach.set(m, reachOverFrames({ ...m, id: 0 }, style, turn));
        return reach.get(m)!;
      };
      doc.amend((d) => fitResultSets(d, extentOf, (id) => turns3d[id]));
    },
    // (the set made's id, where one was)
    placeAsSet: (ms: Omit<Molecule3D, "id" | "at">[], at: { x: number; y: number }, name?: string) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      // (in free space nearest where it was asked for, as a file opened goes: utils/freePlace)
      const made = doc.edit("place structures", (d) =>
        placeAsSet(d, ms, at, { extentOf: (m, turn) => reachOverFrames({ ...m, id: 0 }, style3dOf(get()), turn) }, (width, height) =>
          freePlace(pageBoxes(get(), styleOf(get().docStyle)), { x0: -width / 2, x1: width / 2, y0: -height / 2, y1: height / 2 }, at, NOMINAL_BOND_LENGTH),
          name,
        ),
      );
      return made ? id : undefined;
    },
    renameSet: (id: number, name: string) => doc.edit("rename set", (d) => wf.renameSet(d, id, name)),
    keepSet: (id: number, keep: boolean) => doc.edit(keep ? "keep set in file" : "keep set out of file", (d) => wf.keepSet(d, id, keep)),
    keepRawOutputs: (id: number, keep: boolean) => doc.edit(keep ? "keep raw outputs" : "keep no raw outputs", (d) => wf.keepRawOutputs(d, id, keep)),
    addSet: (frame: { x0: number; y0: number; x1: number; y1: number }) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      doc.edit("add set", (d) => wf.addSet(d, frame));
      return id;
    },
    placeTable: (table: Table, at: { x: number; y: number }, name?: string) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      doc.edit("put table", (d) => wf.addTableSet(d, at, table, name));
      return id;
    },
    resizeSet: (id: number, frame: { x0: number; y0: number; x1: number; y1: number }, gesture?: string) =>
      doc.edit("size set", (d) => wf.resizeSet(d, id, frame), coalesce("set-size", id, gesture)),
    moveSet: (id: number, dx: number, dy: number, gesture?: string) => doc.edit("move set", (d) => wf.moveSet(d, id, dx, dy), coalesce("set-move", id, gesture)),
    readSetTable: (id: number) => set((prev: EditorState) => ({ ...prev, setsRead: prev.setsRead.includes(id) ? prev.setsRead : [...prev.setsRead, id], setTableShown: id, textsOpen: true })),
    showSetTable: (id: number) => set({ setTableShown: id, textsOpen: true }),
    stopReadingSetTable: (id: number) =>
      set((prev: EditorState) => {
        const setsRead = prev.setsRead.filter((s) => s !== id);
        // (the one shown closed: the last of the others, or what the column showed before it)
        if (prev.setTableShown !== id) return { ...prev, setsRead };
        const next = setsRead[setsRead.length - 1] ?? null;
        const nothing = next == null && prev.pdfShown == null && !prev.texts.some((t) => t.id === prev.textShown && t.reading !== false) && !prev.textsLost.some((t) => t.id === prev.textShown);
        return { ...prev, setsRead, setTableShown: next, ...(nothing ? { textsOpen: false } : {}) };
      }),
    removeSet: (id: number | readonly number[], asked = false) => {
      const ids = typeof id === "number" ? [id] : [...id];
      // (one that holds its molecules itself, on no page, is asked about first: they go with it)
      if (!asked && ids.some((x) => holdsOwn(doc.getState().sets?.find((b) => b.id === x)))) return set({ askDeleteSet: ids });
      if (doc.edit(ids.length > 1 ? "delete sets" : "delete set", (d) => ids.reduce((n, x) => wf.removeSet(n, x), d)))
        set((prev: EditorState) => ({
          ...prev,
          askDeleteSet: null,
          setsRead: prev.setsRead.filter((s) => !ids.includes(s)),
          setTableShown: prev.setTableShown != null && ids.includes(prev.setTableShown) ? null : prev.setTableShown,
          hoveredSet: prev.hoveredSet != null && ids.includes(prev.hoveredSet) ? null : prev.hoveredSet,
          chosenSet: prev.chosenSet != null && ids.includes(prev.chosenSet) ? null : prev.chosenSet,
        }));
    },
    addStep: (kind: StepKind, by: string, x: number, y: number) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      // (with the defaults Settings has for its kind, done by it)
      const options = valuesOf(optionsFor(kind, by), useAppSettings.getState().options[stepRole(kind, by)]);
      // (where it was put down, or lower where something is there: never over a set, a card or a wire)
      doc.edit("add step", (d) => {
        const at = placeCard(d, x, y);
        return wf.addStep(d, kind, at.x, at.y, options, by);
      });
      return id;
    },
    moveStep: (id: number, x: number, y: number, gesture?: string) => doc.edit("move step", (d) => wf.moveStep(d, id, x, y), coalesce("step-move", id, gesture)),
    updateStep: (id: number, patch: { options?: Record<string, string | number | boolean>; kind?: StepKind }) => {
      const step = doc.getState().steps?.find((s) => s.id === id);
      if (!step) return;
      const by = byOf(step);
      if (patch.kind && patch.kind !== step.kind) {
        // (another kind its plugin fills: with the defaults Settings has for that one - those it shares with the step's, as the step has them)
        const kind = patch.kind;
        if (!kindsOf(by).includes(kind)) return;
        const options = valuesOf(optionsFor(kind, by), { ...useAppSettings.getState().options[stepRole(kind, by)], ...step.options });
        doc.edit("change calculation", (d) => wf.updateStep(d, id, { kind, options }));
        return;
      }
      // (the step's alone: the defaults are Settings', and stay as they are - one undo step for a run of changes to the same
      // option, close together: a number stepped by an arrow key held down, as typing is)
      if (patch.options) {
        const options = patch.options;
        const changed = Object.keys(options).filter((k) => options[k] !== step.options?.[k]).sort().join(",");
        doc.edit("change options", (d) => wf.updateStep(d, id, { options }), { coalesceKey: `step-options:${id}:${changed}` });
      }
    },
    /** An atom clicked while a step's atoms are chosen on the drawing (`choosingAtoms`): taken into that option, or out of it - an edit of the step's options, undone as one. */
    chooseAtom: (atom: number) => {
      const choosing = get().choosingAtoms;
      const step = choosing && doc.getState().steps?.find((s) => s.id === choosing.step);
      if (!choosing || !step) return;
      const was = positionIds(String(step.options?.[choosing.option] ?? ""));
      const now = was.includes(atom) ? was.filter((id) => id !== atom) : [...was, atom];
      doc.edit("choose atoms", (d) => wf.updateStep(d, step.id, { options: { ...step.options, [choosing.option]: now.join(" ") } }));
    },
    removeStep: (id: number, asked = false) => {
      const step = doc.getState().steps?.find((s) => s.id === id);
      if (!step) return;
      // (one running is asked about first: deleting it stops it)
      if (step.running && !asked) return set({ askDeleteStep: id });
      if (doc.edit("delete step", (d) => wf.removeStep(d, id))) {
        forgetJobs(step);
        set((prev: EditorState) => ({
          ...prev,
          askDeleteStep: null,
          openStep: prev.openStep === id ? null : prev.openStep,
          hoveredStep: prev.hoveredStep === id ? null : prev.hoveredStep,
        }));
      }
    },
    holdUndo: (direction: "undo" | "redo") => {
      const gone = wf.runningGone(doc.getState(), doc.peek(direction));
      if (!gone.length) return false;
      set({ askUndo: { direction, steps: gone.length } });
      return true;
    },
    letUndo: (go: boolean) => {
      const asked = get().askUndo;
      set({ askUndo: null });
      if (!asked || !go) return;
      // (stopped as deleting them stops them: their jobs, and their files once ended)
      for (const step of wf.runningGone(doc.getState(), doc.peek(asked.direction))) forgetJobs(step);
      if (asked.direction === "undo") doc.undo();
      else doc.redo();
    },
    putDownProcedure: (id: string, x: number, y: number) => {
      const procedure = proceduresSaved().find((p) => p.id === id);
      if (!procedure) return;
      // (its middle where Quick Add was opened, as a paste's is; put down, it is the selection - to be moved as one)
      const b = partsBounds(procedure.parts);
      const dx = b ? x - (b.x0 + b.x1) / 2 : x;
      const dy = b ? y - (b.y0 + b.y1) / 2 : y;
      let added: { sets: number[]; steps: number[] } = { sets: [], steps: [] };
      const done = doc.edit("put down procedure", (d) => {
        const r = appendParts(d, procedure.parts, dx, dy);
        added = r;
        return r.doc;
      });
      if (!done) return;
      set((prev: EditorState) => ({
        ...prev,
        sel: { atoms: new Set(), bonds: new Set() },
        sel3d: new Set(),
        selFlow: { sets: new Set(added.sets), steps: new Set(added.steps) },
      }));
    },
    connect: (from: Parameters<typeof wf.connect>[1], to: number, port?: string) => {
      const was = doc.getState();
      doc.edit("wire", (d) => wf.connect(d, from, to, port));
      return doc.getState() !== was;
    },
    removeWire: (id: number) => {
      if (doc.edit("delete wire", (d) => wf.removeWire(d, id)))
        set((prev: EditorState) => ({ ...prev, hoveredWire: prev.hoveredWire === id ? null : prev.hoveredWire }));
    },
    rewire: (id: number, to: number, port?: string) => {
      doc.edit("wire", (d) => {
        const w = d.wires?.find((x) => x.id === id);
        const at = port ?? w?.to.port ?? ONE_INPUT;
        if (!w || (w.to.step === to && w.to.port === at)) return d;
        const moved = wf.connect(wf.removeWire(d, id), w.from, to, at);
        // (where it may not go there, it stays where it was)
        return moved.wires?.some((x) => x.to.step === to && x.to.port === at && JSON.stringify(x.from) === JSON.stringify(w.from)) ? moved : d;
      });
    },
  };
}
