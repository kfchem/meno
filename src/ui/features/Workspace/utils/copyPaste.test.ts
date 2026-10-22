import { describe, expect, it } from "vitest";
import type { Drawn, Model } from "../store/types";
import { centredAt, clipItems, drawsPicture, looksLikeSmiles, PASTE_STEP, pastePlace, partToCopy, readRecord, recordText, schemeAmong } from "./copyPaste";
import { middleOf } from "./selection";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { nextFree } from "../chem/engineLayout";
import { kindOf } from "../../../../lib/io/kinds";
import { deleteParts, emptyWorkspaceDocument } from "../document";
import { measured } from "../../../../testing/timeouts";

const atom = (id: number, x: number, y: number, el = "C") => ({ id, x, y, r: 0.9, el });

// a propanol - its O charged, and a wedge - and apart from it a methane
const model: Model = {
  atoms: [atom(1, 0, 0), atom(2, 1, 0), { ...atom(3, 2, 0, "O"), charge: 1 }, atom(4, 10, 0)],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1, stereo: "up" },
    { id: 12, a: 2, b: 3, order: 1 },
  ],
};
const none = { atoms: new Set<number>(), bonds: new Set<number>() };

describe("partToCopy", () => {
  it("takes the selected atoms and the bonds among them", () => {
    const part = partToCopy(model, { atoms: new Set([2, 3]), bonds: new Set() }, null)!;
    expect(part.atoms.map((a) => a.id)).toEqual([2, 3]);
    expect(part.bonds.map((b) => b.id)).toEqual([12]);
  });

  it("with nothing selected, takes the structure under the pointer, or nothing", () => {
    expect(partToCopy(model, none, 3)!.atoms.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(partToCopy(model, none, null)).toBeNull();
  });

  it("takes a large selection, and cuts it, looking at each atom a few times, not once for every other", () => {
    // (a page of a hundred chains of 28 atoms, all of it selected)
    const atoms = [];
    const bonds = [];
    for (let i = 1; i <= 2800; i++) {
      atoms.push(atom(i, i % 28, Math.floor(i / 28)));
      if (i % 28) bonds.push({ id: 100_000 + i, a: i, b: i + 1, order: 1 as const });
    }
    const seen = counted(atoms);
    const m: Model = { atoms: seen.list, bonds };
    const all = { atoms: new Set(atoms.map((a) => a.id)), bonds: new Set<number>() };
    const part = partToCopy({ ...m, arrows: [{ id: 1, x: 5, y: 1, angle: 0, length: 2 }] }, all, null)!;
    const cut = deleteParts({ ...emptyWorkspaceDocument(), model: m }, all.atoms, []);
    expect(part.atoms).toHaveLength(2800);
    expect(part.bonds).toHaveLength(2700);
    expect(part.arrows).toHaveLength(1);
    expect(cut.model.atoms).toHaveLength(0);
    // (where each atom selected was sought among them all - and each end of
    // each bond cut - it was some four million reads: 1.3 s at 28 000 atoms)
    expect(seen.reads()).toBeLessThan(20 * atoms.length);
  });
});

describe("the clipboard's items", () => {
  it("are Meno's own record, read back as it was, and a MOL file - never plain text", () => {
    const items = clipItems(model);
    expect(items.map((i) => i.flavor)).toEqual(["meno", "mol"]);
    expect(readRecord(items[0].text!)).toEqual(model);
    expect(kindOf("", items[1].text!)?.id).toBe("mol");
    expect(items[1].text).toMatch(/M {2}CHG {2}1 {3}3 {3}1/);
  });

  it("read no record that is not one", () => {
    expect(readRecord("CCO")).toBeNull();
    expect(readRecord(JSON.stringify({ format: "meno-structure", version: 99, atoms: [], bonds: [] }))).toBeNull();
    // a bond to an atom it does not have
    const bad = JSON.stringify({ format: "meno-structure", version: 1, atoms: [atom(1, 0, 0)], bonds: [{ id: 2, a: 1, b: 9, order: 1 }] });
    expect(readRecord(bad)).toBeNull();
  });

  it("read a record's stack of drawings where it reads, and only what of it does", () => {
    const stacked = (stack: unknown) => JSON.stringify({ format: "meno-structure", version: 1, atoms: [{ ...atom(1, 0, 0), stack }], bonds: [] });
    expect(readRecord(stacked({ id: 2, record: 0, title: "aspirin", shown: true, spread: false, more: 1 }))!.atoms[0].stack).toEqual({ id: 2, record: 0, title: "aspirin", shown: true });
    expect(readRecord(stacked({ id: 0, record: 0 }))!.atoms[0].stack).toBeUndefined();
    expect(readRecord(stacked({ id: 1, record: -1 }))!.atoms[0].stack).toBeUndefined();
    expect(readRecord(stacked({ id: 1, record: 1, title: 7 }))!.atoms[0].stack).toEqual({ id: 1, record: 1 });
  });
});

describe("plain text", () => {
  it("is told apart: a MOL file, a SMILES, or neither", () => {
    expect(kindOf("", clipItems(model)[1].text!)?.id).toBe("mol");
    expect(looksLikeSmiles("CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O")).toBe(true);
    expect(looksLikeSmiles(" CCO\n")).toBe(true);
    expect(looksLikeSmiles("two words")).toBe(false);
    expect(looksLikeSmiles("")).toBe(false);
    expect(kindOf("", "CCO")).toBeNull();
  });
});

describe("centredAt", () => {
  it("puts the middle of the box round a structure at a point", () => {
    const moved = centredAt(model, { x: 100, y: 50 });
    const xs = moved.atoms.map((a) => a.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(100);
    expect(moved.atoms[0].y).toBeCloseTo(50);
  });
});

describe("a reaction, copied and pasted", () => {
  // methane + methanol -> ethanol, with its arrow and plus
  const scheme: Drawn = {
    atoms: [atom(1, -4, 0), atom(2, -2, 0), atom(3, -1, 0, "O"), atom(4, 3, 0), atom(5, 4, 0), atom(6, 5, 0, "O")],
    bonds: [
      { id: 11, a: 2, b: 3, order: 1 },
      { id: 12, a: 4, b: 5, order: 1 },
      { id: 13, a: 5, b: 6, order: 1 },
    ],
    arrows: [{ id: 1, x: 1, y: 0, angle: 0, length: 2.5 }],
    pluses: [{ id: 1, x: -3, y: 0 }],
  };
  const everything = { atoms: new Set([1, 2, 3, 4, 5, 6]), bonds: new Set([11, 12, 13]) };

  it("takes the arrows and pluses among what is selected, and none with a structure alone", () => {
    const all = partToCopy(scheme, everything, null)!;
    expect(all.arrows).toEqual(scheme.arrows);
    expect(all.pluses).toEqual(scheme.pluses);
    // the product alone: neither
    const product = partToCopy(scheme, { atoms: new Set([4, 5, 6]), bonds: new Set() }, null)!;
    expect(product.arrows).toBeUndefined();
    expect(product.pluses).toBeUndefined();
    expect(partToCopy(scheme, none, 5)!.arrows).toBeUndefined();
  });

  it("goes on the clipboard as Meno's record with its arrow and plus, a MOL file and an RXN file", () => {
    const items = clipItems(partToCopy(scheme, everything, null)!);
    expect(items.map((i) => i.flavor)).toEqual(["meno", "mol", "rxn"]);
    const back = readRecord(items[0].text!)!;
    expect(back.arrows).toEqual(scheme.arrows);
    expect(back.pluses).toEqual(scheme.pluses);
    expect(items[2].text!.split("\n").slice(0, 5)).toEqual(["$RXN", "", "      Meno", "", "  2  1"]);
  });

  it("reads a record's structures though its arrows do not read", () => {
    const text = JSON.stringify({ format: "meno-structure", version: 1, atoms: [atom(1, 0, 0)], bonds: [], arrows: [{ id: 1, x: "a" }] });
    expect(readRecord(text)).toEqual({ atoms: [atom(1, 0, 0)], bonds: [], leftOut: { arrow: 1 } });
  });

  it("is centred as a whole, arrow and plus moved with it", () => {
    const moved = centredAt(scheme, { x: 0, y: 10 });
    // the box from the leftmost atom (-4) to the rightmost (5)
    expect(moved.atoms[0].x).toBeCloseTo(-4.5);
    expect(moved.arrows![0]).toMatchObject({ x: 0.5, y: 10 });
    expect(moved.pluses![0]).toMatchObject({ x: -3.5, y: 10 });
  });
});

describe("molecules in 3D on the clipboard", () => {
  const water3d = {
    atoms: [
      { el: "O", x: 1, y: 1, z: 1 },
      { el: "H", x: 1.76, y: 1.59, z: 1 },
      { el: "H", x: 0.24, y: 1.59, z: 1 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 0, a2: 2, order: 1 },
    ],
    at: { x: 4, y: 2 },
    frames: [[1, 1, 1, 1.8, 1.6, 1, 0.2, 1.6, 1]],
    look: "secondary" as const,
    measures: [{ id: 1, atoms: [1, 0, 2] }],
    name: "water.xyz",
    turn: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number],
    frame: 1,
  };

  it("go into Meno's record as they are, turn and frame and all, and come back so", () => {
    const back = readRecord(recordText({ atoms: [], bonds: [], molecules3d: [water3d] }));
    expect(back?.molecules3d).toEqual([water3d]);
  });

  it("are left out of a record where they do not read, not the rest", () => {
    const text = JSON.stringify({
      ...JSON.parse(recordText({ atoms: [], bonds: [], molecules3d: [water3d] })),
      molecules3d: [{ ...water3d, bonds: [{ a1: 0, a2: 9, order: 1 }] }, water3d],
    });
    expect(readRecord(text)?.molecules3d).toHaveLength(1);
  });

  it("keep what ties them to their drawing, and their stereochemistry, and come back so", () => {
    const made = {
      ...water3d,
      drawnFrom: [10, null, null],
      drawnAs: "O",
      conformerSet: true,
      bondsFrom: "distance" as const,
      made: { how: [{ label: "Optimised", text: "MMFF94, at most 2000 steps" }] },
      stereo: { atoms: { 0: "R" }, bonds: {}, chosen: { atoms: [0], bonds: [] } },
      // (an edited copy of a result says what it was made from: utils/edit3d)
      edited: { from: "conformer 7" },
    };
    const back = readRecord(recordText({ atoms: [], bonds: [], molecules3d: [made] }));
    expect(back?.molecules3d).toEqual([made]);
  });

  it("keep how many atoms their file left out, where it is some", () => {
    const back = (atomsLeftOut: unknown) => readRecord(recordText({ atoms: [], bonds: [], molecules3d: [{ ...water3d, atomsLeftOut } as typeof water3d] }))!.molecules3d![0].atomsLeftOut;
    expect(back(2)).toBe(2);
    expect(back(0)).toBeUndefined();
    expect(back(1.5)).toBeUndefined();
    expect(back("2")).toBeUndefined();
  });

  it("lose a tie or labels that do not read, not the molecule", () => {
    const text = recordText({
      atoms: [],
      bonds: [],
      molecules3d: [{ ...water3d, drawnFrom: [10, null], drawnAs: "O", stereo: { atoms: { 7: "R" }, bonds: {} } }],
    });
    const read = readRecord(text)!;
    const back = read.molecules3d![0];
    expect(back.drawnFrom).toBeUndefined();
    expect(back.drawnAs).toBeUndefined();
    // (the label of an atom it does not have left out alone, and said)
    expect(back.stereo).toEqual({ atoms: {}, bonds: {} });
    expect(read.leftOut).toEqual({ stereo: 1 });
    expect(back.atoms).toHaveLength(3);
  });

  it("go to other programs as a molfile in 3D, as they are seen", () => {
    const items = clipItems({ atoms: [], bonds: [], molecules3d: [water3d] });
    const mol = items.find((i) => i.flavor === "mol")!.text!;
    expect(mol.split("\n")[0]).toBe("water");
    expect(mol.split("\n")[1].substring(20, 22)).toBe("3D");
    // the second frame, turned a quarter about z: the O-H bonds now along y
    const rows = mol.split("\n").slice(4, 7).map((l) => l.trim().split(/\s+/).slice(0, 3).map(Number));
    expect(Math.abs(rows[1][0] - rows[0][0])).toBeLessThan(0.7);
    expect(Math.abs(rows[1][1] - rows[0][1])).toBeGreaterThan(0.7);
    expect(items.some((i) => i.flavor === "rxn")).toBe(false);
  });

  it("go to other programs with the bonds the frame they show has, where they go frame by frame", () => {
    // (two carbons bonded, then 3 Å apart: an XYZ file's frames, bonds by distance)
    const parting = {
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "C", x: 1.5, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      frames: [[0, 0, 0, 3, 0, 0]],
      bondsFrom: "distance" as const,
      at: { x: 0, y: 0 },
    };
    const counts = (frame: number) => clipItems({ atoms: [], bonds: [], molecules3d: [{ ...parting, frame }] }).find((i) => i.flavor === "mol")!.text!.split("\n")[3].slice(0, 6);
    expect(counts(0)).toBe("  2  1");
    expect(counts(1)).toBe("  2  0");
  });

  it("keep their radicals in the molfile other programs are given", () => {
    const hydroxyl = {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0, radical: "doublet" as const },
        { el: "H", x: 0.97, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 1 }],
      at: { x: 0, y: 0 },
    };
    const mol = clipItems({ atoms: [], bonds: [], molecules3d: [hydroxyl] }).find((i) => i.flavor === "mol")!.text!;
    expect(mol).toContain("M  RAD  1   1   2\n");
  });

  it("are pasted about the point asked for, with the rest", () => {
    const moved = centredAt({ atoms: [], bonds: [], molecules3d: [water3d, { ...water3d, at: { x: 8, y: 2 } }] }, { x: 0, y: 0 });
    expect(moved.molecules3d!.map((m) => m.at)).toEqual([
      { x: -2, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});

// A second Cmd+V at the same place put the copy exactly over the first: it
// could not be seen (the maintainer, 2026-10-12: a fixed step on, diagonally).
describe("pastePlace", () => {
  it("lands a paste asked for where the last one was a step down and to the right, and the next one a step further", () => {
    const at = { x: 3, y: 4 };
    const first = pastePlace(null, at);
    expect(first.place).toEqual(at);
    const second = pastePlace(first.pastes, at);
    expect(second.place).toEqual({ x: 3 + PASTE_STEP, y: 4 - PASTE_STEP });
    const third = pastePlace(second.pastes, at);
    expect(third.place).toEqual({ x: 3 + 2 * PASTE_STEP, y: 4 - 2 * PASTE_STEP });
  });

  it("lands a paste asked for anywhere else where it is asked for, and begins again from there", () => {
    const first = pastePlace(null, { x: 0, y: 0 });
    const elsewhere = pastePlace(first.pastes, { x: 5, y: 0 });
    expect(elsewhere.place).toEqual({ x: 5, y: 0 });
    expect(pastePlace(elsewhere.pastes, { x: 5, y: 0 }).place).toEqual({ x: 5 + PASTE_STEP, y: -PASTE_STEP });
  });
});

describe("an arrow in a record", () => {
  it("keeps its kind, heads, dashes, weight, corners and colour - only what Meno knows of each", () => {
    const record = recordText({
      atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "C" }],
      bonds: [],
      arrows: [
        { id: 1, x: 3, y: 0, angle: 0, length: 4, kind: "retrosynthetic", heads: 2, dash: true, weight: "thin", corners: [{ along: 0.3, across: 1 }], color: "#c44848" },
        { id: 2, x: 3, y: 5, angle: 0, length: 4, kind: "sideways" as never, heads: 3 as never, weight: "heavy" as never, corners: [{ along: "x" } as never], color: "red" },
      ],
    });
    const read = readRecord(record)!;
    expect(read.arrows![0]).toMatchObject({ kind: "retrosynthetic", heads: 2, dash: true, weight: "thin", corners: [{ along: 0.3, across: 1 }], color: "#c44848" });
    expect(read.arrows![1]).toEqual({ id: 2, x: 3, y: 5, angle: 0, length: 4 });
  });
});

// Null where a record's lists hold objects threw as it was pasted. Null, a
// number, a string or a list is put in every list of a record that holds
// one of everything, and in place of every value it has.
describe("a record with what is no entry in its lists", () => {
  const STRAYS: unknown[] = [null, 0, 7, "", "C", [], [1, 2], true];
  const ink = { pen: "pen", strokes: [{ points: [0, 0, 0.5, 1, 1, 0.5] }] };
  // (a cyclopropane, its ring filled, an electron-pushing arrow on it - and one of everything else a record carries)
  const WHOLE = {
    format: "meno-structure",
    version: 1,
    atoms: [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 0.75, y: 1.3, el: "C" },
    ],
    bonds: [
      { id: 11, a: 1, b: 2, order: 1 },
      { id: 12, a: 2, b: 3, order: 1 },
      { id: 13, a: 3, b: 1, order: 1 },
    ],
    pushes: [{ id: 1, from: { atom: 1 }, to: { bond: 12 } }],
    ringFills: { "1-2-3": "#ff0000" },
    arrows: [{ id: 1, x: 6, y: 0, angle: 0, length: 2, corners: [{ along: 0.5, across: 0.2 }] }],
    pluses: [{ id: 1, x: -3, y: 0 }],
    captions: [{ id: 1, x: 6, y: 1, text: "heat", marks: [{ from: 0, to: 2, bold: true }] }],
    molecules3d: [
      {
        atoms: [
          { el: "O", x: 0, y: 0, z: 0 },
          { el: "H", x: 0.76, y: 0.59, z: 0 },
        ],
        bonds: [{ a1: 0, a2: 1, order: 1 }],
        at: { x: 10, y: 0 },
        frames: [[0, 0, 0, 0.8, 0.6, 0]],
        measures: [{ id: 1, atoms: [0, 1] }],
        made: { how: [{ label: "Optimised", text: "MMFF94" }] },
      },
    ],
    flow: {
      sets: [{ id: 1, x0: 0, y0: -9, x1: 4, y1: -5 }],
      steps: [{ id: 2, kind: "optimise", x: 8, y: -7 }],
      wires: [{ id: 3, from: { set: 1 }, to: { step: 2, port: "in" } }],
    },
    pdfs: [{ name: "paper.pdf", sha256: "b".repeat(64), pages: [[612, 792]], x: 20, y: 0, placed: [{ page: 0, x: 30, y: 0 }], inks: [{ ...ink, page: 0 }] }],
    sheets: [{ name: "notes.txt", text: "a note", at: { x: 0, y: 9 } }],
    pictures: [{ id: 1, name: "a.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 0, y: 20, w: 1, h: 1 }],
    slides: [{ id: 1, x: 0, y: 30, w: 16, h: 9 }],
    shapes: [{ id: 1, kind: "rect", x0: 0, y0: 40, x1: 1, y1: 41 }],
    inks: [{ ...ink, id: 1 }],
  };

  type Path = (string | number)[];
  type Node = Record<string | number, unknown>;
  /** Every place in `v` - each list's entries and each object's fields - by its path. */
  const placesIn = (v: unknown, path: Path = []): Path[] =>
    v && typeof v === "object"
      ? Object.entries(v).flatMap(([k, x]) => {
          const here = [...path, Array.isArray(v) ? Number(k) : k];
          return [here, ...placesIn(x, here)];
        })
      : [];
  const valueAt = (path: Path) => path.reduce((o: unknown, k) => (o as Node)[k], WHOLE);
  /** The record's text with `edit` done to a copy of it at `path`: given what holds the place there, and its key. */
  const edited = (path: Path, edit: (holder: Node, key: string | number) => void) => {
    // (copied through its JSON, as the clipboard holds it: no list in two places)
    const copy = JSON.parse(JSON.stringify(WHOLE));
    edit(path.slice(0, -1).reduce((o: unknown, k) => (o as Node)[k], copy) as Node, path[path.length - 1]);
    return JSON.stringify(copy);
  };
  const lists = placesIn(WHOLE).filter((p) => Array.isArray(valueAt(p)));
  const isEntry = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const unsaid = (d: ReturnType<typeof readRecord>) => (d ? (({ leftOut: _, ...rest }) => rest)(d) : d);

  it("reads, carrying one of everything", () => {
    const d = readRecord(JSON.stringify(WHOLE))!;
    expect([d.atoms, d.bonds, d.pushes, d.arrows, d.arrows![0].corners, d.pluses, d.captions, d.captions![0].marks].map((l) => l?.length)).toEqual([3, 3, 1, 1, 1, 1, 1, 1]);
    expect([d.molecules3d, d.molecules3d![0].measures, d.molecules3d![0].made?.how, d.pictures, d.slides, d.shapes, d.inks].map((l) => l?.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect([d.flow?.sets, d.flow?.steps, d.flow?.wires, d.pdfs, d.pdfs?.[0].placed, d.pdfs?.[0].inks, d.sheets].map((l) => l?.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(d.ringFills).toEqual({ "1-2-3": "#ff0000" });
  });

  it("reads round it in any list of entries: it is left out, and what reads is read as before", () => {
    const whole = readRecord(JSON.stringify(WHOLE));
    const entries = lists.filter((p) => (valueAt(p) as unknown[]).every(isEntry));
    expect(entries.length).toBeGreaterThan(20);
    for (const path of entries) {
      const key = path[path.length - 1];
      // (as an atom or a bond that does not read: the record, or the molecule it is of, does not)
      const expected =
        key !== "atoms" && key !== "bonds"
          ? whole
          : path.length === 1
            ? null
            : readRecord(edited(path.slice(0, -1), (holder, k) => (holder as unknown as unknown[]).splice(k as number, 1)));
      // (put last: a sheet is numbered by its place in the list)
      // (what it left out said apart: utils/readNotes)
      for (const stray of STRAYS) expect(unsaid(readRecord(edited(path, (holder, k) => (holder[k] as unknown[]).push(stray)))), `${path.join(".")} holding ${JSON.stringify(stray)}`).toEqual(unsaid(expected));
    }
  }, 60_000);

  it("is never thrown at by it, anywhere: first or last in a list of any kind, or in place of any value", () => {
    const threw: string[] = [];
    const tryReading = (text: string, said: string) => {
      try {
        readRecord(text);
      } catch (e) {
        threw.push(`${said}: ${(e as Error).message}`);
      }
    };
    for (const stray of STRAYS) {
      for (const path of lists) {
        tryReading(edited(path, (holder, k) => (holder[k] as unknown[]).unshift(stray)), `${path.join(".")} holding ${JSON.stringify(stray)} first`);
        tryReading(edited(path, (holder, k) => (holder[k] as unknown[]).push(stray)), `${path.join(".")} holding ${JSON.stringify(stray)} last`);
      }
      for (const path of placesIn(WHOLE)) tryReading(edited(path, (holder, k) => (holder[k] = stray)), `${path.join(".")} = ${JSON.stringify(stray)}`);
      tryReading(JSON.stringify(stray), `the whole = ${JSON.stringify(stray)}`);
    }
    expect(threw).toEqual([]);
  }, 60_000);
});

describe("a selection of very many atoms", () => {
  // (more than a call takes spread as its arguments: all of a large drawing selected, then deleted or turned over, threw)
  const atoms = Array.from({ length: 150_000 }, (_, i) => ({ id: i + 1, x: (i % 500) * 1.8, y: -Math.floor(i / 500) * 1.8, el: "C" }));
  const ids = new Set(atoms.map((a) => a.id));

  it("takes the words, arrows and pluses among it", () => {
    const drawn = {
      atoms,
      bonds: [],
      captions: [{ id: 1, x: 10, y: -10, text: "in" }, { id: 2, x: -100, y: 0, text: "out" }],
      pluses: [{ id: 1, x: 20, y: -20 }],
      arrows: [],
    } as unknown as Drawn;
    const among = schemeAmong(drawn, ids);
    expect(among.captions.map((c) => c.id)).toEqual([1]);
    expect(among.pluses).toHaveLength(1);
  });

  it("is written as a molfile, and Clean-up finds the next free id past it", () => {
    expect(writeMolfile({ atoms, bonds: [] } as never)).toContain("V3000");
    expect(nextFree({ atoms, bonds: [] } as never)).toBe(150_001);
  }, measured(360));

  it("has a middle", () => {
    expect(middleOf({ atoms, bonds: [] } as unknown as Model, ids)).toEqual({ x: (499 * 1.8) / 2, y: (-299 * 1.8) / 2 });
  });
});

describe("a copy, in pictures", () => {
  it("is drawn in them with a structure, molecules in 3D, or words, shapes, writing, arrows or \"+\" signs alone - not slides alone", () => {
    const none = { atoms: [], bonds: [] };
    expect(drawsPicture(none)).toBe(false);
    expect(drawsPicture({ ...none, slides: [{ id: 1, x: 0, y: 0, w: 32, h: 18 }] } as never)).toBe(false);
    expect(drawsPicture({ ...none, captions: [{ id: 1, x: 0, y: 0, text: "Title" }] })).toBe(true);
    expect(drawsPicture({ ...none, shapes: [{ id: 1, kind: "rect", x0: 0, y0: 0, x1: 2, y1: 1 }] })).toBe(true);
    expect(drawsPicture({ ...none, inks: [{ id: 1, pen: "pen", width: 1, strokes: [{ points: [0, 0, 0.5, 1, 1, 0.5] }] }] })).toBe(true);
    expect(drawsPicture({ ...none, atoms: [{ id: 1, x: 0, y: 0, el: "C" }] as never })).toBe(true);
  });
});

/** `xs` read through a count of the times one of them is read by its place - how much of a list a function looks at. */
function counted<T>(xs: T[]): { list: T[]; reads: () => number } {
  let n = 0;
  const list = new Proxy(xs, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) n++;
      return Reflect.get(target, key, receiver);
    },
  });
  return { list, reads: () => n };
}
