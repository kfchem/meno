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
import { setChipRuns } from "./utils/chipSaid";
import { chipWide, hasChip } from "./workflow/selectionSet";
import { xyzFileText } from "./fileActions";
import { readWorkspace, workspaceText } from "./utils/workspace";

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

  it("are not joined where they are two stereoisomers, saying why in plain words", async () => {
    expect(await notOneCompound(placed, teller(true))).toBe("Not joined as conformers: the selected molecules are not all the same stereoisomer.");
    // (what each geometry is, once told, is kept: told afresh)
    forgetStereo();
    expect(await notOneCompound(placed, teller())).toBeNull();
    forgetStereo();
    const { state, add } = editor();
    const a = add({ ...(records[0] as unknown as Molecule3D), at: { x: 0, y: 0 } });
    const b = add({ ...(records[1] as unknown as Molecule3D), at: { x: 7, y: 2 } });
    expect(await state().joinAsConformers([a, b], teller(true))).toBe("Not joined as conformers: the selected molecules are not all the same stereoisomer.");
    expect(state().molecules3d).toHaveLength(2);
    // (nothing to tell stereoisomers apart)
    forgetStereo();
    expect(await state().joinAsConformers([a, b], { none: "Nothing added tells stereoisomers apart" })).toBe("Not joined as conformers: no plugin added tells which stereoisomer the selected molecules are.");
    expect(state().molecules3d).toHaveLength(2);
  });

  it("are not joined where a stereoisomer is not told, left unspecified, or they are made unlike: each said in its own plain sentence", async () => {
    // (the plugin gives an error of its own for a molecule: its words after the sentence, by its name)
    const told = "Not joined as conformers: the stereoisomer of one of the selected molecules could not be worked out.";
    const erring: Asker = { plugin: "invented", version: "1.0.0", name: "Invented Stereo", ask: async (blocks) => blocks.map(() => ({ error: "made-up failure" }) as never) };
    expect(await notOneCompound(placed, erring)).toBe(`${told} Invented Stereo: made-up failure`);
    forgetStereo();
    // (it could not be asked at all: what went wrong, by its name)
    const failing: Asker = { plugin: "invented", version: "1.0.0", name: "Invented Stereo", ask: async () => Promise.reject(new Error("made-up crash")) };
    expect(await notOneCompound(placed, failing)).toBe(`${told} Invented Stereo: made-up crash`);
    forgetStereo();
    // (it gave no answer for the molecule: no words of its own, the sentence alone)
    const silent: Asker = { plugin: "invented", version: "1.0.0", name: "Invented Stereo", ask: async () => [] };
    expect(await notOneCompound(placed, silent)).toBe(told);
    forgetStereo();
    // (an element whose configuration the geometry leaves open)
    const open: Asker = { plugin: "invented", version: "1.0.0", ask: async (blocks) => blocks.map(() => ({ elements: [{ kind: "centre", atoms: [0], specified: false }], key: "A" }) as never) };
    expect(await notOneCompound(placed, open)).toBe("Not joined as conformers: one of the selected molecules has a stereocentre or double bond left unspecified.");
    forgetStereo();
    // (made unlike: two calculations; energies from two sources; stereo labels that differ)
    const withCalc = (method: string) => placed.map((m) => ({ ...m, calc: { program: "invented", method } as never }));
    expect(await notOneCompound([withCalc("one")[0], withCalc("two")[1]], teller())).toBe("Not joined as conformers: the selected molecules come from different calculations.");
    const made = (energies: string) => ({ how: [], energies });
    expect(await notOneCompound([{ ...placed[0], made: made("made-up field A") }, { ...placed[1], made: made("made-up field B") }], teller())).toBe(
      "Not joined as conformers: the selected molecules' energies come from different sources.",
    );
    const labelled = (label: string) => ({ atoms: { 0: label } }) as never;
    expect(await notOneCompound([{ ...placed[0], stereo: labelled("R") }, { ...placed[1], stereo: labelled("S") }], teller())).toBe(
      "Not joined as conformers: the selected molecules' stereo labels differ, so they may be different stereoisomers.",
    );
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

describe("a join keeps what each molecule held of its own geometry", () => {
  /** An invented file of water in two shapes, each frame's comment line its energy and its name. */
  const file = (lines: [string, string], hx: number) => block(lines[0], hx) + block(lines[1], hx + 0.005);
  const opened = async (name: string, text: string): Promise<Omit<Molecule3D, "id">> => ({
    ...((await processFileContent(name, text)).molecules3d![0] as unknown as Molecule3D),
    at: { x: 0, y: 0 },
  });

  it("gives each frame its name and energy, shows the lowest with shares; undone each molecule is as it was; redone joined again", async () => {
    const { doc, state, add } = editor();
    const a = add(await opened("one.xyz", file(["E = -76.40 Eh one, made up", "E = -76.41 Eh two, made up"], 0.96)));
    const b = add({ ...(await opened("two.xyz", file(["E = -76.43 Eh three, made up", "E = -76.42 Eh four, made up"], 0.95))), at: { x: 7, y: 2 } });
    const before = state().molecules3d;
    expect(await state().joinAsConformers([a, b], teller())).toBeNull();
    const m = state().molecules3d[0];
    expect(state().molecules3d).toHaveLength(1);
    expect(m.frameNames).toEqual(["one, made up", "two, made up", "three, made up", "four, made up"]);
    expect(m.energies).toEqual([-76.4, -76.41, -76.43, -76.42]);
    expect(state().frames3d[a]).toBe(2);
    expect(sharesOf(m)).toHaveLength(4);
    const runs = setChipRuns({ count: 4, frame: 2, energies: m.energies, names: m.frameNames });
    expect(runs.map((r) => r.text).join("")).toBe("3 / 4three, made up · 0.00 kcal/mol");
    doc.undo();
    expect(state().molecules3d).toEqual(before);
    doc.redo();
    expect(state().molecules3d[0].frameNames).toEqual(["one, made up", "two, made up", "three, made up", "four, made up"]);
    expect(state().molecules3d[0].energies).toEqual([-76.4, -76.41, -76.43, -76.42]);
  });

  it("keeps a frame with no energy as none: no lowest, the first shown, no shares, saying which", async () => {
    const { state, add } = editor();
    const a = add(await opened("one.xyz", file(["E = -76.40 Eh one, made up", "E = -76.41 Eh two, made up"], 0.96)));
    const b = add(await opened("two.xyz", file(["E = -76.43 Eh three, made up", "four, no energy"], 0.95)));
    expect(await state().joinAsConformers([a, b], teller())).toBeNull();
    const m = state().molecules3d[0];
    expect(m.frameNames).toEqual(["one, made up", "two, made up", "three, made up", "four, no energy"]);
    expect(m.energies!.slice(0, 3)).toEqual([-76.4, -76.41, -76.43]);
    expect(m.energies![3]).toBeNaN();
    expect(state().frames3d[a] ?? 0).toBe(0);
    expect(sharesOf(m)).toBeUndefined();
    expect(sharesWithheld(m)).toBe("#4 has no energy, so no shares are given");
  });

  it("reads a one-frame file's comment line by the same rule, kept with the molecule; it shows no chip and is drawn as before", async () => {
    const one = await opened("w1.xyz", block("E = -76.42 Eh shape one, made up", 0.96));
    expect(one.frameNames).toEqual(["shape one, made up"]);
    expect(one.energies).toEqual([-76.42]);
    expect(one.title).toBeUndefined();
    expect(hasChip(one as Molecule3D)).toBe(false);
    expect(chipWide(one as Molecule3D)).toBe(0);
    // (all else as the same geometry with a comment line that gives nothing)
    const { frameNames: _n, energies: _e, ...rest } = one;
    expect(rest).toEqual(await opened("w1.xyz", block("", 0.96)));
  });

  it("joins two one-frame files into frames with their names and energies, the lowest shown, shares given; undone, two molecules without chips, each holding what it read", async () => {
    const { doc, state, add } = editor();
    const a = add(await opened("w1.xyz", block("E = -76.42 Eh shape one, made up", 0.96)));
    const b = add({ ...(await opened("w2.xyz", block("E = -76.40 Eh shape two, made up", 0.95))), at: { x: 7, y: 2 } });
    const before = state().molecules3d;
    expect(await state().joinAsConformers([a, b], teller())).toBeNull();
    const m = state().molecules3d[0];
    expect(m.frameNames).toEqual(["shape one, made up", "shape two, made up"]);
    expect(m.energies).toEqual([-76.42, -76.4]);
    expect(state().frames3d[a] ?? 0).toBe(0);
    const shares = sharesOf(m)!;
    expect(shares).toHaveLength(2);
    const runs = setChipRuns({ count: 2, frame: 0, energies: m.energies, names: m.frameNames, populations: shares });
    expect(runs.map((r) => r.text).join("")).toBe(`1 / 2shape one, made up · 0.00 kcal/mol${runs[runs.length - 1].text}`);
    expect(runs[runs.length - 1].text).toBe(" · >99%");
    doc.undo();
    expect(state().molecules3d).toEqual(before);
    for (const x of state().molecules3d) expect(hasChip(x)).toBe(false);
    expect(state().molecules3d.map((x) => [x.frameNames, x.energies])).toEqual([
      [["shape one, made up"], [-76.42]],
      [["shape two, made up"], [-76.4]],
    ]);
    doc.redo();
    expect(state().molecules3d[0].frameNames).toEqual(["shape one, made up", "shape two, made up"]);
  });

  it("writes a one-frame molecule's comment line back to XYZ as a longer file's frame, and reads it again", async () => {
    const one = await opened("w1.xyz", block("E = -76.42 Eh shape one, made up", 0.96));
    const text = xyzFileText([one as never], "t", { frames: "all" });
    expect(text.split("\n")[1]).toBe("E = -76.4200000000 Eh shape one, made up");
    const back = await opened("back.xyz", text);
    expect(back.frameNames).toEqual(["shape one, made up"]);
    expect(back.energies).toEqual([-76.42]);
  });

  it("is saved to a workspace and read back: one molecule, its frames, their names and energies, marked as conformers", async () => {
    const { state, add } = editor();
    const a = add(await opened("one.xyz", file(["E = -76.40 Eh one, made up", "E = -76.41 Eh two, made up"], 0.96)));
    const b = add(await opened("two.xyz", file(["E = -76.43 Eh three, made up", "four, no energy"], 0.95)));
    expect(await state().joinAsConformers([a, b], teller())).toBeNull();
    const m = state().molecules3d[0];
    const text = workspaceText({ model: { atoms: [], bonds: [] } as never, arrows: [], pluses: [], captions: [], molecules3d: [m], turns3d: {}, frames3d: {}, lists3d: {}, aromaticEnabled: false, aromaticRings: {} });
    const back = readWorkspace(text)!.drawn.molecules3d!;
    expect(back).toHaveLength(1);
    expect(back[0].frames).toHaveLength(3);
    expect(back[0].frameNames).toEqual(["one, made up", "two, made up", "three, made up", "four, no energy"]);
    expect(back[0].energies!.slice(0, 3)).toEqual([-76.4, -76.41, -76.43]);
    expect(back[0].energies![3]).toBeNaN();
    expect(back[0].conformerSet).toBe(true);
  });
});
