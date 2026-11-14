import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { bondKeyOf, bondKeyPatch, bondKindOf, bondKindPatch, bondLie, COMMON_BOND_KINDS, doubleClickPatch, doubleSideAuto, OTHER_BOND_KINDS, singleRoundPatch, type BondKindName } from "./bondKinds";

const ALL: BondKindName[] = [...COMMON_BOND_KINDS, ...OTHER_BOND_KINDS];

describe("the kinds a bond's menu chooses among", () => {
  it("each kind reads back as itself, from every other kind a bond may have been", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const bond = bondKindPatch(from);
        const made = { ...bond, ...bondKindPatch(to) };
        expect(bondKindOf(made), `${from} -> ${to}`).toBe(to);
      }
    }
  });

  it("is a perspective bond's none, and a plain single's single", () => {
    expect(bondKindOf({ order: 1, display: "wedge" })).toBeNull();
    expect(bondKindOf({ order: 1 })).toBe("single");
  });

  it("is chosen for every bond selected at once, as one undo step, keeping what else the bond has", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(1, 0, "C");
    const c = st().addAtom(2, 0, "C");
    const ab = st().addBond(a, b);
    const bc = st().addBond(b, c);
    st().updateBond(ab, { color: "#ff0000", narrow: a });
    const before = doc.history().undoDepth;
    st().setBondsKind([ab, bc], "wedge");
    const kinds = () => st().model.bonds.map((x) => bondKindOf(x));
    expect(kinds()).toEqual(["wedge", "wedge"]);
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(st().model.bonds[0]).toMatchObject({ color: "#ff0000", narrow: a });
    doc.undo();
    expect(kinds()).toEqual(["single", "single"]);
    st().setBondsKind([ab], "dative");
    expect(kinds()).toEqual(["dative", "single"]);
  });
});

describe("a click on a single bond", () => {
  it("cycles plain, wedge, hashed wedge and plain again, the other end narrow the second time round", () => {
    const b = { a: 1, b: 2, stereo: "none" as const };
    expect(singleRoundPatch(b, 1)).toMatchObject({ stereo: "up", narrow: 1 });
    expect(singleRoundPatch({ ...b, stereo: "up" }, 1)).toMatchObject({ stereo: "down", narrow: 1 });
    expect(singleRoundPatch({ ...b, stereo: "down" }, 1)).toMatchObject({ stereo: "none", narrow: 2 });
    expect(singleRoundPatch({ ...b, stereo: "none" }, 2)).toMatchObject({ stereo: "up", narrow: 2 });
  });

  it("takes a bond of another kind out of it - wavy, bold, hashed, dashed, dative - to plain, so it can be cycled", () => {
    expect(singleRoundPatch({ a: 1, b: 2, stereo: "wavy" }, 1)).toMatchObject({ stereo: "none" });
    for (const kind of ["bold", "hashed", "dashed", "dative"] as const) {
      const made = bondKindPatch(kind);
      const patch = singleRoundPatch({ a: 1, b: 2, ...made }, 1);
      const after = { ...made, ...patch };
      expect(bondKindOf(after)).toBe("single");
    }
  });
});

/** A chain of three carbons, A-B-C, its bonds' ids, and the store it is drawn in. */
function chain() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const a = st().addAtom(0, 0, "C");
  const b = st().addAtom(1, 0.5, "C");
  const c = st().addAtom(2, 0, "C");
  return { doc, st, ab: st().addBond(a, b), bc: st().addBond(b, c) };
}

describe("a double-click on a bond", () => {
  it("makes any other a plain double on its own side; a double, drawn on its next side, never one that looks as it does", () => {
    const atoms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 1.5, y: 0.87 },
    ];
    const bonds = [
      { id: 10, a: 1, b: 2 },
      { id: 11, a: 2, b: 3 },
    ];
    expect(doubleClickPatch({ ...bonds[0], order: 1 }, atoms, bonds)).toMatchObject({ order: 2, doubleMode: "auto", stereo: "none" });
    // (its neighbour stands left of it: drawn on the left by itself - so the middle next, then the right, then by itself)
    const sides: string[] = [];
    let mode: "auto" | "left" | "center" | "right" = "auto";
    for (let i = 0; i < 4; i++) {
      mode = doubleClickPatch({ ...bonds[0], order: 2, doubleMode: mode }, atoms, bonds).doubleMode!;
      sides.push(mode);
    }
    expect(sides).toEqual(["center", "right", "auto", "center"]);
  });
});

describe("the side a double bond is drawn on by itself", () => {
  const bond = { id: 10, a: 1, b: 2 };
  const ends = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 1, y: 0 },
  ];
  const on = (...more: { id: number; x: number; y: number; to: number }[]) => ({
    atoms: [...ends, ...more],
    bonds: [bond, ...more.map((m, k) => ({ id: 20 + k, a: m.to, b: m.id }))],
  });
  it("is the side more neighbours stand on - the middle where as many stand on each, or none stands off the line", () => {
    const left = on({ id: 3, x: -0.5, y: 0.87, to: 1 });
    expect(doubleSideAuto(bond, left.atoms, left.bonds)).toBe("left");
    const both = on({ id: 3, x: -0.5, y: 0.87, to: 1 }, { id: 4, x: 1.5, y: -0.87, to: 2 });
    expect(doubleSideAuto(bond, both.atoms, both.bonds)).toBe("center");
    // (a neighbour all but on the bond's line - off it by a hair - stands on neither side; one off it by a tenth, on its side)
    const hair = on({ id: 3, x: -1, y: 0.01, to: 1 });
    expect(doubleSideAuto(bond, hair.atoms, hair.bonds)).toBe("center");
    const tenth = on({ id: 3, x: -1, y: -0.1, to: 1 });
    expect(doubleSideAuto(bond, tenth.atoms, tenth.bonds)).toBe("right");
  });
});

describe("the bond keys", () => {
  it("are 1, 2 and 3 by the key pressed - on the top row or the keypad, an input method on or Shift held - and no chord", () => {
    expect(bondKeyOf({ code: "Digit2" })).toBe(2);
    expect(bondKeyOf({ code: "Numpad3" })).toBe(3);
    expect(bondKeyOf({ code: "Digit1" })).toBe(1);
    for (const e of [{ code: "Digit4" }, { code: "KeyA" }, { code: "Digit1", metaKey: true }, { code: "Digit1", ctrlKey: true }, { code: "Digit2", altKey: true }, { code: "Digit2", repeat: true }]) {
      expect(bondKeyOf(e), JSON.stringify(e)).toBeNull();
    }
  });

  it("2 makes a bond double and, pressed again, turns it to its next side as double-clicks do; 3 a triple; 1 a single again", () => {
    const { st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    expect(st().bondKey(ab, 2)).toBe(true);
    expect(bond()).toMatchObject({ order: 2, doubleMode: "auto" });
    st().bondKey(ab, 2);
    expect(bond().order).toBe(2);
    expect(bond().doubleMode).not.toBe("auto");
    st().bondKey(ab, 3);
    expect(bondKindOf(bond())).toBe("triple");
    expect(st().bondKey(ab, 3)).toBe(false);
    st().bondKey(ab, 1);
    expect(bondKindOf(bond())).toBe("single");
  });

  it("1 on a single goes round - wedge, hashed wedge, plain with the other end narrow", () => {
    const { st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    st().bondKey(ab, 1);
    expect(bondKindOf(bond())).toBe("wedge");
    const narrow = bond().narrow!;
    st().bondKey(ab, 1);
    expect(bondKindOf(bond())).toBe("hashed-wedge");
    st().bondKey(ab, 1);
    expect(bond()).toMatchObject({ stereo: "none", narrow: narrow === bond().a ? bond().b : bond().a });
  });

  it("make a plain bond of the kind asked: a dative or bold bond made double - by 2 or a double-click - a wedge made triple, a crossed double turned to its side", () => {
    const atoms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
    ];
    const link = { id: 10, a: 1, b: 2 };
    for (const from of [bondKindPatch("dative"), bondKindPatch("bold")]) {
      const b = { ...link, ...from };
      for (const patch of [doubleClickPatch(b, atoms, [link]), bondKeyPatch(2, b, atoms, [link])]) {
        const made = { ...b, ...patch };
        expect(bondKindOf(made)).toBe("double");
        expect(made).toMatchObject({ dative: undefined, display: undefined, stereo: "none" });
      }
    }
    expect({ ...link, ...bondKindPatch("wedge"), ...bondKeyPatch(3, { ...link, ...bondKindPatch("wedge") }, atoms, [link]) }).toMatchObject({ order: 3, stereo: "none" });
    const crossed = { ...link, order: 2 as const, stereo: "either" as const };
    expect({ ...crossed, ...bondKeyPatch(2, crossed, atoms, [link]) }).toMatchObject({ order: 2, stereo: "none" });
  });

  it("are no step where a bond is already what the key makes - a triple with no stereo set pressed 3", () => {
    const { doc, st, ab } = chain();
    st().updateBond(ab, { order: 3, stereo: undefined });
    const before = doc.history().undoDepth;
    expect(st().bondKey(ab, 3)).toBe(false);
    expect(doc.history().undoDepth).toBe(before);
  });

  it("change the one bond under the pointer and no other, selected or not, as one undo step (the maintainer, 2026-11-14)", () => {
    const { doc, st, ab, bc } = chain();
    const kinds = () => st().model.bonds.map((x) => bondKindOf(x));
    st().updateBond(bc, { order: 2 });
    // (both selected, the pointer on one: that one alone)
    st().setSel({ atoms: new Set(), bonds: new Set([ab, bc]) });
    const before = doc.history().undoDepth;
    st().bondKey(ab, 3);
    expect(kinds()).toEqual(["triple", "double"]);
    expect(doc.history().undoDepth).toBe(before + 1);
    doc.undo();
    expect(kinds()).toEqual(["single", "double"]);
    // (another bond selected, the pointer on one not selected: that one alone, the selection as it was)
    st().setSel({ atoms: new Set(), bonds: new Set([bc]) });
    st().bondKey(ab, 2);
    expect(kinds()).toEqual(["double", "double"]);
    expect([...st().sel.bonds]).toEqual([bc]);
    // (1 on a bond among those selected: a wedge on it alone)
    doc.undo();
    st().setSel({ atoms: new Set(), bonds: new Set([ab, bc]) });
    st().updateBond(bc, { order: 1 });
    st().bondKey(ab, 1);
    expect(kinds()).toEqual(["wedge", "single"]);
  });
});

describe("a click on a bond", () => {
  it("selects it, alone, with its atoms - what was selected let go - and never changes the compound (the maintainer, 2026-11-14)", () => {
    const { doc, st, ab, bc } = chain();
    const was = doc.getState().model;
    const depth = doc.history().undoDepth;
    const bond = st().model.bonds.find((x) => x.id === bc)!;
    st().setSel({ atoms: new Set([bond.b]), bonds: new Set([ab]) });
    st().clickSelectBond(bc);
    expect([[...st().sel.bonds], [...st().sel.atoms].sort()]).toEqual([[bc], [bond.a, bond.b].sort()]);
    expect(doc.getState().model).toBe(was);
    expect(doc.history().undoDepth).toBe(depth);
    // (and again: the same, still nothing changed)
    st().clickSelectBond(bc);
    expect([...st().sel.bonds]).toEqual([bc]);
    expect(doc.getState().model).toBe(was);
  });
});

describe("a bond's own kind chosen again from its menu", () => {
  it("goes one step on in that kind's round: a wedge narrow at its other end, a double bond's second line on its next side; a single as it was, no step", () => {
    const { doc, st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    st().setBondsKind([ab], "wedge");
    const narrow = bondLie(bond(), st().model.atoms, st().model.bonds).narrowLeft;
    expect(st().setBondsKind([ab], "wedge", true)).toBe(true);
    expect(bondKindOf(bond())).toBe("wedge");
    // (the icon drawn the other way round: the same bond, narrow at its other end)
    expect(bondLie(bond(), st().model.atoms, st().model.bonds).narrowLeft).toBe(!narrow);
    st().setBondsKind([ab], "double");
    const sides = [bond().doubleMode ?? "auto"];
    for (let k = 0; k < 3; k++) {
      st().setBondsKind([ab], "double", true);
      sides.push(bond().doubleMode ?? "auto");
    }
    // (each press a side that looks other than the one before - as the double-click's round)
    for (let k = 1; k < sides.length; k++) expect(sides[k]).not.toBe(sides[k - 1]);
    st().setBondsKind([ab], "single");
    const depth = doc.history().undoDepth;
    expect(st().setBondsKind([ab], "single", true)).toBe(false);
    expect(doc.history().undoDepth).toBe(depth);
  });

  it("with bonds selected: each wedge turns about itself and the plain bond becomes a wedge, one undo step", () => {
    const { doc, st, ab, bc } = chain();
    const bond = (id: number) => st().model.bonds.find((x) => x.id === id)!;
    st().setBondsKind([ab], "wedge");
    const narrowAb = bondLie(bond(ab), st().model.atoms, st().model.bonds).narrowLeft;
    const depth = doc.history().undoDepth;
    st().setBondsKind([ab, bc], "wedge", true);
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect([bondKindOf(bond(ab)), bondKindOf(bond(bc))]).toEqual(["wedge", "wedge"]);
    expect(bondLie(bond(ab), st().model.atoms, st().model.bonds).narrowLeft).toBe(!narrowAb);
  });

  it("is drawn in the menu as the bond lies: a wedge narrow at the left or right, a double bond's second line above or below", () => {
    const atoms = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 1.5, y: 0.87 },
    ];
    const bonds = [
      { id: 10, a: 1, b: 2 },
      { id: 11, a: 2, b: 3 },
    ];
    // (bond 10 runs 1 to 2, left to right: narrow at 1 is the icon's left; at 2, its right)
    expect(bondLie({ ...bonds[0], narrow: 1 }, atoms, bonds).narrowLeft).toBe(true);
    expect(bondLie({ ...bonds[0], narrow: 2 }, atoms, bonds).narrowLeft).toBe(false);
    // (the same bond written 2 to 1: the same as it lies)
    expect(bondLie({ id: 10, a: 2, b: 1, narrow: 1 }, atoms, bonds).narrowLeft).toBe(true);
    // (its second line toward atom 3, above it, y up: the icon's upper side - either way the bond is written)
    expect(bondLie({ ...bonds[0], doubleMode: "auto" }, atoms, bonds).side).toBe("upper");
    expect(bondLie({ id: 10, a: 2, b: 1, doubleMode: "auto" }, atoms, bonds).side).toBe("upper");
    expect(bondLie({ ...bonds[0], doubleMode: "right" }, atoms, bonds).side).toBe("lower");
    expect(bondLie({ ...bonds[0], doubleMode: "center" }, atoms, bonds).side).toBe("center");
  });
});
