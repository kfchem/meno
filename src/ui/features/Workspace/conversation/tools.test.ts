import { describe, expect, it } from "vitest";
import { pdfBounds } from "../../../../lib/pdf/layout";
import { addMolecule3d, createWorkspaceDocument, type WorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Frame } from "../workflow/entries";
import { CARD_H, CARD_W } from "../workflow/look";
import { CARD } from "../pageGl/conversationCard";
import { pagePx } from "../pageGl/units";
import { sheetMiddle } from "../utils/textSheets";
import { inScope, readSeenId, SEEN_KINDS, type Scope, type SeenKind } from "./scope";
import { ATOMS_MOST, callTool, LIST_MOST, NO_SUCH, TEXT_MOST, type ToolCall } from "./tools";

const WATER = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0, y: 0.76, z: 0.59 },
    { el: "H", x: 0, y: -0.76, z: 0.59 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
};

/** A frame given the card's room at its right: the frame as it was is what the conversation sees. */
const withCard = (f: Frame): Frame => ({ ...f, x1: f.x1 + pagePx(CARD.w) + pagePx(CARD.pad) });

/** A frame about a point, `r` each way, its card to the right of it. */
const about = (p: { x: number; y: number }, r = 0.5): Frame => withCard({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r });

/**
 * A page of each kind of thing, each well apart: methanol drawn at the
 * left, a water in 3D and a text sheet beside it, and a step's log - a
 * text with no sheet; further right a picture, a PDF, an arrow with its
 * words, words alone, a plus, a set and a step's card; and far to the
 * right, a benzene drawn.
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
        ...[0, 1, 2, 3, 4, 5].map((k) => ({ id: 10 + k, el: "C", x: 400 + Math.cos((k * Math.PI) / 3), y: Math.sin((k * Math.PI) / 3), r: 0.3 })),
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
      ...WATER,
      at: { x: 4, y: 0 },
      energies: [-76.4],
      calc: { readers: ["meno"], program: "PySCF", method: "B3LYP", basis: "def2-SVP", solvation: "none", charge: 0, multiplicity: 1 },
    } as Parameters<typeof addMolecule3d>[1]),
  );
  doc.edit(
    "things",
    (d) =>
      ({
        ...d,
        texts: [
          { id: 1, name: "notes.txt", text: "Protect the alcohol first.", at: { x: 6, y: 2 } },
          // (a step's log: no sheet - and one that had a place once, still none of the page's)
          { id: 2, name: "Optimise 1.log", text: "a whole log", of: { step: 99 } },
          { id: 3, name: "Energy 2.log", text: "another log", at: { x: 6, y: 2 }, of: { step: 98 } },
        ],
        nextTextId: 4,
        pictures: [{ id: 1, name: "scheme.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 50, y: 0, w: 2, h: 2 }],
        pdfs: [{ id: 1, name: "paper.pdf", sha256: "b".repeat(64), pages: [[612, 792]], x: 100, y: 0, page: 0 }],
        arrows: [
          { id: 1, x: 150, y: 0, angle: 0, length: 3 },
          { id: 2, x: 160, y: 0, angle: 0, length: 3 },
        ],
        captions: [
          { id: 1, x: 150, y: 1, text: "NaH, THF", arrow: 1 },
          { id: 2, x: 160, y: 1, text: "the other arrow's", arrow: 2 },
          { id: 3, x: 170, y: 0, text: "Scheme 1" },
        ],
        pluses: [{ id: 1, x: 180, y: 0 }],
        sets: [{ id: 50, x0: 200, y0: -10, x1: 260, y1: 10, name: "Conformers" }],
        nextWorkflowId: 60,
      }) as WorkspaceDocument,
  );
  const step = store.getState().addStep("energy-window", "meno", 300, 0);
  // (where the step's card ended up - placed clear of others)
  const card = doc.getState().steps!.find((s) => s.id === step)!;
  const scope: Scope = { frame: withCard({ x0: -2, y0: -5, x1: 20, y1: 5 }) };
  return { doc, store, step, card, scope, call: (c: ToolCall, s: Scope = scope) => callTool(doc.getState(), s, c) };
}

type Things = { things: { id: string; line: string }[]; more?: number };
const listOf = (a: ReturnType<typeof callTool>) => (a as { ok: true; value: Things }).value;

describe("what a conversation sees: what lies inside its frame", () => {
  it("lists what lies inside, by kind - nothing outside it, and never a text with no sheet of its own", () => {
    const { call } = page();
    const { things, more } = listOf(call({ tool: "list" }));
    expect(more).toBeUndefined();
    expect(things.map((t) => t.id)).toEqual(["structure:1", "molecule:1", "text:1"]);
    expect(things[0].line).toBe("a structure drawn: CO");
    expect(things[1].line).toBe("a molecule in 3D: H2O · B3LYP/def2-SVP · gas phase");
    expect(things[2].line).toBe("a text: notes.txt");
  });

  it("takes each kind in where its middle is inside the frame, and leaves it out where it is not - never by a corner", () => {
    const { doc, card } = page();
    const d = doc.getState();
    const pdf = pdfBounds(d.pdfs![0]);
    const set = d.sets![0];
    const stepMiddle = { x: card.x + CARD_W / 2, y: card.y - CARD_H / 2 };
    const cases: { kind: SeenKind; id: number; middle: { x: number; y: number }; corner?: { x: number; y: number } }[] = [
      { kind: "structure", id: 1, middle: { x: 0.75, y: 0 } },
      { kind: "molecule", id: 1, middle: { x: 4, y: 0 } },
      { kind: "picture", id: 1, middle: { x: 50, y: 0 } },
      { kind: "text", id: 1, middle: sheetMiddle({ x: 6, y: 2 }, "Protect the alcohol first.", "notes.txt"), corner: { x: 6, y: 2 } },
      { kind: "pdf", id: 1, middle: { x: (pdf.x0 + pdf.x1) / 2, y: (pdf.y0 + pdf.y1) / 2 }, corner: { x: pdf.x0, y: pdf.y1 } },
      { kind: "arrow", id: 1, middle: { x: 150, y: 0 } },
      { kind: "caption", id: 3, middle: { x: 170, y: 0 } },
      { kind: "plus", id: 1, middle: { x: 180, y: 0 } },
      { kind: "set", id: 50, middle: { x: 230, y: 0 }, corner: { x: set.x0, y: set.y1 } },
      // (a step by its card's middle: its top left, where it is kept, outside a frame about the middle - and the other way)
      { kind: "step", id: card.id, middle: stepMiddle, corner: { x: card.x, y: card.y } },
    ];
    for (const c of cases) {
      expect(inScope(d, { frame: about(c.middle) })[c.kind], `${c.kind} by its middle`).toEqual([c.id]);
      expect(inScope(d, { frame: about({ x: c.middle.x, y: c.middle.y + 30 }) })[c.kind], `${c.kind} away`).toEqual([]);
      if (c.corner) expect(inScope(d, { frame: about(c.corner, 0.2) })[c.kind], `${c.kind} by a corner`).toEqual([]);
    }
    // (a frame about one sees that one alone: the arrow, not its words, nor the other arrow)
    const seen = (f: Frame) => SEEN_KINDS.flatMap((k) => inScope(d, { frame: f })[k].map((id) => `${k}:${id}`));
    expect(seen(about({ x: 150, y: 0 }, 2))).toEqual(["arrow:1"]);
  });

  it("never sees a text with no sheet, nor a caption that goes with an arrow alone, at any scope", () => {
    const { doc, call } = page();
    // (a text with no place on the page and no step it is of: still no sheet)
    doc.edit("placeless", (d) => ({ ...d, texts: [...d.texts!, { id: 4, name: "placeless.txt", text: "no sheet" }], nextTextId: 5 }));
    const d = doc.getState();
    for (const scope of [{ page: true as const }, { frame: about({ x: 6, y: 2 }, 50) }, { frame: about({ x: 0, y: 0 }, 1000) }, { frame: about({ x: 150, y: 1 }, 1) }]) {
      const s = inScope(d, scope);
      expect(s.text).not.toContain(2);
      expect(s.text).not.toContain(3);
      expect(s.text).not.toContain(4);
      expect(listOf(call({ tool: "list" }, scope)).things.map((t) => t.id)).not.toContain("text:4");
      expect(call({ tool: "read", args: { id: "text:4" } }, scope)).toEqual({ ok: false, why: NO_SUCH });
      expect(s.caption).not.toContain(1);
      expect(s.caption).not.toContain(2);
    }
  });

  it("reads a thing in full - and answers one outside, or one with no sheet, as one that is not there, in the same words", () => {
    const { call, step } = page();
    const water = call({ tool: "read", args: { id: "molecule:1" } });
    expect(water).toMatchObject({ ok: true, value: { formula: "H2O", frames: 1, energies: { values: [-76.4], unit: "hartree" }, calculation: { program: "PySCF", level: "B3LYP/def2-SVP · gas phase", charge: 0, multiplicity: 1 } } });
    expect(call({ tool: "read", args: { id: "structure:1" } })).toMatchObject({ ok: true, value: { smiles: "CO", bonds: [{ a: 1, b: 2, order: 1 }] } });
    expect(call({ tool: "read", args: { id: "text:1" } })).toMatchObject({ ok: true, value: { name: "notes.txt", text: "Protect the alcohol first." } });
    // (the benzene and the step, outside; the logs, nowhere; a molecule that is not there at all - all alike)
    for (const id of ["structure:10", `step:${step}`, "text:2", "text:3", "molecule:77"]) expect(call({ tool: "read", args: { id } })).toEqual({ ok: false, why: NO_SUCH });
    // (an id it cannot read, or a tool there is none of: said so, its name cut)
    expect(call({ tool: "read", args: { id: "../files" } })).toMatchObject({ ok: false });
    expect(call({ tool: "run", args: { id: `step:${step}` } })).toEqual({ ok: false, why: 'There is no tool called "run"' });
    expect((call({ tool: "x".repeat(500) }) as { why: string }).why.length).toBeLessThan(80);
  });

  it("gives an arrow's own words alone, and of a step its options and whether it is done - never its run's line", () => {
    const { doc, call, card } = page();
    expect(call({ tool: "read", args: { id: "arrow:1" } }, { frame: about({ x: 150, y: 0 }) })).toEqual({ ok: true, value: { words: ["NaH, THF"] } });
    // (a step whose run's line holds a folder's path and a program's words: neither given)
    doc.edit("ran", (d) => ({ ...d, steps: d.steps!.map((s) => (s.id === card.id ? { ...s, options: { window: 3 }, ran: { at: 1, ok: false, said: "Could not start /Users/someone/Library/Application Support/meno/jobs/x1/pyscf", input: "" } } : s)) }));
    const read = call({ tool: "read", args: { id: `step:${card.id}` } }, { page: true });
    expect(read).toEqual({ ok: true, value: { kind: "Energy window", by: "meno", options: { window: 3 }, ran: "failed" } });
    expect(JSON.stringify(read)).not.toContain("/Users");
    expect(JSON.stringify(listOf(call({ tool: "list" }, { page: true })))).not.toContain("/Users");
  });

  it("counts a set's members in scope alone - never those its frame reaches past the conversation's", () => {
    const { doc, call } = page();
    // (two of each kind in the set: one in its middle, under the conversation's small frame, one at its far edge)
    doc.edit("in the set", (d) => {
      const drawn = { ...d.model, atoms: [...d.model.atoms, { id: 40, el: "C", x: 230.5, y: 1, r: 0.3 }, { id: 41, el: "O", x: 231.5, y: 1, r: 0.3 }, { id: 42, el: "C", x: 250, y: -6, r: 0.3 }, { id: 43, el: "N", x: 251, y: -6, r: 0.3 }], bonds: [...d.model.bonds, { id: 44, a: 40, b: 41, order: 1 as const }, { id: 45, a: 42, b: 43, order: 1 as const }] };
      const pictures = [...d.pictures!, { ...d.pictures![0], id: 2, x: 229, y: -1 }, { ...d.pictures![0], id: 3, x: 255, y: 6 }];
      return addMolecule3d(addMolecule3d({ ...d, model: drawn, nextId: 50, pictures }, { ...WATER, at: { x: 230, y: 0 } }), { ...WATER, at: { x: 258, y: 8 } });
    });
    const small: Scope = { frame: about({ x: 230, y: 0 }, 2) };
    expect(call({ tool: "read", args: { id: "set:50" } }, small)).toEqual({ ok: true, value: { name: "Conformers", inScope: { structures: 1, molecules: 1, pictures: 1 } } });
    expect(call({ tool: "read", args: { id: "set:50" } }, { page: true })).toEqual({ ok: true, value: { name: "Conformers", inScope: { structures: 2, molecules: 2, pictures: 2 } } });
  });

  it("works out the frame anew at each call: moved in, a thing is seen; moved out, it is not - the frame moved alone leaves the page as it was", () => {
    const { doc, store, call, step, scope } = page();
    // (the step's card moved in, as a drag moves it)
    expect(call({ tool: "read", args: { id: `step:${step}` } })).toEqual({ ok: false, why: NO_SUCH });
    store.getState().moveStep(step, 5, 0);
    expect(call({ tool: "read", args: { id: `step:${step}` } })).toMatchObject({ ok: true, value: { kind: "Energy window", by: "meno" } });
    // (the frame moved over the benzene: the benzene seen, methanol not - and nothing on the page moved)
    const before = doc.getState();
    const over: Scope = { frame: withCard({ x0: 395, y0: -5, x1: 405, y1: 5 }) };
    expect(call({ tool: "read", args: { id: "structure:10" } }, over)).toMatchObject({ ok: true, value: { smiles: expect.stringMatching(/^C1=CC=CC=C1$|^c1ccccc1$/) } });
    expect(call({ tool: "read", args: { id: "structure:1" } }, over)).toEqual({ ok: false, why: NO_SUCH });
    expect(doc.getState()).toBe(before);
    expect(scope).toEqual({ frame: withCard({ x0: -2, y0: -5, x1: 20, y1: 5 }) });
  });

  it("sees the whole page where it was made a conversation of the whole page - still never a text with no sheet", () => {
    const { call } = page();
    const all = listOf(call({ tool: "list" }, { page: true })).things.map((t) => t.id);
    expect(all).toEqual(expect.arrayContaining(["structure:1", "structure:10", "molecule:1", "text:1", "picture:1", "pdf:1", "arrow:1", "arrow:2", "caption:3", "plus:1", "set:50"]));
    expect(all.some((id) => id.startsWith("step:"))).toBe(true);
    for (const never of ["text:2", "text:3", "caption:1", "caption:2"]) expect(all).not.toContain(never);
  });

  it("cuts a long text, a long list and a large molecule, saying so", () => {
    const { doc, call } = page();
    doc.edit("long", (d: WorkspaceDocument) => ({ ...d, texts: d.texts!.map((t) => (t.id === 1 ? { ...t, text: "x".repeat(TEXT_MOST + 5) } : t)) }));
    // (read where it lies whole in scope: a sheet so long reaches far past the frame, its middle with it)
    expect(call({ tool: "read", args: { id: "text:1" } }, { page: true })).toMatchObject({ ok: true, value: { cut: `the first ${TEXT_MOST} of ${TEXT_MOST + 5} characters` } });
    const before = listOf(call({ tool: "list" }, { page: true })).things.length;
    // (the page's one plus given way to more than a list gives)
    doc.edit("many", (d: WorkspaceDocument) => ({ ...d, pluses: Array.from({ length: LIST_MOST + 7 }, (_, k) => ({ id: 1000 + k, x: 1000 + k, y: 0 })) }));
    const { things, more } = listOf(call({ tool: "list" }, { page: true }));
    expect(things).toHaveLength(LIST_MOST);
    expect(more).toBe(before - 1 + LIST_MOST + 7 - LIST_MOST);
    doc.edit("big", (d) => addMolecule3d(d, { atoms: Array.from({ length: ATOMS_MOST + 1 }, (_, k) => ({ el: "C", x: k, y: 0, z: 0 })), bonds: [], at: { x: 4, y: 3 } }));
    const all3d = doc.getState().molecules3d!;
    const big = all3d[all3d.length - 1].id;
    expect(call({ tool: "read", args: { id: `molecule:${big}` } })).toMatchObject({ ok: true, value: { atoms: `${ATOMS_MOST + 1} atoms, more than are given (${ATOMS_MOST})` } });
  });

  it("names things as its tools do, and reads back only those names", () => {
    expect(readSeenId("molecule:3")).toEqual({ kind: "molecule", id: 3 });
    for (const bad of ["molecule:", "molecule:-1", "file:1", "molecule:1.5", "molecule:1234567890123456", "xmolecule:1", "molecule:1 ", 3, null]) expect(readSeenId(bad)).toBeNull();
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
