import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { createWorkspaceDocument, emptyWorkspaceDocument, addMolecule3d, setMagnified3d } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Molecule3D } from "../store/types";
import { readCarried3D } from "./copyPaste";
import { draggedMagnification, magnificationText, magnificationWithin, MAGNIFICATIONS, MAGNIFIED_LEAST, MAGNIFIED_MOST } from "./magnified";
import { measureValue } from "./measure3d";
import { atomAt, heightOf, magnifiedOf, pictureMarks, poseOf, reachOf, reachOverFrames, seenBounds, seenOnPage, solidOf, standingHeight, WORLD_PER_ANGSTROM } from "./molecule3d";
import { carriedOf } from "./workspace";

const ethane = (magnified?: number): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 10, y: 5, z: 1 },
    { el: "C", x: 11.5, y: 5, z: 1 },
  ],
  bonds: [{ a1: 0, a2: 1, order: 1 }],
  at: { x: 20, y: 30 },
  ...(magnified != null ? { magnified } : {}),
});

describe("a magnification", () => {
  it("is said in whole percents, kept between a quarter and four times, 1 at a hair from it", () => {
    expect(magnificationText(1.5)).toBe("150 %");
    expect(magnificationText(0.754)).toBe("75 %");
    expect(magnificationWithin(10)).toBe(MAGNIFIED_MOST);
    expect(magnificationWithin(0.01)).toBe(MAGNIFIED_LEAST);
    expect(magnificationWithin(1 + 1e-9)).toBe(1);
    expect(magnificationWithin(Number.NaN)).toBe(1);
    expect(MAGNIFICATIONS).toEqual([0.5, 0.75, 1.25, 1.5, 2, 3]);
  });

  it("doubles a drag's so far to the right along its mark and halves as far to the left, to whole percents, within bounds", () => {
    expect(draggedMagnification(1, 120)).toBe(2);
    expect(draggedMagnification(1, -120)).toBe(0.5);
    expect(draggedMagnification(1.5, 0)).toBe(1.5);
    expect(draggedMagnification(1, 60)).toBe(1.41);
    expect(draggedMagnification(3, 600)).toBe(MAGNIFIED_MOST);
    expect(draggedMagnification(0.5, -600)).toBe(MAGNIFIED_LEAST);
  });
});

describe("a molecule in 3D shown magnified", () => {
  it("is shown about its own place, every point and every ball so many times as far and as large, standing as high", () => {
    const one = ethane();
    const big = ethane(2);
    const s = solidOf(one, STYLE_3D);
    expect(magnifiedOf(one)).toBe(1);
    expect(magnifiedOf(big)).toBe(2);
    const a = seenOnPage(poseOf(one, s, "primary"));
    const b = seenOnPage(poseOf(big, s, "primary"));
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x - 20).toBeCloseTo(2 * (a[i].x - 20), 9);
      expect(b[i].y - 30).toBeCloseTo(2 * (a[i].y - 30), 9);
      expect(b[i].r).toBeCloseTo(2 * a[i].r, 9);
    }
    expect(heightOf(big, s)).toBeCloseTo(2 * standingHeight(s), 9);
    expect(reachOf(big, s, "primary")).toBeCloseTo(2 * s.reach.primary, 9);
    const w = (r: { x0: number; x1: number }) => r.x1 - r.x0;
    expect(w(reachOverFrames(big, STYLE_3D))).toBeCloseTo(2 * w(reachOverFrames(one, STYLE_3D)), 9);
    const box = seenBounds(poseOf(big, s, "primary"));
    expect(box.maxX - box.minX).toBeCloseTo(2 * (seenBounds(poseOf(one, s, "primary")).maxX - seenBounds(poseOf(one, s, "primary")).minX), 9);
  });

  it("is hit where it is shown, not where it would be at its true size", () => {
    const big = ethane(2);
    const s = solidOf(big, STYLE_3D);
    // (its second carbon, shown twice as far from its middle: 1.5 Å each side, not 0.75)
    const far = 20 + 1.5 * WORLD_PER_ANGSTROM;
    expect(atomAt(poseOf(big, s, "primary"), undefined, far, 30)).toBe(1);
    expect(atomAt(poseOf(ethane(), s, "primary"), undefined, far, 30)).toBeNull();
  });

  it("keeps its ångströms: what it measures, and its atoms as a file writes them", () => {
    const s = solidOf(ethane(2), STYLE_3D);
    expect(measureValue(s.frames[0], [0, 1])).toBeCloseTo(measureValue(solidOf(ethane(), STYLE_3D).frames[0], [0, 1]), 9);
  });

  it("is drawn in a picture as it is shown", () => {
    const at = (k?: number) => pictureMarks({ ...ethane(k), id: undefined } as never, STYLE_3D).filter((m) => m.kind === "ball");
    const one = at();
    const two = at(2);
    expect(two).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const [p, q] = [one[i], two[i]];
      if (p.kind !== "ball" || q.kind !== "ball") throw new Error("balls");
      expect(q.r).toBeCloseTo(2 * p.r, 9);
      expect(q.c.x - 20).toBeCloseTo(2 * (p.c.x - 20), 9);
    }
  });

  it("is set within bounds, 1 taking the setting away, and travels in its file and in a copy", () => {
    let d = addMolecule3d(emptyWorkspaceDocument(), ethane());
    const id = d.molecules3d![0].id;
    d = setMagnified3d(d, [id], 1.5);
    expect(d.molecules3d![0].magnified).toBe(1.5);
    expect(setMagnified3d(d, [id], 9).molecules3d![0].magnified).toBe(MAGNIFIED_MOST);
    expect("magnified" in setMagnified3d(d, [id], 1).molecules3d![0]).toBe(false);
    const carried = carriedOf({ molecules3d: d.molecules3d!, turns3d: {}, frames3d: {} });
    expect(readCarried3D(JSON.parse(JSON.stringify(carried[0])))!.magnified).toBe(1.5);
    // (a magnification that does not read, or is 1: none)
    expect("magnified" in readCarried3D({ ...carried[0], magnified: "big" })!).toBe(false);
    expect("magnified" in readCarried3D({ ...carried[0], magnified: 1 })!).toBe(false);
  });

  it("is changed in one step - a drag's in one - which an undo takes back", () => {
    const doc = createWorkspaceDocument();
    doc.edit("add", (d) => addMolecule3d(d, ethane()));
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const id = doc.getState().molecules3d![0].id;
    const before = doc.getState();
    store.getState().setMagnified3d([id], 1.25, "drag");
    store.getState().setMagnified3d([id], 1.6, "drag");
    store.getState().setMagnified3d([id], 2, "drag");
    expect(doc.getState().molecules3d![0].magnified).toBe(2);
    expect(doc.history().undoLabel).toBe("magnification");
    doc.undo();
    expect(doc.getState()).toBe(before);
    store.getState().setMagnified3d([id], 0.5);
    store.getState().setMagnified3d([id], 1);
    expect("magnified" in doc.getState().molecules3d![0]).toBe(false);
    doc.undo();
    expect(doc.getState().molecules3d![0].magnified).toBe(0.5);
  });
});
