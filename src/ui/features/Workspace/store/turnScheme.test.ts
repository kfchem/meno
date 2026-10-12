import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import * as ops from "../document";
import { createWorkspaceDocument } from "../document";
import { turnOverMiddle } from "../utils/turnOver";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

/** A reaction drawn left to right: two reactants and a "+" between them, an arrow with words over it, a product. */
function reaction() {
  const e = editor();
  const { st } = e;
  const a = st().addAtom(0, 0, "C");
  st().addAtomBonded(a, L, 0, "O");
  const b = st().addAtom(3 * L, 0, "N");
  const plus = st().addPlus(1.9 * L, 0);
  const arrow = st().addArrow(6 * L, 0, 0, 3 * L);
  const words = st().addCaption("NaH", 6 * L, 0.8, arrow);
  const c = st().addAtom(9 * L, 0, "C");
  st().addAtomBonded(c, 10 * L, 0, "N");
  st().addAtomBonded(b, 3 * L, 2 * L, "C");
  st().setSel({ atoms: new Set(st().model.atoms.map((x) => x.id)), bonds: new Set() });
  return { ...e, plus, arrow, words };
}

describe("a reaction turned over", () => {
  it("takes its arrows, \"+\" signs and words with it: left for right, the arrow pointing back, one step", () => {
    const { doc, st, plus, arrow, words } = reaction();
    const depth = doc.history().undoDepth;
    st().turnSelectionOver("vertical");
    // (the atoms span 0 to 10 bonds: mirrored about 5)
    const a = st().arrows.find((x) => x.id === arrow)!;
    expect(a.x).toBeCloseTo(4 * L);
    expect(Math.cos(a.angle)).toBeCloseTo(-1);
    expect(st().pluses.find((x) => x.id === plus)!.x).toBeCloseTo(8.1 * L);
    const w = st().captions.find((x) => x.id === words)!;
    expect(w.x).toBeCloseTo(4 * L);
    expect(w.y).toBeCloseTo(0.8);
    expect(w.arrow).toBe(arrow);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(st().arrows.find((x) => x.id === arrow)).toMatchObject({ x: 6 * L, angle: 0 });
    expect(st().captions.find((x) => x.id === words)).toMatchObject({ x: 6 * L, y: 0.8 });
  });

  it("up for down: the words over the arrow come under it, as a mirror shows them", () => {
    const { st, arrow, words } = reaction();
    st().turnSelectionOver("horizontal");
    // (the atoms span 0 to 2 bonds up: mirrored about 1)
    const a = st().arrows.find((x) => x.id === arrow)!;
    expect(a.y).toBeCloseTo(2 * L);
    expect(Math.cos(a.angle)).toBeCloseTo(1);
    expect(st().captions.find((x) => x.id === words)!.y).toBeCloseTo(2 * L - 0.8);
  });
});

describe("a selection turned over with the things selected with it", () => {
  it("mirrors a picture, a slide and a line by their places about the middle of all of it, the picture's tilt the other way - one step", () => {
    const { doc, st } = editor();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtomBonded(a, L, 0, "O");
    doc.edit("things", (d) =>
      ops.addShape(
        ops.addSlide(ops.addPicture(d, { name: "p.png", sha256: "a".repeat(64), media: "image/png", px: [10, 10], x: 10, y: 0, w: 4, h: 2, turn: 0.2 }), { x: -6, y: 0, w: 4, h: 3 }),
        { kind: "line", x0: 1, y0: 3, x1: 3, y1: 4 },
      ),
    );
    st().setSel({ atoms: new Set([a, b]), bonds: new Set() });
    st().selectPictures([1], true);
    st().selectSlides([1], true);
    st().selectShapes([1], true);
    const m = turnOverMiddle(st(), { arrows: [], pluses: [], captions: [] })!;
    // (the middle of all of it: the slide's left edge to the picture's right corner)
    expect(m.x).toBeCloseTo((-8 + 10 + 2 * Math.cos(0.2) + Math.sin(0.2)) / 2, 6);
    const depth = doc.history().undoDepth;
    st().turnSelectionOver("vertical");
    expect(doc.history().undoDepth).toBe(depth + 1);
    const pic = st().pictures[0];
    expect(pic.x).toBeCloseTo(2 * m.x - 10, 6);
    expect(pic.y).toBe(0);
    expect(pic.turn).toBeCloseTo(-0.2, 6);
    expect(st().slides[0].x).toBeCloseTo(2 * m.x + 6, 6);
    expect(st().shapes[0]).toMatchObject({ y0: 3, y1: 4 });
    expect(st().shapes[0].x0).toBeCloseTo(2 * m.x - 1, 6);
    expect(st().shapes[0].x1).toBeCloseTo(2 * m.x - 3, 6);
    // (the atoms about the same middle, so all of it stays where it was)
    expect(st().model.atoms.find((x) => x.id === a)!.x).toBeCloseTo(2 * m.x, 6);
    doc.undo();
    expect(st().pictures[0]).toMatchObject({ x: 10, turn: 0.2 });
    expect(st().slides[0].x).toBe(-6);
    expect(st().model.atoms.find((x) => x.id === a)!.x).toBe(0);
  });

  it("carries writing by hand by its middle, its strokes as written - not mirrored, as words are not", () => {
    const { st } = editor();
    const a = st().addAtom(0, 0, "C");
    st().addAtomBonded(a, L, 0, "O");
    // (a stroke from 6 to 8, rising: its middle at 7)
    const k = st().writeStroke({ pen: "pen", width: 1 }, { points: [6, 0, 0.5, 8, 1, 0.5] })!;
    st().setSel({ atoms: new Set(st().model.atoms.map((x) => x.id)), bonds: new Set() });
    st().selectInks([k], true);
    const m = turnOverMiddle(st(), { arrows: [], pluses: [], captions: [] })!;
    expect(m.x).toBeCloseTo(4, 6);
    st().turnSelectionOver("vertical");
    const pts = st().inks[0].strokes[0].points;
    // (its middle mirrored, 7 to 1; still rising left to right)
    expect((pts[0] + pts[3]) / 2).toBeCloseTo(2 * m.x - 7, 6);
    expect(pts[3]).toBeGreaterThan(pts[0]);
    expect(pts[4]).toBeGreaterThan(pts[1]);
  });
});
