import { describe, expect, it } from "vitest";
import { addMolecule3d, createWorkspaceDocument, type WorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { inScope, readSeenId, type Scope } from "./scope";
import { callTool, NO_SUCH, TEXT_MOST, type ToolCall } from "./tools";

/**
 * A page: methanol drawn at the left, a water in 3D and a text sheet beside
 * it, and a step's log - a text with no sheet - and, far to the right, a
 * benzene drawn and a step's card.
 */
function page() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  doc.edit("draw", (d) => ({
    ...d,
    model: {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, r: 0.3 },
        { id: 2, el: "O", x: 1.5, y: 0, r: 0.3 },
        ...[0, 1, 2, 3, 4, 5].map((k) => ({ id: 10 + k, el: "C", x: 40 + Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3), r: 0.3 })),
      ],
      bonds: [
        { id: 3, a: 1, b: 2, order: 1 as const },
        ...[0, 1, 2, 3, 4, 5].map((k) => ({ id: 20 + k, a: 10 + k, b: 10 + ((k + 1) % 6), order: (k % 2 ? 1 : 2) as 1 | 2 })),
      ],
    },
    nextId: 30,
  }));
  doc.edit("water", (d) =>
    addMolecule3d(d, {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0, y: 0.76, z: 0.59 },
        { el: "H", x: 0, y: -0.76, z: 0.59 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 4, y: 0 },
      energies: [-76.4],
      calc: { readers: ["meno"], program: "ORCA", method: "B3LYP", basis: "def2-SVP", solvation: "none", charge: 0, multiplicity: 1 },
    } as Parameters<typeof addMolecule3d>[1]),
  );
  doc.edit("texts", (d) => ({
    ...d,
    texts: [
      { id: 1, name: "notes.txt", text: "Protect the alcohol first.", at: { x: 6, y: 2 } },
      { id: 2, name: "Optimise 1.log", text: "a whole log", of: { step: 99 } },
    ],
    nextTextId: 3,
  }));
  const step = store.getState().addStep("energy-window", "meno", 40, 10);
  const scope: Scope = { frame: { x0: -2, y0: -5, x1: 20, y1: 5 } };
  return { doc, store, step, scope, call: (c: ToolCall, s: Scope = scope) => callTool(doc.getState(), s, c) };
}

describe("what a conversation sees: what lies inside its frame", () => {
  it("lists what lies inside, by kind - nothing outside it, and never a text with no sheet of its own", () => {
    const { call } = page();
    const listed = call({ tool: "list" });
    expect(listed.ok).toBe(true);
    const things = (listed as { value: { id: string; line: string }[] }).value;
    expect(things.map((t) => t.id)).toEqual(["structure:1", "molecule:1", "text:1"]);
    expect(things[0].line).toBe("a structure drawn: CO");
    expect(things[1].line).toBe("a molecule in 3D: H2O · B3LYP/def2-SVP · gas phase");
    expect(things[2].line).toBe("a text: notes.txt");
  });

  it("reads a thing in full - and answers one outside, or one with no sheet, as one that is not there, in the same words", () => {
    const { call, step } = page();
    const water = call({ tool: "read", args: { id: "molecule:1" } });
    expect(water).toMatchObject({ ok: true, value: { formula: "H2O", frames: 1, energies: { values: [-76.4], unit: "hartree" }, calculation: { program: "ORCA", level: "B3LYP/def2-SVP · gas phase", charge: 0, multiplicity: 1 } } });
    expect(call({ tool: "read", args: { id: "structure:1" } })).toMatchObject({ ok: true, value: { smiles: "CO", bonds: [{ a: 1, b: 2, order: 1 }] } });
    expect(call({ tool: "read", args: { id: "text:1" } })).toMatchObject({ ok: true, value: { name: "notes.txt", text: "Protect the alcohol first." } });
    // (the benzene and the step, outside; the log, nowhere; a molecule that is not there at all - all alike)
    for (const id of ["structure:10", `step:${step}`, "text:2", "molecule:77"]) expect(call({ tool: "read", args: { id } })).toEqual({ ok: false, why: NO_SUCH });
    // (an id it cannot read, or a tool there is none of: said so)
    expect(call({ tool: "read", args: { id: "../files" } })).toMatchObject({ ok: false });
    expect(call({ tool: "run", args: { id: `step:${step}` } })).toEqual({ ok: false, why: 'There is no tool called "run"' });
  });

  it("works out the frame anew at each call: moved in, a thing is seen; moved out, it is not - the frame moved alone leaves the page as it was", () => {
    const { doc, store, call, step, scope } = page();
    // (the step's card moved in, as a drag moves it)
    expect(call({ tool: "read", args: { id: `step:${step}` } })).toEqual({ ok: false, why: NO_SUCH });
    store.getState().moveStep(step, 5, 0);
    expect(call({ tool: "read", args: { id: `step:${step}` } })).toMatchObject({ ok: true, value: { kind: "Energy window", by: "meno" } });
    // (the frame moved over the benzene: the benzene seen, methanol not - and nothing on the page moved)
    const before = doc.getState();
    const over: Scope = { frame: { x0: 35, y0: -5, x1: 45, y1: 5 } };
    expect(call({ tool: "read", args: { id: "structure:10" } }, over)).toMatchObject({ ok: true, value: { smiles: expect.stringMatching(/^C1=CC=CC=C1$|^c1ccccc1$/) } });
    expect(call({ tool: "read", args: { id: "structure:1" } }, over)).toEqual({ ok: false, why: NO_SUCH });
    expect(doc.getState()).toBe(before);
    expect(scope).toEqual({ frame: { x0: -2, y0: -5, x1: 20, y1: 5 } });
  });

  it("sees the whole page where it was made a conversation of the whole page - still never a text with no sheet", () => {
    const { call } = page();
    const all = (call({ tool: "list" }, { page: true }) as { value: { id: string }[] }).value.map((t) => t.id);
    expect(all).toEqual(expect.arrayContaining(["structure:1", "structure:10", "molecule:1", "text:1"]));
    expect(all.some((id) => id.startsWith("step:"))).toBe(true);
    expect(all).not.toContain("text:2");
  });

  it("cuts a long text, saying so", () => {
    const { doc, call } = page();
    doc.edit("long", (d: WorkspaceDocument) => ({ ...d, texts: d.texts!.map((t) => (t.id === 1 ? { ...t, text: "x".repeat(TEXT_MOST + 5) } : t)) }));
    // (read where it lies whole in scope: a sheet so long reaches far past the frame, its middle with it)
    expect(call({ tool: "read", args: { id: "text:1" } }, { page: true })).toMatchObject({ ok: true, value: { cut: `the first ${TEXT_MOST} of ${TEXT_MOST + 5} characters` } });
  });

  it("names things as its tools do, and reads back only those names", () => {
    expect(readSeenId("molecule:3")).toEqual({ kind: "molecule", id: 3 });
    for (const bad of ["molecule:", "molecule:-1", "file:1", "molecule:1.5", 3, null]) expect(readSeenId(bad)).toBeNull();
    const { doc, scope } = page();
    expect(inScope(doc.getState(), scope).structure).toEqual([1]);
  });
});

describe("a scripted test model", () => {
  it("plays its calls in turn on the page as it is, each answered within its frame", () => {
    const { call } = page();
    // (what a test model's script says to call, and what each answer is checked against)
    const script: { call: ToolCall; ok: boolean }[] = [
      { call: { tool: "list" }, ok: true },
      { call: { tool: "read", args: { id: "molecule:1" } }, ok: true },
      { call: { tool: "read", args: { id: "structure:10" } }, ok: false },
    ];
    expect(script.map((s) => call(s.call).ok)).toEqual(script.map((s) => s.ok));
  });
});
