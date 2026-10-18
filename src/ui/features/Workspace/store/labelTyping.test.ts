import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { labelSetOf } from "../../../../lib/chem/layout2d";
import { clickSpread, DRAW_BACK_MS, SPREAD_MS } from "../components/selectionShade";
import { WRITE_MS, writeMoving, writingAt, writtenLetters } from "../utils/writtenLetters";
import { frameClock } from "../../../theme/motion";

/** Two carbons bonded, as the canvas has them. */
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const c = st().addAtom(0, 0, "C");
  const x = st().addAtom(NOMINAL_BOND_LENGTH, 0, "C");
  st().addBond(c, x, 1);
  return { st, c, x };
}

describe("a click on an atom (docs/EDITOR-2D.md, How it is worked)", () => {
  it("selects the atom alone at once - and the second click of a double-click takes it back, as it was", () => {
    const { st, c, x } = editor();
    st().setSel({ atoms: new Set([c]), bonds: new Set() }, c);
    st().clickSelectAtom(x);
    expect([...st().sel.atoms]).toEqual([x]);
    expect(st().clickShade).toMatchObject({ atomId: x, fresh: true, back: false });
    expect(st().clickTakeBack(x)).toBe(true);
    expect([...st().sel.atoms]).toEqual([c]);
    expect(st().selAnchor).toBe(c);
    expect(st().clickShade).toMatchObject({ atomId: x, back: true });
    // (once only, and only the atom clicked)
    expect(st().clickTakeBack(x)).toBe(false);
  });

  it("takes nothing back once something else is selected since, or another atom is pressed", () => {
    const { st, c, x } = editor();
    st().clickSelectAtom(x);
    expect(st().clickTakeBack(c)).toBe(false);
    st().selectStructure(x);
    expect(st().clickTakeBack(x)).toBe(false);
    expect(st().sel.atoms.size).toBe(2);
  });

  it("spreads its shade only where the atom was not selected before", () => {
    const { st, x } = editor();
    st().setSel({ atoms: new Set([x]), bonds: new Set() }, x);
    st().clickSelectAtom(x);
    expect(st().clickShade?.fresh).toBe(false);
  });

  it("spreads its shade from the atom in SPREAD_MS, and draws it back in DRAW_BACK_MS - eased, from nothing to whole and back", () => {
    expect(SPREAD_MS).toBe(160);
    expect(DRAW_BACK_MS).toBe(140);
    expect(clickSpread(0, false)).toBe(0);
    expect(clickSpread(SPREAD_MS / 2, false)).toBeGreaterThan(0.5);
    expect(clickSpread(SPREAD_MS, false)).toBe(1);
    expect(clickSpread(0, true)).toBe(1);
    expect(clickSpread(DRAW_BACK_MS / 2, true)).toBeLessThan(0.5);
    expect(clickSpread(DRAW_BACK_MS, true)).toBe(0);
  });
});

describe("a label written over an atom: begun, kept and let go", () => {
  it("grows its first letter out of the atom where begun by a letter - not from the menu, which may select what it says", () => {
    const { st, x } = editor();
    st().beginLabelEdit(x, "o");
    expect(st().labelEdit).toMatchObject({ active: true, value: "o", grow: true, selectAll: false });
    st().cancelLabelEdit();
    st().beginLabelEdit(x, "C", { select: true });
    expect(st().labelEdit).toMatchObject({ active: true, value: "C", grow: false, selectAll: true });
  });

  it("tells how it ended: kept and changed, kept as it was, or let go", () => {
    const { st, x } = editor();
    st().beginLabelEdit(x, "O");
    const n = st().labelEdit.n;
    st().commitLabelEdit("O");
    expect(st().labelEnd).toMatchObject({ n, atomId: x, how: "kept" });
    st().beginLabelEdit(x, "");
    st().setLabelEditValue("O");
    st().commitLabelEdit("O");
    expect(st().labelEnd?.how).toBe("same");
    st().beginLabelEdit(x, "N");
    st().cancelLabelEdit();
    expect(st().labelEnd?.how).toBe("cancelled");
    expect(st().model.atoms.find((a) => a.id === x)?.el).toBe("O");
    // (a cancel with nothing being written tells nothing new)
    const was = st().labelEnd;
    st().cancelLabelEdit();
    expect(st().labelEnd).toBe(was);
  });
});

describe("a label's letters as they are written over its atom", () => {
  const o = acsWorldOptions([], [], { units: "world" });
  const set = labelSetOf(o);
  it("sets its first letter on the atom - a two-letter symbol's middle", () => {
    const one = writtenLetters("O", o.fontPx, set);
    expect(one.dx).toBeCloseTo(0, 9);
    const more = writtenLetters("OMe", o.fontPx, set);
    expect(more.dx).toBeGreaterThan(0);
    // (its items about the atom: the set's middle that far right of it)
    expect(more.items[0].x - more.laid.items[0].x).toBeCloseTo(more.dx, 9);
    expect(writtenLetters("Cl", o.fontPx, set).dx).toBe(0);
  });

  it("brings the bonds round over WRITE_MS a step at a time, each step from where the one before had come", () => {
    expect(WRITE_MS).toBe(120);
    const first = { n: 1, text: "O", items: [], since: 0, hidden: true };
    const next = { n: 2, text: "OM", items: [], since: 60, was: first, hidden: true };
    expect(writingAt(first, 0).k).toBe(0);
    // (eased in and out: gentle off the start, half way at half the time)
    expect(writingAt(first, 10).k).toBeLessThan(0.01);
    expect(writingAt(first, 60).k).toBeCloseTo(0.5, 9);
    const at = writingAt(next, 90);
    expect(at.k).toBeGreaterThan(0);
    expect(at.was?.k).toBeGreaterThan(writingAt(first, 60).k);
    // (there: what it came from let go)
    expect(writingAt(next, 60 + WRITE_MS)).toEqual({ items: [], k: 1, hidden: true });
    expect(writeMoving(next, 100)).toBe(true);
    expect(writeMoving(next, 60 + WRITE_MS)).toBe(false);
  });
});

describe("a short motion's clock, counted by the frames drawn", () => {
  it("takes a frame slow to come no further than one on time - a busy canvas skips none of the motion", () => {
    const c = frameClock();
    c.tick(1 / 60);
    expect(c.now()).toBeCloseTo(1000 / 60, 9);
    // (a tenth of a second late: a 60th of one)
    c.tick(0.1);
    expect(c.now()).toBeCloseTo(2000 / 60, 9);
    // (a 120 Hz display's frames as they come)
    c.tick(1 / 120);
    expect(c.now()).toBeCloseTo(2000 / 60 + 1000 / 120, 9);
  });
});
