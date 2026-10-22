import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { emptyWorkspaceDocument, addMolecule3d, type WorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { createEditorStore, connectStoreToDocument } from "../store";
import { createWorkspaceDocument } from "../document";
import { countOf, heldOwn, setMolecules } from "./entries";
import { canWire, resultOf, wireRefusal } from "./flow";
import { kindInfo } from "./kinds";
import { addSet, addStep, connect, keepSet, membersSettled, removeStep } from "./model";
import { partsOf } from "./parts";
import { placeResults, type RunWith } from "./run";
import StepCard from "./StepCard";
import { leftByCut } from "../clipboardActions";

/** A water, its oxygen moved along by `k` hundredths of an ångström: each one told apart. */
const water = (k = 0, extra: Partial<Molecule3D> = {}): Omit<Molecule3D, "id" | "at"> => ({
  atoms: [
    { el: "O", x: k / 100, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  ...extra,
});
const extentOf: RunWith["extentOf"] = () => ({ x0: -1, x1: 1, y0: -1, y1: 1 });

/** The desk's case: 120 waters through Duplicates - 2 kept, 118 alike in its rest exit, held in that set (more than 50) - and a step wired on from the rest. */
function duplicated(): { doc: WorkspaceDocument; step: number; rest: number } {
  let doc = addStep(emptyWorkspaceDocument(), "duplicates", 0, 0, {});
  const step = doc.steps![0].id;
  doc = placeResults(doc, doc.steps![0], { molecules: [water(0), water(1)], rest: Array.from({ length: 118 }, (_, k) => water(k + 2)), holds: "molecules" }, { extentOf });
  const rest = resultOf(doc, step, "rest")!.id;
  doc = addStep(doc, "optimise", 40, 0, {}, "xtb");
  doc = connect(doc, { set: rest }, doc.steps![1].id);
  return { doc, step, rest };
}

describe("a large set its step leaves", () => {
  it("stays when the step is deleted, holding its molecules, the wire out of it with it", () => {
    const { doc, step, rest } = duplicated();
    expect(resultOf(doc, step, "rest")!.collection).toHaveLength(118);
    const after = removeStep(doc, step);
    const set = after.sets!.find((b) => b.id === rest)!;
    expect([set.made, set.collection?.length, countOf(after, set).entries]).toEqual([undefined, 118, 118]);
    expect(after.wires).toHaveLength(1);
    // (an empty exit of the step still goes with it)
    let empty = addStep(emptyWorkspaceDocument(), "duplicates", 0, 0, {});
    empty = removeStep(empty, empty.steps![0].id);
    expect(empty.sets ?? []).toEqual([]);
  });

  it("is kept in the workspace's file, and read back, made by no step", () => {
    const page = createWorkspaceDocument();
    const st = createEditorStore(page);
    connectStoreToDocument(st, page);
    const { doc, step } = duplicated();
    page.edit("delete", () => removeStep(doc, step));
    const read = readWorkspace(workspaceText(st.getState()))!;
    expect(read.workflow!.sets.find((b) => !b.made && b.collection)?.collection).toHaveLength(118);
  });

  it("kept out of the file, is kept in it in full once its step is gone: nothing could make its molecules again", () => {
    // (the desk's repro: 118 held, *Don't keep in the file*, the step deleted, saved and read back)
    const { doc, step, rest } = duplicated();
    const page = createWorkspaceDocument();
    const st = createEditorStore(page);
    connectStoreToDocument(st, page);
    page.edit("delete", () => removeStep(keepSet(doc, rest, false), step));
    expect(st.getState().sets.find((b) => b.id === rest)?.keep).toBeUndefined();
    const saved = JSON.parse(workspaceText(st.getState()));
    const set = saved.sets.find((b: { id: number }) => b.id === rest);
    expect([set.collection?.length, set.notKept, set.keep]).toEqual([118, undefined, undefined]);
    expect(readWorkspace(JSON.stringify(saved))!.workflow!.sets.find((b) => b.id === rest)?.collection).toHaveLength(118);
  });

  it("is asked about before it is deleted by a key or a selection - not by its menu, which says it in words - and a set on the page is not", () => {
    const page = createWorkspaceDocument();
    const st = createEditorStore(page);
    connectStoreToDocument(st, page);
    const { doc, rest } = duplicated();
    page.edit("run", () => doc);
    const kept = st.getState().sets.find((b) => b.made?.exit === "out")!.id;
    st.getState().removeSet(rest);
    expect([st.getState().askDeleteSet, st.getState().sets.some((b) => b.id === rest)]).toEqual([[rest], true]);
    st.getState().setWorkflowView({ askDeleteSet: null });
    // (a selection holding it alone: asked, not nothing)
    st.setState({ selFlow: { sets: new Set([rest]), steps: new Set() } });
    st.getState().deleteSelection();
    expect([st.getState().askDeleteSet, st.getState().sets.some((b) => b.id === rest)]).toEqual([[rest], true]);
    st.getState().setWorkflowView({ askDeleteSet: null });
    // (a selection holding it and more: the rest goes, it stays, asked about)
    st.setState({ selFlow: { sets: new Set([rest, kept]), steps: new Set() } });
    st.getState().deleteSelection();
    expect([st.getState().sets.some((b) => b.id === rest), st.getState().sets.some((b) => b.id === kept), st.getState().askDeleteSet]).toEqual([true, false, [rest]]);
    // (cut, as a cut deletes what it copied: left, and how many said back)
    const flow = { sets: [st.getState().sets.find((b) => b.id === rest)!], steps: [], wires: [] };
    expect(st.getState().deleteDrawn({ atoms: [], bonds: [], flow } as unknown as Parameters<ReturnType<typeof st.getState>["deleteDrawn"]>[0])).toBe(1);
    expect(st.getState().sets.some((b) => b.id === rest)).toBe(true);
    expect(leftByCut(1)).toBe("A set that holds its molecules itself was left in place: a copy does not carry them. Delete it on its own.");
    // (asked, or by its menu: gone, its molecules with it)
    st.getState().removeSet(rest, true);
    expect([st.getState().sets.some((b) => b.id === rest), st.getState().askDeleteSet]).toEqual([false, null]);
  });

  it("takes in nothing dropped into its frame: what it holds is its own", () => {
    const { doc, step, rest } = duplicated();
    const before = removeStep(doc, step);
    const set = before.sets!.find((b) => b.id === rest)!;
    const dropped = addMolecule3d(before, { ...water(200), at: { x: (set.x0 + set.x1) / 2, y: (set.y0 + set.y1) / 2 } } as Omit<Molecule3D, "id">);
    const settled = membersSettled(dropped, before);
    const now = settled.sets!.find((b) => b.id === rest)!;
    expect([now.members, setMolecules(settled, now).length]).toEqual([[], 118]);
  });

  it("says before it is deleted that its molecules go with it", () => {
    const { doc, step } = duplicated();
    expect(heldOwn(doc, resultOf(doc, step, "rest")!)).toBe("118 molecules");
    expect(heldOwn(doc, resultOf(doc, step)!)).toBeUndefined();
  });
});

describe("a large set copied", () => {
  it("goes without its own molecules - alone, as a chemist's frame; with its step, empty until it runs again - never a second copy", () => {
    const { doc, step, rest } = duplicated();
    const alone = partsOf(doc, new Set([rest]), new Set());
    expect([alone.sets[0].made, alone.sets[0].collection, alone.sets[0].unread]).toEqual([undefined, undefined, undefined]);
    const withStep = partsOf({ ...doc, sets: doc.sets!.map((b) => (b.id === rest ? { ...b, unread: 3 } : b)) }, new Set([rest]), new Set([step]));
    expect([withStep.sets[0].made, withStep.sets[0].collection, withStep.sets[0].unread]).toEqual([{ step, exit: "rest" }, undefined, undefined]);
  });
});

describe("a wire a step does not take", () => {
  /** A chemist's set round molecules in 3D: one conformer set of each `frames` frames, of two compounds. */
  function setOf(frames: number) {
    let doc = emptyWorkspaceDocument();
    for (const k of [0, 50]) {
      const m = { ...water(k, { conformerSet: true, energies: Array.from({ length: frames }, (_, f) => -76 + f / 1000) }), at: { x: k / 10, y: 0 } };
      doc = addMolecule3d(doc, { ...m, ...(frames > 1 ? { frames: Array.from({ length: frames - 1 }, () => [0, 0, 0, 0.76, 0.59, 0, -0.76, 0.59, 0]) } : {}) } as Omit<Molecule3D, "id">);
    }
    doc = addSet(doc, { x0: -3, y0: -3, x1: 8, y1: 3 });
    doc = addStep(doc, "energy-window", 20, 0, {});
    return { doc, set: doc.sets![0].id, step: doc.steps![0].id };
  }

  it("takes conformer sets of one conformer each, as of more: one conformer found is a conformer set all the same", () => {
    for (const frames of [1, 2]) {
      const { doc, set, step } = setOf(frames);
      expect([canWire(doc, { set }, step), wireRefusal(doc, { set }, step)]).toEqual([true, null]);
    }
  });

  it("says why of a set that is no conformer set, and of a loop", () => {
    let doc = addMolecule3d(emptyWorkspaceDocument(), { ...water(), at: { x: 0, y: 0 } } as Omit<Molecule3D, "id">);
    doc = addSet(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
    doc = addStep(doc, "populations", 20, 0, {});
    expect(wireRefusal(doc, { set: doc.sets![0].id }, doc.steps![0].id)).toBe("It takes a conformer set, not molecules in 3D");
    const { doc: d, rest, step } = duplicated();
    expect(wireRefusal(d, { set: rest }, step)).toBe("It is what this step gives");
  });

  it("is said on the step's card, where its state is", () => {
    const step = { id: 1, kind: "energy-window" as const, x: 0, y: 0 };
    const html = renderToString(
      <StepCard
        step={step}
        info={kindInfo("energy-window")}
        who="Meno"
        how=""
        state="no-input"
        compact={false}
        open={false}
        inputs={[{ id: "in", name: "in", look: "plain" }]}
        optionList={[]}
        options={{}}
        kinds={[]}
        runs={[]}
        refused="It takes a conformer set, not molecules in 3D"
        onOptions={() => {}}
        onKind={() => {}}
        onShowRun={() => {}}
        onClose={() => {}}
        onCardDown={() => {}}
        onContextMenu={() => {}}
        onHover={() => {}}
      />,
    );
    expect(html).toContain("It takes a conformer set, not molecules in 3D");
    expect(html).not.toContain("No input");
  });
});
