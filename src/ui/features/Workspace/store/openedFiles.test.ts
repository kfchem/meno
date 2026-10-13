import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { editorModelOf, processFileContent, type ProcessedFileResult } from "../utils/io";
import { recordsOf } from "../utils/stacks";
import { labelBoxes, pageBoxes, placeOpened } from "../utils/freePlace";
import type { Box } from "../utils/extent";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { MENO } from "../../../../lib/chem/style";
import { setMembers } from "../workflow/entries";
import { CARD_H, CARD_W } from "../workflow/look";

/** Store wired to a document, the way a workspace tab is put together. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

const sdf = readFileSync(`${__dirname}/../../../../../scripts/gui/fixtures/conformance-three.sdf`, "utf8");

/** What `read` brings, opened onto `state`'s page with the view's middle at `at`: placed as Open places it (utils/freePlace), and added. */
function opened(state: () => ReturnType<ReturnType<typeof createEditorStore>["getState"]>, read: ProcessedFileResult, at = { x: 0, y: 0 }) {
  const place = placeOpened(state(), read, { arrows: [], pluses: [] }, at, MENO);
  const model = editorModelOf(read.model);
  const dx = place.x - read.centroid.x;
  const dy = place.y - read.centroid.y;
  state().appendModel({ ...model, atoms: model.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })) }, { arrows: [], pluses: [] });
  return place;
}

/** The box round atoms `ids` of the page. */
function boxOfAtoms(state: () => { fullModel: { atoms: { id: number; x: number; y: number }[] } }, ids: Set<number>): Box {
  const at = state().fullModel.atoms.filter((a) => ids.has(a.id));
  return { x0: Math.min(...at.map((a) => a.x)), y0: Math.min(...at.map((a) => a.y)), x1: Math.max(...at.map((a) => a.x)), y1: Math.max(...at.map((a) => a.y)) };
}

const apart = (p: Box, q: Box) => Math.max(p.x0 - q.x1, q.x0 - p.x1, p.y0 - q.y1, q.y0 - p.y1);

describe("an SD file opened into a workspace", () => {
  it("is added as a stack of its own beside one already there, its first record shown, one step to undo each", async () => {
    const { doc, state } = editor();
    for (let k = 0; k < 2; k++) opened(state, await processFileContent("three.sdf", sdf));
    // (the second clear of the first, both opened about the same middle)
    const byStack = (s: number) => new Set(state().fullModel.atoms.filter((a) => a.stack?.id === s).map((a) => a.id));
    const ids = [...new Set(state().fullModel.atoms.map((a) => a.stack?.id).filter((s) => s != null))] as number[];
    expect(apart(boxOfAtoms(state, byStack(ids[0])), boxOfAtoms(state, byStack(ids[1])))).toBeGreaterThan(L);
    const stacks = [...new Set(state().fullModel.atoms.map((a) => a.stack?.id).filter((s) => s != null))];
    expect(stacks).toHaveLength(2);
    for (const s of stacks) expect(recordsOf(state().fullModel, s!).map((r) => r.title)).toEqual(["ethanol", "propan-1-ol", "butan-1-ol"]);
    // (each shows its first record: ethanol's three atoms, twice)
    expect(state().model.atoms).toHaveLength(6);
    expect(doc.history().undoDepth).toBe(2);
    doc.undo();
    expect(new Set(state().fullModel.atoms.map((a) => a.stack?.id)).size).toBe(1);
  });
});

describe("a file opened onto a workflow", () => {
  it("is put down clear of a set's frame and a step's card in the middle of the view, not taken as the set's input", async () => {
    const { state } = editor();
    const set = state().addSet({ x0: -4, y0: -4, x1: 4, y1: 4 });
    state().addStep("optimise", "meno", 6, 3);
    opened(state, await processFileContent("three.sdf", sdf));
    const frame = state().sets.find((b) => b.id === set)!;
    expect(setMembers(state(), frame).structures).toEqual([]);
    const all = new Set(state().fullModel.atoms.map((a) => a.id));
    const drawn = boxOfAtoms(state, all);
    expect(apart(drawn, frame)).toBeGreaterThan(0);
    const step = state().steps[0];
    expect(apart(drawn, { x0: step.x, y0: step.y - CARD_H, x1: step.x + CARD_W, y1: step.y })).toBeGreaterThan(0);
    // (the frame and the card are among what Open keeps clear of)
    expect(pageBoxes(state(), MENO)).toEqual(expect.arrayContaining([{ x0: -4, y0: -4, x1: 4, y1: 4 }, { x0: 6, y0: 3 - CARD_H, x1: 6 + CARD_W, y1: 3 }]));
  });

  it("counts a label as far as it reaches - a reagent written out over an arrow", () => {
    const model = { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "Pd(PPh3)4" }], bonds: [] };
    const [box] = labelBoxes(model as never, MENO);
    expect(box.x1 - box.x0).toBeGreaterThan(3 * L);
  });
});
