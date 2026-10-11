import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, appendModel, colourParts, fillRings } from "../document";
import type { Model } from "../store/types";
import { readRecord, recordText, partToCopy } from "./copyPaste";
import { fillsAmong, ringAt, ringKeyOf, ringsAmong, ringsOf } from "./rings";

// naphthalene's skeleton: two rings sharing the bond 1-6, and a methyl on 3
const L = 1.5;
const h = (L * Math.sqrt(3)) / 2;
const model: Model = {
  atoms: [
    { id: 1, el: "C", x: 0, y: L / 2, r: 0.9 },
    { id: 2, el: "C", x: -h, y: L, r: 0.9 },
    { id: 3, el: "C", x: -2 * h, y: L / 2, r: 0.9 },
    { id: 4, el: "C", x: -2 * h, y: -L / 2, r: 0.9 },
    { id: 5, el: "C", x: -h, y: -L, r: 0.9 },
    { id: 6, el: "C", x: 0, y: -L / 2, r: 0.9 },
    { id: 7, el: "C", x: h, y: -L, r: 0.9 },
    { id: 8, el: "C", x: 2 * h, y: -L / 2, r: 0.9 },
    { id: 9, el: "C", x: 2 * h, y: L / 2, r: 0.9 },
    { id: 10, el: "C", x: h, y: L, r: 0.9 },
    { id: 11, el: "C", x: -3 * h, y: L, r: 0.9 },
  ],
  bonds: [
    [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1], [6, 7], [7, 8], [8, 9], [9, 10], [10, 1], [3, 11],
  ].map(([a, b], i) => ({ id: 100 + i, a, b, order: 1 as const })),
};
const left = "1-2-3-4-5-6";
const right = "1-6-7-8-9-10";

describe("the drawing's rings", () => {
  it("are its smallest rings, each by its atoms' ids ascending", () => {
    expect(ringsOf(model).map((r) => r.key).sort()).toEqual([left, right].sort());
    expect(ringKeyOf([6, 1, 5, 2, 4, 3])).toBe(left);
  });

  it("are found by a point inside one, and by the atoms that hold them whole", () => {
    expect(ringAt(model, { x: -h, y: 0 })).toBe(left);
    expect(ringAt(model, { x: h, y: 0 })).toBe(right);
    expect(ringAt(model, { x: 9, y: 9 })).toBeNull();
    expect(ringsAmong(model, new Set([1, 2, 3, 4, 5, 6, 7]))).toEqual([left]);
  });
});

describe("colour in the document", () => {
  const doc = { ...emptyWorkspaceDocument(), model, nextId: 200 };

  it("is given to atoms and bonds, and taken away, one way or the other", () => {
    const red = colourParts(doc, { atoms: [3], bonds: [101] }, "color", "#d55e00");
    expect(red.model.atoms.find((a) => a.id === 3)?.color).toBe("#d55e00");
    expect(red.model.bonds.find((b) => b.id === 101)?.color).toBe("#d55e00");
    expect(red.model.atoms.find((a) => a.id === 3)?.highlight).toBeUndefined();
    const lit = colourParts(red, { atoms: [3], bonds: [] }, "highlight", "#0072b2");
    expect(lit.model.atoms.find((a) => a.id === 3)).toMatchObject({ color: "#d55e00", highlight: "#0072b2" });
    const none = colourParts(lit, { atoms: [3], bonds: [101] }, "color", null);
    expect(none.model.atoms.find((a) => a.id === 3)?.color).toBeUndefined();
    expect(none.model.bonds.find((b) => b.id === 101)?.color).toBeUndefined();
    // (the same again is no change)
    expect(colourParts(red, { atoms: [3], bonds: [101] }, "color", "#d55e00")).toBe(red);
  });

  it("fills rings, and empties them", () => {
    const filled = fillRings(doc, [left, right], "#009e73");
    expect(filled.ringFills).toEqual({ [left]: "#009e73", [right]: "#009e73" });
    expect(fillRings(filled, [right], null).ringFills).toEqual({ [left]: "#009e73" });
  });

  it("goes with what is pasted, its rings' fills by its atoms' new ids", () => {
    const pasted = appendModel({ ...emptyWorkspaceDocument(), nextId: 500 }, { ...model, ringFills: { [left]: "#009e73" } });
    const ids = pasted.model.atoms.slice(0, 6).map((a) => a.id);
    expect(pasted.ringFills).toEqual({ [ringKeyOf(ids)]: "#009e73" });
  });
});

describe("colour on the clipboard", () => {
  const drawn = { ...colourParts({ ...emptyWorkspaceDocument(), model, nextId: 200 }, { atoms: [11], bonds: [111] }, "highlight", "#e69f00").model, ringFills: { [left]: "#009e73", [right]: "#cc79a7" } };

  it("is carried by a copy: its atoms' and bonds' colours, and the fills of the rings it holds whole", () => {
    const part = partToCopy(drawn, { atoms: new Set([1, 2, 3, 4, 5, 6, 11]), bonds: new Set() }, null)!;
    expect(part.ringFills).toEqual({ [left]: "#009e73" });
    const read = readRecord(recordText(part))!;
    expect(read.ringFills).toEqual({ [left]: "#009e73" });
    expect(read.atoms.find((a) => a.id === 11)?.highlight).toBe("#e69f00");
    expect(fillsAmong(drawn.ringFills, new Set([1, 6, 7, 8, 9, 10]))).toEqual({ [right]: "#cc79a7" });
  });

  it("is read only as a colour: anything else is left out", () => {
    const text = recordText({ ...model, atoms: model.atoms.map((a) => (a.id === 1 ? { ...a, color: "red;stroke:url(x)" } : a)), ringFills: { [left]: "<x>", "1-2": "#000000" } });
    const read = readRecord(text)!;
    expect(read.atoms.find((a) => a.id === 1)?.color).toBeUndefined();
    expect(read.ringFills).toBeUndefined();
  });
});
