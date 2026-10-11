import { describe, expect, it } from "vitest";
import { addPush, appendModel, deleteParts, emptyWorkspaceDocument, relayout, removePush, replaceModel, turnPushesOver, updatePush, type WorkspaceDocument } from "../document";
import type { Model } from "../store/types";
import { partToCopy, readRecord, recordText } from "./copyPaste";
import { hasLonePair, partAt, pushShapes, pushTargetAt, tailOf } from "./pushes";
import { layoutMolecule } from "../../../../lib/chem/layout2d";
import { pushMeasures } from "../../../../lib/chem/pushArrow";
import { styleOf, DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";

// hydroxide and bromomethane, for an SN2: O(1)  C(2)-Br(3), C-H(4)
const L = 1.5;
const model: Model = {
  atoms: [
    { id: 1, el: "O", x: -2 * L, y: 0, r: 0.9, charge: -1 },
    { id: 2, el: "C", x: 0, y: 0, r: 0.9 },
    { id: 3, el: "Br", x: L, y: 0, r: 0.9 },
    { id: 4, el: "H", x: -0.5 * L, y: 0.87 * L, r: 0.9 },
  ],
  bonds: [
    { id: 10, a: 2, b: 3, order: 1 },
    { id: 11, a: 2, b: 4, order: 1 },
  ],
};
const start = (): WorkspaceDocument => ({ ...emptyWorkspaceDocument(), model, nextId: 20 });

describe("electron-pushing arrows in the document", () => {
  it("are added between atoms, bonds and gaps that are there, and not from a place to itself", () => {
    const d = addPush(addPush(start(), { atom: 1 }, { atom: 2 }, false), { bond: 10 }, { atom: 3 }, true);
    expect(d.pushes).toEqual([
      { id: 1, from: { atom: 1 }, to: { atom: 2 } },
      { id: 2, from: { bond: 10 }, to: { atom: 3 }, half: true },
    ]);
    expect(addPush(start(), { atom: 1 }, { atom: 99 }, false)).toEqual(start());
    expect(addPush(start(), { atom: 1 }, { atom: 1 }, false)).toEqual(start());
    expect(addPush(start(), { atom: 1 }, { gap: [1, 2] }, false).pushes).toHaveLength(1);
  });

  it("change their head, their bend and their ends, and go", () => {
    let d = addPush(start(), { atom: 1 }, { atom: 2 }, false);
    d = updatePush(d, 1, { half: true, bend: { along: 0.5, out: 0.8 } });
    expect(d.pushes![0]).toMatchObject({ half: true, bend: { along: 0.5, out: 0.8 } });
    d = updatePush(d, 1, { bend: null, to: { bond: 11 }, noPair: true });
    expect(d.pushes![0]).toEqual({ id: 1, from: { atom: 1 }, to: { bond: 11 }, half: true, noPair: true });
    expect(removePush(d, 1).pushes).toEqual([]);
  });

  it("go with the atom or the bond they stand on", () => {
    const d = addPush(addPush(start(), { atom: 1 }, { atom: 2 }, false), { bond: 10 }, { atom: 3 }, false);
    expect(deleteParts(d, [3], []).pushes).toEqual([{ id: 1, from: { atom: 1 }, to: { atom: 2 } }]);
    expect(deleteParts(d, [], [10]).pushes).toEqual([{ id: 1, from: { atom: 1 }, to: { atom: 2 } }]);
  });

  it("are bent as Meno bends them again by a Clean-up of what they stand on, and to their other side by a turn over", () => {
    const d = updatePush(addPush(start(), { atom: 1 }, { atom: 2 }, false), 1, { bend: { along: 0.4, out: 0.6 } });
    expect(turnPushesOver(d, new Set([1, 2])).pushes![0].bend).toEqual({ along: 0.4, out: -0.6 });
    expect(turnPushesOver(d, new Set([2])).pushes![0].bend).toEqual({ along: 0.4, out: 0.6 });
    const cleaned = relayout(d, { atoms: [{ id: 1, x: -3, y: 0 }, { id: 2, x: 0, y: 0.1 }], bonds: [] });
    expect(cleaned.pushes![0].bend).toBeUndefined();
  });

  it("are pasted with their atoms and bonds, on their new ids", () => {
    const withArrows = { ...model, pushes: [{ id: 7, from: { atom: 1 }, to: { gap: [1, 2] as [number, number] } }, { id: 8, from: { bond: 10 }, to: { atom: 3 }, half: true as const }] };
    const d = appendModel({ ...start(), nextId: 100, nextPushId: 5 }, withArrows);
    const ids = d.model.atoms.slice(4).map((a) => a.id);
    const bondId = d.model.bonds[2].id;
    expect(d.pushes).toEqual([
      { id: 5, from: { atom: ids[0] }, to: { gap: [ids[0], ids[1]] } },
      { id: 6, from: { bond: bondId }, to: { atom: ids[2] }, half: true },
    ]);
    // (and opened as they were, numbered from one)
    expect(replaceModel(emptyWorkspaceDocument(), withArrows).pushes!.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("electron-pushing arrows on the clipboard", () => {
  const drawn = { ...model, pushes: [{ id: 1, from: { atom: 1 }, to: { atom: 2 } }, { id: 2, from: { bond: 10 }, to: { atom: 3 } }] };

  it("go with a copy when it holds both their ends", () => {
    const part = partToCopy(drawn, { atoms: new Set([2, 3, 4]), bonds: new Set([10, 11]) }, null)!;
    expect(part.pushes).toEqual([{ id: 2, from: { bond: 10 }, to: { atom: 3 } }]);
    expect(readRecord(recordText(part))!.pushes).toEqual(part.pushes);
  });

  it("are read only where their ends are in the record, and as they should be", () => {
    const text = recordText({ ...model, pushes: [{ id: 1, from: { atom: 1 }, to: { atom: 99 } }, { id: 2, from: { atom: 1 }, to: { atom: 2 }, bend: { along: 0.5, out: Infinity } }] as never });
    expect(readRecord(text)!.pushes).toEqual([{ id: 2, from: { atom: 1 }, to: { atom: 2 } }]);
  });
});

describe("where an arrow being drawn goes", () => {
  const atoms = model.atoms;

  it("is the atom or bond lit, else the one at the pointer, else a gap between atoms not bonded", () => {
    expect(pushTargetAt({ x: 0, y: 0 }, { atomId: 3, bondId: null }, atoms, model.bonds, L)).toEqual({ atom: 3 });
    expect(pushTargetAt({ x: 0.05, y: 0 }, { atomId: null, bondId: null }, atoms, model.bonds, L)).toEqual({ atom: 2 });
    expect(pushTargetAt({ x: 0.5 * L, y: 0.1 }, { atomId: null, bondId: null }, atoms, model.bonds, L)).toEqual({ bond: 10 });
    expect(partAt({ x: 9, y: 9 }, atoms, model.bonds, L)).toBeNull();
    expect(pushTargetAt({ x: -L, y: 0 }, { atomId: null, bondId: null }, atoms, model.bonds, L)).toEqual({ gap: [1, 2] });
  });

  it("starts at a lone pair where the atom has one to give", () => {
    expect(hasLonePair({ el: "O" })).toBe(true);
    expect(hasLonePair({ el: "C", charge: -1 })).toBe(true);
    expect(hasLonePair({ el: "C" })).toBe(false);
  });

  it("leaves an anion from its charge, unless set to leave from a lone pair; a fishhook leaves a radical from its dot", () => {
    expect(tailOf({ el: "O", charge: -1 }, {})).toBe("charge");
    expect(tailOf({ el: "O", charge: -1 }, { fromPair: true })).toBe("pair");
    expect(tailOf({ el: "N" }, {})).toBe("pair");
    expect(tailOf({ el: "C", charge: -1, radical: 1 }, { half: true })).toBe("radical");
    expect(tailOf({ el: "C", charge: -1, radical: 1 }, {})).toBe("charge");
  });

  it("draws an anion's arrow from beside its charge's mark, with no lone pair's dots", () => {
    // HO- to the carbon: drawn as a picture lays it out
    const style = styleOf(DEFAULT_STYLE_CHOICE);
    const B = NOMINAL_BOND_LENGTH;
    const atoms = model.atoms.map((a) => ({ id: a.id, el: a.el, x: (a.x / L) * B, y: (a.y / L) * B, ...(a.charge ? { charge: a.charge } : {}) }));
    const index = new Map(model.atoms.map((a, i) => [a.id, i]));
    const opts = editorLayoutOptions(style, { minLinePx: 0, paddingPx: 4 });
    const layout = layoutMolecule(atoms, layoutBonds(model.bonds, index), opts, (style.bondLengthPt * 96) / 72 / B);
    const m = pushMeasures(style, B);
    const shape = (fromPair: boolean) =>
      pushShapes([{ id: 1, from: { atom: 1 }, to: { atom: 2 }, ...(fromPair ? { fromPair: true as const } : {}) }], atoms, model.bonds, layout, opts, opts.fontPx, m)[0].shape;
    const fromCharge = shape(false);
    expect(fromCharge.dots).toHaveLength(0);
    // (its start near the mark: up and to the right of the O, where the charge is written)
    expect(fromCharge.start.x).toBeGreaterThan(atoms[0].x);
    expect(fromCharge.start.y).toBeGreaterThan(atoms[0].y);
    expect(shape(true).dots).toHaveLength(2);
  });
});
