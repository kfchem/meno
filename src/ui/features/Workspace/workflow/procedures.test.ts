import { afterEach, describe, expect, it } from "vitest";
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { partsBounds, type FlowParts } from "./parts";
import { centredParts, procedureFileName, procedureLine, procedureNeeds, procedureOf, proceduresSaved, removeProcedure, renameProcedure, saveProcedure, suggestedName } from "./procedures";

/** A procedure's parts: an empty input set wired into an optimisation by xTB, whose result goes into Meno's energy window. */
const PARTS: FlowParts = {
  sets: [{ id: 1, x0: 0, y0: -4, x1: 4, y1: 0 }],
  steps: [
    { id: 5, kind: "energy-window", x: 18, y: 0, by: "meno", options: { window: 3 } },
    { id: 2, kind: "optimise", x: 6, y: 0, by: "xtb", options: { method: "gfn2", solvent: "none", level: "normal" } },
  ],
  wires: [
    { id: 3, from: { set: 1 }, to: 2 },
    { id: 4, from: { step: 2 }, to: 5 },
  ],
};

afterEach(() => {
  useAppSettings.setState({ procedures: [] });
  useReaders.setState({ state: {}, problem: {} });
});

describe("a procedure", () => {
  it("is saved by name in Settings, read back as a workspace's workflow is, renamed and taken away", () => {
    const id = saveProcedure("  Optimise, then a window ", PARTS, 1000);
    const [p] = proceduresSaved();
    expect(p).toMatchObject({ id, name: "Optimise, then a window", saved: 1000 });
    expect(p.parts.steps.map((s) => s.kind).sort()).toEqual(["energy-window", "optimise"]);
    expect(p.parts.wires).toHaveLength(2);
    renameProcedure(id, "Opt");
    expect(proceduresSaved()[0].name).toBe("Opt");
    // (a name that is nothing is no name)
    renameProcedure(id, "  ");
    expect(proceduresSaved()[0].name).toBe("Opt");
    removeProcedure(id);
    expect(proceduresSaved()).toEqual([]);
  });

  it("whose steps do not read is none; what a step did is never kept", () => {
    expect(procedureOf({ id: "p-1", name: "x", saved: 0, flow: { sets: [], steps: [{ kind: "nothing" }], wires: [] } })).toBeNull();
    const ran = { ...PARTS, steps: PARTS.steps.map((s) => ({ ...s, ran: { at: 1, ok: true, said: "x", input: "y" } })) };
    const p = procedureOf({ id: "p-1", name: "x", saved: 0, flow: ran })!;
    expect(p.parts.steps.every((s) => !("ran" in s))).toBe(true);
  });

  it("says what it does in order, what it needs that is not added, and a name until it is given one", () => {
    expect(procedureLine(PARTS)).toBe("Optimise · xTB → Energy window · Meno");
    expect(suggestedName(PARTS)).toBe("Optimise, Energy window");
    expect(procedureNeeds(PARTS)).toEqual(["xTB"]);
    useReaders.setState({ state: { xtb: "added" }, problem: {} });
    expect(procedureNeeds(PARTS)).toEqual([]);
  });

  it("is written to share with its middle at the page's origin, where a workspace opened is first seen", () => {
    const b = partsBounds(centredParts(PARTS))!;
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(0);
    expect(centredParts(PARTS).wires).toEqual(PARTS.wires);
  });

  it("is put down, wired, with its middle where it is put - as one step to undo, and selected", () => {
    const id = saveProcedure("Opt", PARTS);
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    st().putDownProcedure(id, 10, 20);
    const b = partsBounds({ sets: st().sets, steps: st().steps, wires: st().wires })!;
    expect((b.x0 + b.x1) / 2).toBeCloseTo(10);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(20);
    const set = st().sets[0];
    expect([set.x1 - set.x0, set.y1 - set.y0]).toEqual([4, 4]);
    const at = Object.fromEntries(st().steps.map((s) => [s.kind, [s.x - set.x0, s.y - set.y1]]));
    expect(at).toEqual({ optimise: [6, 0], "energy-window": [18, 0] });
    expect(st().wires).toHaveLength(2);
    expect(st().selFlow.sets.size + st().selFlow.steps.size).toBe(3);
    expect(doc.history().undoLabel).toBe("put down procedure");
    doc.undo();
    expect(st().steps).toEqual([]);
  });
});

describe("a procedure written out", () => {
  it("is named as a file may be named on every system", () => {
    expect(procedureFileName("Optimise, then energy window")).toBe("Optimise, then energy window.meno");
    expect(procedureFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j.meno");
    expect(procedureFileName("tab\there\nand there\u0007")).toBe("tab here and there.meno");
    // (Windows' devices' names taken by no file, whatever its extension)
    expect(procedureFileName("CON")).toBe("CON procedure.meno");
    expect(procedureFileName("lpt1")).toBe("lpt1 procedure.meno");
    expect(procedureFileName("Console")).toBe("Console.meno");
    // (no dot or space at its end; not too long; never nothing)
    expect(procedureFileName("Opt... ")).toBe("Opt.meno");
    expect(procedureFileName("x".repeat(300))).toBe(`${"x".repeat(120)}.meno`);
    expect(procedureFileName("😀".repeat(200))).toBe(`${"😀".repeat(120)}.meno`);
    expect(procedureFileName(' :*?" ')).toBe("Procedure.meno");
  });
});
