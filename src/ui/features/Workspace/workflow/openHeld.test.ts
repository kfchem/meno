import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { setMembers } from "./entries";
import { resultOf } from "./flow";
import { isHeld } from "./held";
import { addStep, connect, openedSet } from "./model";
import { placeResults, type RunResults, type RunWith } from "./run";

const extentOf: RunWith["extentOf"] = () => ({ x0: -2, x1: 2, y0: -2, y1: 2 });
const W: RunWith = { extentOf, byOf: () => "meno", now: 1 };
const water = (dx: number): Omit<Molecule3D, "id" | "at"> =>
  ({ atoms: [{ el: "O", x: dx, y: 0, z: 0 }, { el: "H", x: dx + 0.96, y: 0, z: 0 }, { el: "H", x: dx - 0.24, y: 0.93, z: 0 }], bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }] }) as never;

/** A Filter (step 1; its sets 2 and 3) that gave two waters, wired on into an Energy step (4): its kept set held off the page. */
function page(): WorkspaceDocument {
  let doc = addStep(emptyWorkspaceDocument(), "filter", 0, 0);
  doc = addStep(doc, "energy", 300, 0, {}, "xtb");
  doc = placeResults(doc, doc.steps![0], { molecules: [water(0), water(3)], rest: [], holds: "molecules" } as unknown as RunResults, W);
  return connect(doc, { set: 2 }, 4);
}

/** A store on a document whose edits settle as the app's do (held off the page or laid out as wired and opened). */
function stored(doc: WorkspaceDocument) {
  const d = createWorkspaceDocument(undefined, undefined, undefined, () => extentOf);
  d.reset(doc);
  d.edit("settle", (s) => ({ ...s, sets: [...s.sets!] }));
  const store = createEditorStore(d);
  connectStoreToDocument(store, d);
  return { d, st: () => store.getState() };
}
const set2 = (doc: WorkspaceDocument) => doc.sets!.find((b) => b.id === 2)!;

describe("a held set opened and closed (docs/WORKFLOWS.md, *Held results*)", () => {
  it("opens as one edit - laid out on the page - and closes as one, held again; each undone as one", () => {
    const { d, st } = stored(page());
    expect(isHeld(d.getState(), set2(d.getState()))).toBe(true);
    st().openHeld(2, true);
    expect([set2(d.getState()).opened, setMembers(d.getState(), set2(d.getState())).molecules.length]).toEqual([true, 2]);
    st().openHeld(2, false);
    expect([set2(d.getState()).opened, d.getState().molecules3d ?? []]).toEqual([undefined, []]);
    d.undo();
    expect(setMembers(d.getState(), set2(d.getState())).molecules).toHaveLength(2);
    d.undo();
    expect([set2(d.getState()).opened, d.getState().molecules3d ?? []]).toEqual([undefined, []]);
  });

  it("opens only a step's result set: a set the chemist made has nothing to open", () => {
    const doc = page();
    expect(openedSet(doc, 2, true).sets!.find((b) => b.id === 2)!.opened).toBe(true);
    const chemist = { ...doc, sets: [...doc.sets!, { id: 50, x0: 0, y0: 0, x1: 1, y1: 1, members: [] }] };
    expect(openedSet(chemist, 50, true)).toBe(chemist);
    expect(openedSet(doc, 2, false)).toBe(doc);
  });

  it("is shown or held by a click on its exit's port, and its menu is on that port - its frame drawn nowhere while held", () => {
    // (the ports are HTML, in a WebGL page: read as written)
    const layer = readFileSync(join(__dirname, "../components/Workflow2D.tsx"), "utf8");
    expect(layer).toMatch(/if \(!moved\) \{[\s\S]*?b\?\.made && st\.wires\.some\(\(w\) => w\.from\.set === b\.id\)\) st\.openHeld\(b\.id, !b\.opened\)/);
    expect(layer).toMatch(/exits\.map\([\s\S]*?onContextMenu=\{menuOf\("set", b\.id\)\}/);
  });

  it("is opened as a step's atoms are chosen where what comes into it is held - its structures are where they are chosen - in one edit", () => {
    const { d, st } = stored(page());
    st().chooseAtomsFor(4, "atoms");
    expect([st().choosingAtoms, set2(d.getState()).opened, resultOf(d.getState(), 1)!.id]).toEqual([{ step: 4, option: "atoms" }, true, 2]);
    expect(setMembers(d.getState(), set2(d.getState())).molecules).toHaveLength(2);
    d.undo();
    expect(isHeld(d.getState(), set2(d.getState()))).toBe(true);
    // (done choosing: nothing opened or closed)
    st().chooseAtomsFor(4, null);
    expect(st().choosingAtoms).toBeNull();
    expect(isHeld(d.getState(), set2(d.getState()))).toBe(true);
  });
});
