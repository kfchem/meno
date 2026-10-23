import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Drawn, EditorState, WorkflowSet } from "../store/types";
import { deleteFromMenu } from "../menuDelete";
import type { MenuTarget } from "../PartMenu";
import { centredAt } from "../utils/copyPaste";
import { countOf, countSaid, heldOwn, holdsOf, numberedRecord, recordNumber, setMembers } from "./entries";
import { DRAWN_ON_PAGE } from "./look";
import { addStep, removeStep } from "./model";
import { partsOf } from "./parts";
import { placeResults } from "./run";
import { readWorkflow } from "./saved";

/**
 * A page whose step gave 120 nitrogen molecules, numbered - more than the
 * page shows (look `DRAWN_ON_PAGE`): 50 on it, 70 held in the set - its
 * step deleted where `stepGone`.
 */
function page120(stepGone = false) {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const n2 = (k: number) => ({ atoms: [{ id: 1, el: "N", x: 0, y: 0, r: 0.9 }, { id: 2, el: "N", x: 1.1, y: 0, r: 0.9 }] as never[], bonds: [{ id: 1, a: 1, b: 2, order: 3 }] as never[], record: numberedRecord(k, `R1 = ${k}`) });
  doc.edit("run", (d) => {
    const s = addStep(d, "duplicates", 0, 0);
    const step = s.steps![s.steps!.length - 1];
    const ran = placeResults(s, step, { molecules: [], rest: [], holds: "structures", drawn: { made: Array.from({ length: 120 }, (_, k) => n2(k + 1)), rest: [] } }, { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }) });
    return stepGone ? removeStep(ran, step.id) : ran;
  });
  const st = () => store.getState();
  const id = st().sets.find((b) => setMembers(st(), b).structures.length && b.drawnCollection)!.id;
  return { store, st, id };
}

/** A set's structures by their numbers, in the order it gives them on: those on the page, then those it holds. */
const numbers = (st: EditorState, b: WorkflowSet) => [...setMembers(st, b).records, ...(b.drawnCollection ?? []).map((m) => m.record)].map((r) => recordNumber(r));
const all = Array.from({ length: 120 }, (_, k) => k + 1);

/** What a copy of set `id` carries - as the clipboard writes it, through Meno's own record (copyPaste: the part's drawing, and its workflow's parts) - the set selected, its step not. */
function copied(st: EditorState, id: number): Drawn {
  const set = st.sets.find((b) => b.id === id)!;
  const atoms = new Set(setMembers(st, set).structures.flat());
  const flow = partsOf(st, new Set([id]), new Set());
  const read = readWorkflow(JSON.parse(JSON.stringify(flow)))!;
  return {
    atoms: st.model.atoms.filter((a) => atoms.has(a.id)),
    bonds: st.model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)),
    flow: { sets: read.sets, steps: read.steps, wires: read.wires },
  } as Drawn;
}

/** The set a paste put down: the one its paste selected. */
const pasted = (st: EditorState) => st.sets.find((b) => st.selFlow.sets.has(b.id))!;

describe("a set holding structures drawn it does not show", () => {
  it("is asked about before its menu's Delete deletes it - as by the key - saying how many go with it", () => {
    const { st, id } = page120();
    expect(setMembers(st(), st().sets.find((b) => b.id === id)!).structures).toHaveLength(DRAWN_ON_PAGE.most);
    const menu: MenuTarget = { kind: "set", id, selection: "none", at: { x: 0, y: 0 }, x: 0, y: 0, within: { width: 800, height: 600 } };
    deleteFromMenu(st(), menu, () => {});
    expect([st().askDeleteSet, st().sets.some((b) => b.id === id)]).toEqual([[id], true]);
    expect(heldOwn(st(), st().sets.find((b) => b.id === id)!)).toBe("70 structures");
  });

  it("is asked about before a selection holding it is deleted", () => {
    const { store, st, id } = page120();
    store.setState({ selFlow: { sets: new Set([id]), steps: new Set() } });
    st().deleteSelection();
    expect([st().askDeleteSet, st().sets.some((b) => b.id === id)]).toEqual([[id], true]);
  });

  it("cut and pasted, holds all 120 again - those it shows, the rest held - none left behind, none lost", () => {
    const { st, id } = page120();
    const part = copied(st(), id);
    // (a cut takes it: none left in place)
    expect(st().deleteDrawn(part)).toBe(0);
    expect(st().sets.some((b) => b.id === id)).toBe(false);
    st().pasteModel(part);
    const set = pasted(st());
    expect([holdsOf(st(), set), countOf(st(), set).entries, numbers(st(), set)]).toEqual(["structures", 120, all]);
  });

  it("copied and pasted, with its step or with its step gone, holds all 120", () => {
    for (const gone of [false, true]) {
      const { st, id } = page120(gone);
      // (put down well away from it, as a paste is put where it is asked for)
      st().pasteModel(centredAt(copied(st(), id), { x: 500, y: -500 }));
      const set = pasted(st());
      expect(set.id).not.toBe(id);
      expect([countOf(st(), set).entries, numbers(st(), set)]).toEqual([120, all]);
    }
  });

  it("cut or copied with its step and pasted, holds all 120 - shown, the rest held - its count saying so: never the shown alone", () => {
    for (const cut of [true, false]) {
      const { st, id } = page120();
      const step = st().sets.find((b) => b.id === id)!.made!.step;
      const set0 = st().sets.find((b) => b.id === id)!;
      const atoms = new Set(setMembers(st(), set0).structures.flat());
      const flow = partsOf(st(), new Set([id]), new Set([step]));
      const read = readWorkflow(JSON.parse(JSON.stringify(flow)))!;
      const part = {
        atoms: st().model.atoms.filter((a) => atoms.has(a.id)),
        bonds: st().model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)),
        flow: { sets: read.sets, steps: read.steps, wires: read.wires },
      } as Drawn;
      if (cut) st().deleteDrawn(part);
      st().pasteModel(centredAt(part, { x: 500, y: -500 }));
      const set = pasted(st());
      expect([set.made?.step === step, countOf(st(), set).entries, numbers(st(), set)]).toEqual([false, 120, all]);
      expect(countSaid(set, countOf(st(), set))).toBe(`${DRAWN_ON_PAGE.most} of 120 structures shown`);
    }
  });
});
