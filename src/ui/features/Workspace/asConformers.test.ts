import { afterEach, describe, expect, it } from "vitest";
import { forgetStereo, type Asker } from "./workflow/configurations";
import { connectStoreToDocument, createEditorStore } from "./store";
import * as ops from "./document";
import { createWorkspaceDocument } from "./document";
import { readStructures } from "../../../lib/io/structures";
import { conformersOffered, framesAlike, joinable, joined, joinOffered, lowestFrame, notOneCompound } from "./utils/asConformers";
import { sharesOf, sharesWithheld } from "./utils/molecule3d";
import { processFileContent } from "./utils/io";
import type { Molecule3D } from "./store/types";

/** Invented water, three frames: each with both O-H joins, the third's energy the lowest. */
const block = (comment: string, x: number) => `3\n${comment}\nO 0 0 0\nH ${x} 0 0\nH -0.24 0.93 0\n`;
const alike = block("E = -76.40 Eh a", 0.96) + block("E = -76.41 Eh b", 0.97) + block("E = -76.42 Eh c", 0.95);
/** The same, its second frame's hydrogen gone 3 Å away: a join broken - a path, not conformers. */
const broken = block("a", 0.96) + block("b", 3.5) + block("c", 0.95);

const fromFile = (text: string): Omit<Molecule3D, "id"> => ({ ...(readStructures("xyz", "made-up.xyz", text).molecules3d![0] as unknown as Molecule3D), at: { x: 0, y: 0 } });

/** An SD record of water, invented: its title, its energy. */
const record = (title: string, energy: number, hx = 0.96) =>
  `${title}\n  Invented01012612003D\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n    ${hx.toFixed(4)}    0.0000    0.1000 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.2400    0.9300   -0.1000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\n  1  3  1  0  0  0  0\nM  END\n> <Energy (Eh)>\n${energy}\n\n$$$$\n`;
/** The same as a hydroxide: another compound. */
const hydroxide = `hydroxide, made up\n  Invented01012612003D\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n    0.9600    0.0000    0.1000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\nM  CHG  1   1  -1\nM  END\n$$$$\n`;

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const state = () => store.getState();
  const add = (m: Omit<Molecule3D, "id">) => {
    doc.edit("add", (d) => ops.addMolecule3d(d, m));
    return state().molecules3d[state().molecules3d.length - 1].id;
  };
  return { doc, state, add };
}

describe("frames taken as conformers, on purpose", () => {
  it("is offered where every frame has the same atoms and joins; not for a broken join, differing elements, or one frame", () => {
    expect(conformersOffered(fromFile(alike))).toBe(true);
    expect(framesAlike(fromFile(broken))).toBe(false);
    const swapped = "3\nx\nO 0 0 0\nH 0.96 0 0\nH -0.24 0.93 0\n3\ny\nH 0 0 0\nO 0.96 0 0\nH -0.24 0.93 0\n";
    expect(conformersOffered(fromFile(swapped))).toBe(false);
    expect(conformersOffered(fromFile(block("one", 0.96)))).toBe(false);
  });

  it("marks the molecule a conformer set, shows its lowest, and is undone", () => {
    const { doc, state, add } = editor();
    const id = add(fromFile(alike));
    expect(state().molecules3d[0].conformerSet).toBeUndefined();
    state().setFramesConformers(id, true);
    expect(state().molecules3d[0].conformerSet).toBe(true);
    expect(state().frames3d[id]).toBe(2);
    // (a conformer set with every energy: shares)
    expect(sharesOf(state().molecules3d[0])).toHaveLength(3);
    doc.undo();
    expect(state().molecules3d[0].conformerSet).toBeUndefined();
    doc.redo();
    expect(state().molecules3d[0].conformerSet).toBe(true);
    // (undone, the frame it showed before the mark - the first - is shown again; redone, the lowest)
    doc.undo();
    expect(state().frames3d[id] ?? 0).toBe(0);
    doc.redo();
    expect(state().frames3d[id]).toBe(2);
    // (chosen again: the mark taken off)
    state().setFramesConformers(id, false);
    expect(state().molecules3d[0].conformerSet).toBeUndefined();
  });

  it("marks a file's frames, one with no energy, as opened: no lowest, the frame shown stays, no shares, saying why", async () => {
    const text = block("E = -76.40 Eh a", 0.96) + block("b, no energy", 0.97) + block("E = -76.42 Eh c", 0.95);
    const opened = (await processFileContent("three.xyz", text)).molecules3d![0];
    const { state, add } = editor();
    const id = add({ ...(opened as unknown as Molecule3D), at: { x: 0, y: 0 } });
    expect(conformersOffered(state().molecules3d[0])).toBe(true);
    state().setFramesConformers(id, true);
    const m = state().molecules3d[0];
    expect(m.conformerSet).toBe(true);
    expect(state().frames3d[id] ?? 0).toBe(0);
    expect(sharesOf(m)).toBeUndefined();
    expect(sharesWithheld(m)).toBe("#2 has no energy, so no shares are given");
  });

  it("finds no lowest where a frame has no energy", () => {
    expect(lowestFrame({ frames: [[], []], energies: [-1, NaN, -2] })).toBeNull();
    expect(lowestFrame({ frames: [[], []], energies: [-1, -3, -2] })).toBe(1);
  });
});

/** An invented plugin that tells stereoisomers apart: every geometry one stereoisomer, or - `apart` - the one whose hydrogen stands at 0.97 another. */
const teller = (apart = false): Asker => ({ plugin: "invented", version: "1.0.0", ask: async (blocks) => blocks.map((b) => ({ elements: [], key: apart && b.includes("0.9700") ? "B" : "A" })) });

afterEach(() => forgetStereo());

describe("molecules joined as conformers", () => {
  const records = readStructures("sdf", "two.sdf", record("alpha, made up", -76.1) + record("beta, made up", -76.3, 0.97)).molecules3d!;
  const placed = records.map((m, i) => ({ ...(m as never as Molecule3D), id: i + 1, at: { x: 0, y: 0 } }));

  it("are one compound by the same-constitution check; not where they differ", () => {
    expect(joinable(placed)).toBe(true);
    const other = { ...(readStructures("sdf", "oh.sdf", hydroxide).molecules3d![0] as never as Molecule3D), id: 3, at: { x: 0, y: 0 } };
    expect(joinable([placed[0], other])).toBe(false);
    expect(joinable([placed[0]])).toBe(false);
  });

  it("make one set: each record a frame, its title the frame's name, its energy kept", () => {
    const one = joined(placed);
    expect(one.conformerSet).toBe(true);
    expect(one.frames).toHaveLength(1);
    expect(one.frames![0][3]).toBeCloseTo(0.97, 6);
    expect(one.energies).toEqual([-76.1, -76.3]);
    expect(one.frameNames).toEqual(["alpha, made up", "beta, made up"]);
    expect(one.title).toBeUndefined();
  });

  it("are not joined where they are two stereoisomers, saying what As conformers says of them", async () => {
    expect(await notOneCompound(placed, teller(true))).toBe("2 compounds · 2");
    // (what each geometry is, once told, is kept: told afresh)
    forgetStereo();
    expect(await notOneCompound(placed, teller())).toBeNull();
    forgetStereo();
    const { state, add } = editor();
    const a = add({ ...(records[0] as unknown as Molecule3D), at: { x: 0, y: 0 } });
    const b = add({ ...(records[1] as unknown as Molecule3D), at: { x: 7, y: 2 } });
    expect(await state().joinAsConformers([a, b], teller(true))).toBe("2 compounds · 2");
    expect(state().molecules3d).toHaveLength(2);
    // (nothing to tell stereoisomers apart: the words As conformers says)
    forgetStereo();
    expect(await state().joinAsConformers([a, b], { none: "Nothing added tells stereoisomers apart" })).toBe("Which stereoisomer entry 1 is is not known: Nothing added tells stereoisomers apart");
    expect(state().molecules3d).toHaveLength(2);
  });

  it("is one step: the lowest shown, and undone they are as they were, at their places", async () => {
    const { doc, state, add } = editor();
    const a = add({ ...(records[0] as unknown as Molecule3D), at: { x: 0, y: 0 } });
    const b = add({ ...(records[1] as unknown as Molecule3D), at: { x: 7, y: 2 } });
    const before = state().molecules3d;
    expect(await state().joinAsConformers([a, b], teller())).toBeNull();
    expect(state().molecules3d).toHaveLength(1);
    expect(state().molecules3d[0].id).toBe(a);
    expect(state().molecules3d[0].at).toEqual({ x: 0, y: 0 });
    expect(state().frames3d[a]).toBe(1);
    doc.undo();
    expect(state().molecules3d).toEqual(before);
  });

  it("undone, each molecule shows again the frame it showed; redone, the joined one its lowest", async () => {
    const { doc, state, add } = editor();
    const a = add({ ...(records[0] as unknown as Molecule3D), at: { x: 0, y: 0 } });
    const b = add({ ...(records[1] as unknown as Molecule3D), at: { x: 7, y: 2 } });
    expect(await state().joinAsConformers([a, b], teller())).toBeNull();
    expect(state().frames3d[a]).toBe(1);
    doc.undo();
    expect(state().frames3d[a] ?? 0).toBe(0);
    expect(state().frames3d[b] ?? 0).toBe(0);
    doc.redo();
    expect(state().frames3d[a]).toBe(1);
  });

  it("is offered with two such molecules selected: on either, or on the page beside them; not on a molecule outside the selection", () => {
    const { state, add } = editor();
    const a = add({ ...(records[0] as unknown as Molecule3D), at: { x: 0, y: 0 } });
    const b = add({ ...(records[1] as unknown as Molecule3D), at: { x: 7, y: 2 } });
    state().selectAll();
    const sel = state().sel3d;
    const ms = state().molecules3d;
    expect(joinOffered(ms, sel, { kind: "molecule3d", id: b, selection: "here" })).toEqual([a, b]);
    expect(joinOffered(ms, sel, { kind: "molecule3d", id: a, selection: "here" })).toEqual([a, b]);
    expect(joinOffered(ms, sel, { kind: null, id: null, selection: "here" })).toEqual([a, b]);
    expect(joinOffered(ms, new Set([a]), { kind: null, id: null, selection: "here" })).toEqual([]);
    expect(joinOffered(ms, sel, { kind: "molecule3d", id: 99, selection: "here" })).toEqual([]);
    expect(joinOffered(ms, sel, { kind: null, id: null, selection: "none" })).toEqual([]);
  });
});
