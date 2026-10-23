import { describe, expect, it } from "vitest";
import { readCoordinates } from "../../../../lib/io/coordinates";
import { createWorkspaceDocument, emptyWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { readCarried3D } from "./copyPaste";
import { noting } from "./readNotes";
import { readWorkspace, workspaceText } from "./workspace";
import { setMembers } from "../workflow/entries";
import { placeAsSet } from "../workflow/run";
import { coordinateMolecules, energyOf } from "./coordinates";

// (made up for the test: a water and a methane, each under its name)
const TEXT = [
  "Water",
  "E = -76.4 Hartree",
  "0 1",
  "O 0.000000 0.000000 0.117300",
  "H 0.000000 0.757200 -0.469200",
  "H 0.000000 -0.757200 -0.469200",
  "Methane",
  "C 0.000000 0.000000 0.000000",
  "H 0.629118 0.629118 0.629118",
  "H -0.629118 -0.629118 0.629118",
  "H -0.629118 0.629118 -0.629118",
  "H 0.629118 -0.629118 -0.629118",
].join("\n");

describe("structures read from coordinates, placed", () => {
  const chosen = readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name }));

  it("are molecules in 3D bonded by distance, their orders unknown, each called by its name, with what was said of it", () => {
    const [water, methane] = coordinateMolecules(chosen, "Pasted text");
    expect(water.bonds).toHaveLength(2);
    expect(methane.bonds).toHaveLength(4);
    expect([water.bondOrders, water.bondsFrom, water.title, water.name]).toEqual(["unknown", "distance", "Water", "Pasted text"]);
    expect(water.said).toEqual([
      { label: "Charge, multiplicity", text: "0 1" },
      { label: "Note", text: "E = -76.4 Hartree" },
    ]);
    expect(methane.said).toBeUndefined();
    expect([water.energies, methane.energies]).toEqual([[-76.4], undefined]);
  });

  it("take an energy a note gives in hartrees, and none in other units", () => {
    expect(energyOf(["E(RB3LYP) =  -154.987654321     A.U. after 12 cycles"])).toBe(-154.987654321);
    expect(energyOf(["G = -12.3 kcal/mol", "Imaginary frequencies: 0"])).toBeUndefined();
  });

  it("go on the page as a set of their own round them, its middle where they were asked for", () => {
    const ms = coordinateMolecules(chosen, "Pasted text");
    const doc = placeAsSet(emptyWorkspaceDocument(), ms, { x: 100, y: 50 }, { extentOf: () => ({ x0: -2, x1: 2, y0: -2, y1: 2 }) }, undefined, "made-up-si.pdf, p. 2");
    expect(doc.molecules3d).toHaveLength(2);
    expect(doc.sets).toHaveLength(1);
    const set = doc.sets![0];
    expect(set.name).toBe("made-up-si.pdf, p. 2");
    expect((set.x0 + set.x1) / 2).toBeCloseTo(100);
    expect((set.y0 + set.y1) / 2).toBeCloseTo(50);
    expect(setMembers(doc, set).molecules.sort()).toEqual(doc.molecules3d!.map((m) => m.id).sort());
  });
});

describe("what was said of a structure read from coordinates, saved", () => {
  it("is kept in the workspace's file and shown again as it opens - its charge and multiplicity, its notes - as it was", () => {
    const ms = coordinateMolecules(readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name })), "Pasted text");
    const doc = placeAsSet(emptyWorkspaceDocument(), ms, { x: 0, y: 0 }, { extentOf: () => ({ x0: -2, x1: 2, y0: -2, y1: 2 }) });
    const saving = createWorkspaceDocument();
    const store = createEditorStore(saving);
    connectStoreToDocument(store, saving);
    saving.edit("as it was", () => doc);
    const ws = readWorkspace(workspaceText(store.getState()))!;
    expect(ws.leftOut).toBeUndefined();
    const opening = createWorkspaceDocument();
    const again = createEditorStore(opening);
    connectStoreToDocument(again, opening);
    again.getState().openWorkspace(ws, true);
    expect(opening.getState().molecules3d!.map((m) => m.said)).toEqual([
      [
        { label: "Charge, multiplicity", text: "0 1" },
        { label: "Note", text: "E = -76.4 Hartree" },
      ],
      undefined,
    ]);
  });

  it("leaves out a row that does not read, alone, and says so", () => {
    const [water] = coordinateMolecules(readCoordinates(TEXT).map((structure) => ({ structure, name: structure.name })), "Pasted text");
    const { value: m, left } = noting(() => readCarried3D({ ...water, at: { x: 0, y: 0 }, said: [{ label: "Note", text: "E = -76.4 Hartree" }, { label: "Note" }, 7] }));
    expect(m?.said).toEqual([{ label: "Note", text: "E = -76.4 Hartree" }]);
    expect(left).toEqual({ said: 2 });
  });
});
