import { describe, expect, it } from "vitest";
import type { Drawn, Model } from "../store/types";
import { centredAt, clipItems, looksLikeSmiles, partToCopy, readRecord, recordText } from "./copyPaste";
import { kindOf } from "../../../../lib/io/kinds";

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
    expect(readRecord(text)).toEqual({ atoms: [atom(1, 0, 0)], bonds: [] });
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

  it("lose a tie or labels that do not read, not the molecule", () => {
    const text = recordText({
      atoms: [],
      bonds: [],
      molecules3d: [{ ...water3d, drawnFrom: [10, null], drawnAs: "O", stereo: { atoms: { 7: "R" }, bonds: {} } }],
    });
    const back = readRecord(text)!.molecules3d![0];
    expect(back.drawnFrom).toBeUndefined();
    expect(back.drawnAs).toBeUndefined();
    expect(back.stereo).toBeUndefined();
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

  it("are pasted about the point asked for, with the rest", () => {
    const moved = centredAt({ atoms: [], bonds: [], molecules3d: [water3d, { ...water3d, at: { x: 8, y: 2 } }] }, { x: 0, y: 0 });
    expect(moved.molecules3d!.map((m) => m.at)).toEqual([
      { x: -2, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});
