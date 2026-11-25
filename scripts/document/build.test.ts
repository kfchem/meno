import { describe, expect, it } from "vitest";
import { holdOutputsOf } from "../../src/lib/calc/asks";
import { readMenoFile } from "../../src/lib/doc/menoFile";
import { createWorkspaceDocument } from "../../src/ui/features/Workspace/document";
import { connectStoreToDocument, createEditorStore } from "../../src/ui/features/Workspace/store";
import { keptNamedIn, readKept, readWorkspace } from "../../src/ui/features/Workspace/utils/workspace";
import { drawnOf } from "../../src/ui/features/Workspace/fileActions";
import { centredAt, partToCopy, readRecord, recordText } from "../../src/ui/features/Workspace/utils/copyPaste";
import { tiedCaptionOf } from "../../src/ui/features/Workspace/utils/tiedCaptions";
import { drawnSheetBox, sheetNameRoom } from "../../src/ui/features/Workspace/utils/textSheets";
import type { Box } from "../../src/ui/features/Workspace/utils/extent";
import { chain, mol, reaction } from "../figure/draw/fixtures";
import { buildDocument, DocumentError } from "./build";

// A report of invented parts: two Markdown texts, three structures (a MOL file, the second record of an SD file, one
// kept as drawn) and an XYZ file of three conformers of water, each with its energy as Meno writes it.
const WATER = (h1: [number, number, number], e: number, order = ["O", "H", "H"]) =>
  ["3", `water E = ${e.toFixed(6)} Eh`, `${order[0]} 0.0 0.0 0.0`, `${order[1]} ${h1.join(" ")}`, `${order[2]} -0.24 0.93 0.0`].join("\n");
const FILES: Record<string, string> = {
  "intro.md": "# Aim\n\nThree chains and a water.\n",
  "notes.md": "## Notes\n\n- the energies are in hartrees\n",
  "propane.mol": chain("propane", 3),
  "set.sdf": `${chain("butane", 4)}$$$$\n${chain("pentane", 5)}$$$$\n`,
  "kept.mol": mol("kept", [["C", 0, 0], ["C", 1.5, 0], ["C", 1.5, 1.5], ["C", 0, 1.5]], [[1, 2], [2, 3], [3, 4]]),
  "water.xyz": [WATER([0.96, 0, 0], -76.4), WATER([0.97, 0, 0], -76.399), WATER([0.95, 0.02, 0], -76.398)].join("\n") + "\n",
  "scheme.rxn": reaction(),
  "tall.mol": mol("tall", [["C", 0, 0], ["C", 0, 1.5], ["C", 0, 3], ["C", 0, 4.5]], [[1, 2], [2, 3], [3, 4]]),
  "decane.mol": chain("decane", 10),
  "mixed.xyz": [WATER([0.96, 0, 0], -76.4), WATER([0.97, 0, 0], -76.399, ["H", "O", "H"])].join("\n") + "\n",
};
const read = (p: string) => {
  if (!(p in FILES)) throw new Error("no such file");
  return FILES[p];
};
const MANIFEST = {
  title: "Three chains and a water",
  entries: [
    { text: "intro.md", name: "Aim" },
    { structure: "propane.mol", id: "1" },
    { structure: "set.sdf", record: 2, id: "2" },
    { structure: "kept.mol", id: "3", keepLayout: true },
    { break: true },
    { molecule3d: "water.xyz", name: "water conformers", conformers: true },
    { text: "notes.md" },
  ],
};

/** The workspace built, read back from its bytes as Open reads it, and loaded into a page of its own. */
async function builtAndOpened(manifest: unknown) {
  const built = await buildDocument(manifest, read);
  const file = readMenoFile(built.bytes, keptNamedIn);
  holdOutputsOf(file);
  const { ws } = await readKept(readWorkspace(file.workspace)!);
  const held = createWorkspaceDocument();
  const store = createEditorStore(held);
  connectStoreToDocument(store, held);
  store.getState().openWorkspace(ws, true);
  return { built, file, st: store.getState(), doc: held.getState(), state: () => store.getState() };
}

describe("a workspace built from a manifest", () => {
  it("holds the title, the texts, the structures with their names and the conformers with their energies, numbered as the app numbers them", async () => {
    const { file, st, doc } = await builtAndOpened(MANIFEST);
    // (the two texts kept in the file, as Save keeps them)
    expect(file.files.filter((f) => f.media === "text/plain")).toHaveLength(2);
    expect(st.texts.map((t) => [t.name, t.text])).toEqual([
      ["Aim", FILES["intro.md"]],
      ["notes.md", FILES["notes.md"]],
    ]);
    expect(st.texts.every((t) => t.at)).toBe(true);
    // (both Markdown, as their files are: "Aim", from intro.md, too)
    expect(st.texts.map((t) => [t.name, t.markdown])).toEqual([
      ["Aim", true],
      ["notes.md", true],
    ]);
    // (3 + 5 + 4 carbons, drawn; 2 + 4 + 3 bonds)
    expect(st.model.atoms).toHaveLength(12);
    expect(st.model.bonds).toHaveLength(9);
    expect(st.captions.map((c) => c.text)).toEqual(["Three chains and a water", "1", "2", "3"]);
    expect(st.molecules3d).toHaveLength(1);
    const [w] = st.molecules3d;
    expect(w).toMatchObject({ name: "water conformers", conformerSet: true, energies: [-76.4, -76.399, -76.398] });
    expect(w.frames).toHaveLength(2);
    // (ids: atoms and bonds from one counter, each once; every counter past the last it handed out)
    const ids = [...st.model.atoms.map((a) => a.id), ...st.model.bonds.map((b) => b.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.nextId).toBeGreaterThan(Math.max(...ids));
    expect(doc.nextTextId).toBe(3);
    expect(doc.nextCaptionId).toBe(5);
    expect(doc.nextMolecule3dId).toBe(2);
  });

  it("puts the entries down in reading order, a row at a time, none over another and all under the title", async () => {
    const { built } = await buildDocument(MANIFEST, read).then((b) => ({ built: b }));
    const { boxes, title } = built;
    expect(boxes).toHaveLength(6);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `entries ${i + 1} and ${j + 1} overlap`).toBe(true);
      }
    expect(boxes.every((b) => b.y1 < title.y0)).toBe(true);
    // (the first row: the text, then the three structures, left to right, their tops level)
    for (let i = 1; i < 4; i++) {
      expect(boxes[i].x0).toBeGreaterThan(boxes[i - 1].x1);
      expect(boxes[i].y1).toBeCloseTo(boxes[0].y1);
    }
    // (after the break, the next row: at the left, under the lowest of the first)
    expect(boxes[4].x0).toBeCloseTo(0);
    expect(boxes[4].y1).toBeLessThan(Math.min(...boxes.slice(0, 4).map((b) => b.y0)));
    expect(boxes[5].x0).toBeGreaterThan(boxes[4].x1);
  });

  it("sets the names of a row's structures on one line, under its tallest, each under its own; the next row under them", async () => {
    const manifest = {
      title: "t",
      entries: [
        { structure: "propane.mol", id: "1" },
        { structure: "tall.mol", id: "2", keepLayout: true },
        { structure: "kept.mol", id: "3", keepLayout: true },
        { break: true },
        { text: "notes.md" },
      ],
    };
    const { built, st } = await builtAndOpened(manifest);
    const names = st.captions.filter((c) => c.text !== "t");
    expect(names.map((c) => c.text)).toEqual(["1", "2", "3"]);
    // (one line: the three names' y equal, under the lowest atom of the row - the tall one's)
    expect(names[1].y).toBeCloseTo(names[0].y, 9);
    expect(names[2].y).toBeCloseTo(names[0].y, 9);
    const lowest = Math.min(...st.model.atoms.map((a) => a.y));
    expect(names[0].y).toBeLessThan(lowest);
    // (each centred under its own: the tall chain's name at its atoms' x)
    const tall = st.model.atoms.slice(3, 7);
    expect(names[1].x).toBeCloseTo(tall.reduce((s, a) => s + a.x, 0) / 4, 6);
    // (the next row starts under the names)
    expect(built.boxes[3].y1).toBeLessThan(names[0].y);
    expect(built.boxes[3].y1).toBeLessThan(Math.min(...built.boxes.slice(0, 3).map((b) => b.y0)));
  });

  it("keeps a layout it is told to keep, and lays the others out", async () => {
    const { st } = await builtAndOpened({ title: "t", entries: [{ structure: "kept.mol", keepLayout: true }] });
    // (the U as drawn: its first and last carbons as far apart as its first two, a bond's length)
    const [a, b, , d] = st.model.atoms;
    expect(Math.hypot(a.x - d.x, a.y - d.y)).toBeCloseTo(Math.hypot(a.x - b.x, a.y - b.y), 5);
  });

  it("draws a reaction's file as it is, its arrow and its \"+\" sign with it", async () => {
    const { st } = await builtAndOpened({ title: "t", entries: [{ structure: "scheme.rxn", id: "scheme 1" }] });
    // (3 + 4 + 5 carbons; one arrow, one "+" between the two reactants)
    expect(st.model.atoms).toHaveLength(12);
    expect(st.arrows).toHaveLength(1);
    expect(st.pluses).toHaveLength(1);
    expect(st.captions.map((c) => c.text)).toEqual(["t", "scheme 1"]);
  });

  it("refuses a wrong manifest with a sentence naming the entry", async () => {
    const wrong = (entries: unknown[], extra: object = {}) => buildDocument({ title: "t", entries, ...extra }, read);
    await expect(wrong([{ text: "intro.md" }, { structure: "absent.mol" }])).rejects.toThrow(new DocumentError(`Entry 2 (absent.mol): the file "absent.mol" cannot be read (is it missing?).`));
    await expect(wrong([{ structure: "propane.mol", caption: "1" }])).rejects.toThrow(`Entry 1 (propane.mol): unknown key "caption"`);
    await expect(wrong([{ molecule3d: "mixed.xyz", conformers: true }])).rejects.toThrow(
      "Entry 1 (mixed.xyz): frame 2 has other atoms than frame 1, so the frames are not conformers of one molecule.",
    );
    await expect(wrong([{ text: "intro.md" }], { colour: "red" })).rejects.toThrow(`The manifest: unknown key "colour"`);
    await expect(buildDocument({ entries: [{ text: "intro.md" }] }, read)).rejects.toThrow(`The manifest needs a "title".`);
  });
});

describe("a built workspace's names", () => {
  it("belong to their structures, as \"Add text\" ties them: moved with them, copied with them, freed as any", async () => {
    const { st, state } = await builtAndOpened(MANIFEST);
    for (const name of ["1", "2", "3"]) {
      const words = st.captions.find((c) => c.text === name)!;
      expect(words.of && "atom" in words.of).toBe(true);
      // (asked from every atom of its structure - and of no other - whose words these are)
      const own = st.model.atoms.filter((a) => tiedCaptionOf(st, { atom: a.id })?.id === words.id);
      expect(own.map((a) => a.id)).toContain((words.of as { atom: number }).atom);
      expect(own.length).toBeGreaterThan(2);
    }
    // (the title is no structure's)
    expect(st.captions.find((c) => c.text === MANIFEST.title)!.of).toBeUndefined();
    // moved as a drag moves it: its name by as much
    const one = st.captions.find((c) => c.text === "1")!;
    const atoms = st.model.atoms.filter((a) => tiedCaptionOf(st, { atom: a.id })?.id === one.id);
    state().moveAtoms(atoms.map((a) => ({ id: a.id, x: a.x + 4, y: a.y - 3 })), "drag");
    const moved = state().captions.find((c) => c.id === one.id)!;
    expect(moved.x - one.x).toBeCloseTo(4, 12);
    expect(moved.y - one.y).toBeCloseTo(-3, 12);
    // copied (right-click, nothing selected) and pasted: the copy has its own "1"
    const part = partToCopy(drawnOf(state()), { atoms: new Set(), bonds: new Set() }, atoms[0].id)!;
    state().pasteModel(centredAt(readRecord(recordText(part))!, { x: 300, y: 0 }));
    const ones = state().captions.filter((c) => c.text === "1");
    expect(ones).toHaveLength(2);
    const copy = ones.find((c) => c.id !== one.id)!;
    expect(copy.of && "atom" in copy.of && !atoms.some((a) => a.id === (copy.of as { atom: number }).atom)).toBe(true);
    // freed: the structure moves without it
    state().freeCaption(one.id);
    state().moveAtoms(atoms.map((a) => ({ id: a.id, x: a.x + 10, y: a.y })), "drag");
    expect(state().captions.find((c) => c.id === one.id)).toMatchObject({ x: moved.x, y: moved.y });
  });

  const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  // (a tall chain kept as drawn, a wide one, two sheets and a molecule in 3D under one of them)
  const MADE_UP = {
    title: "Tall, wide and in 3D",
    width: 40,
    entries: [
      { text: "intro.md", name: "Aim" },
      { structure: "tall.mol", id: "4", keepLayout: true },
      { structure: "decane.mol", id: "5" },
      { molecule3d: "water.xyz", name: "water", conformers: true },
      { text: "notes.md" },
      { structure: "propane.mol", id: "6" },
    ],
  };
  it.each([["the example", MANIFEST], ["a tall, a wide and a 3D entry", MADE_UP]])("puts nothing on another entry's name, caption or chip: %s", async (_, manifest) => {
    const { built, st } = await builtAndOpened(manifest);
    const boxes = built.boxes;
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    // (each sheet's name, as the page draws it seen whole on the least canvas, 640 by 480 pixels - and further
    //  out, a canvas a tenth smaller - in its own box and on none other)
    const all = [built.title, ...boxes];
    const w = Math.max(...all.map((b) => b.x1)) - Math.min(...all.map((b) => b.x0));
    const h = Math.max(...all.map((b) => b.y1)) - Math.min(...all.map((b) => b.y0));
    const px = Math.max(w / 640, h / 480);
    for (const t of st.texts.filter((t) => t.at)) {
      const name = sheetNameRoom(drawnSheetBox(t)!, px);
      const own = boxes.filter((b) => b.x0 <= name.x0 + 1e-9 && b.y1 >= name.y1 - 1e-9 && b.y0 <= name.y0 + 1e-9 && b.x1 >= name.x1 - 1e-9);
      expect(own).toHaveLength(1);
      for (const b of boxes.filter((b) => b !== own[0])) expect(overlap(sheetNameRoom(drawnSheetBox(t)!, px * 1.1), b)).toBe(false);
    }
    // (every structure's name in the box of its own structure)
    for (const c of st.captions.filter((c) => c.of)) {
      const at = boxes.filter((b) => b.x0 <= c.x && c.x <= b.x1 && b.y0 <= c.y && c.y <= b.y1);
      expect(at).toHaveLength(1);
    }
  });
});
