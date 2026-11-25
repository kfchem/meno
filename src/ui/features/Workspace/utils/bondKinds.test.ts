import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { bondKeyOf, bondKeyPatch, bondKindMenu, bondKindOf, bondKindPatch, bondLie, COMMON_BOND_KINDS, doubleClickPatch, doubleSideAuto, OTHER_BOND_KINDS, singleRoundPatch, type BondKindName } from "./bondKinds";

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

  it("is chosen for every bond selected at once, as one undo step, keeping what else the bond has but its narrow end", () => {
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
    // (its colour kept; the narrow end it carried, at C1, not: a wedge chosen is narrow at the end a fresh one is - C2, which has more bonds)
    expect(st().model.bonds[0]).toMatchObject({ color: "#ff0000", narrow: b });
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
  it("turns its kind as the key 1 does, as one undo step, the selection as it was (the maintainer, 2026-11-17, as until 2026-11-14)", () => {
    const { doc, st, ab, bc } = chain();
    const kind = () => bondKindOf(st().model.bonds.find((x) => x.id === ab)!);
    st().setSel({ atoms: new Set(), bonds: new Set([bc]) });
    const depth = doc.history().undoDepth;
    // (a single bond round: a wedge, a hashed wedge, plain - each one step)
    st().bondClicked(ab, 1);
    expect(kind()).toBe("wedge");
    expect(doc.history().undoDepth).toBe(depth + 1);
    st().bondClicked(ab, 1);
    expect(kind()).toBe("hashed-wedge");
    // (a double or a triple made single)
    st().updateBond(ab, { order: 2, stereo: "none" });
    st().bondClicked(ab, 1);
    expect(kind()).toBe("single");
    st().updateBond(ab, { order: 3, stereo: "none" });
    st().bondClicked(ab, 1);
    expect(kind()).toBe("single");
    // (nothing selected by it: the selection as it was)
    expect([...st().sel.bonds]).toEqual([bc]);
  });
});

describe("a slow double-click on a bond (the maintainer, 2026-11-17)", () => {
  it("its first click's turn taken back and the bond made double from what it was, as one step in all", () => {
    const { doc, st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    const depth = doc.history().undoDepth;
    // (the first click turned it - a wedge - and its second came after the wait, within a double-click's time)
    st().bondClicked(ab, 1);
    expect(bondKindOf(bond())).toBe("wedge");
    expect(st().takeBackTurn(st().model)).toBe(true);
    st().bondClicked(ab, 2);
    expect(bondKindOf(bond())).toBe("double");
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(bondKindOf(bond())).toBe("single");
  });

  it("takes nothing back where the drawing has changed since the turn", () => {
    const { st, ab, bc } = chain();
    st().bondClicked(ab, 1);
    const after = st().model;
    st().updateBond(bc, { order: 2 });
    expect(st().takeBackTurn(after)).toBe(false);
    expect(bondKindOf(st().model.bonds.find((x) => x.id === ab)!)).toBe("wedge");
  });
});

describe("a wedge chosen from a bond's menu", () => {
  /** Propane drawn as a chain: C1 (a), C2 (b, two bonds), C3 (c); bond ab between C1 and C2. A fresh wedge on ab is narrow at C2, its end with more bonds. */
  it("is narrow at the end a fresh wedge is - C2, the end with more bonds - though the click's round left the plain bond narrow at C1", () => {
    for (const kind of ["wedge", "hashed-wedge"] as const) {
      const { st, ab } = chain();
      const bond = () => st().model.bonds.find((x) => x.id === ab)!;
      const c2 = bond().b;
      // (the round: wedge narrow at C2, hashed wedge, then plain with the other end, C1, narrow)
      for (let k = 0; k < 3; k++) st().bondKey(ab, 1);
      expect(bond()).toMatchObject({ stereo: "none", narrow: bond().a });
      st().setBondsKind([ab], kind, true);
      expect(bond(), kind).toMatchObject({ stereo: kind === "wedge" ? "up" : "down", narrow: c2 });
    }
  });

  it("as a hashed wedge, on a wedge its own menu turned about, is narrow at the usual end again; the click's round still turns it", () => {
    const { st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    const [c1, c2] = [bond().a, bond().b];
    st().setBondsKind([ab], "wedge", true);
    expect(bond()).toMatchObject({ stereo: "up", narrow: c2 });
    // (the wedge's own icon pressed again: turned about, narrow at C1)
    st().setBondsKind([ab], "wedge", true);
    expect(bond()).toMatchObject({ stereo: "up", narrow: c1 });
    st().setBondsKind([ab], "hashed-wedge", true);
    expect(bond()).toMatchObject({ stereo: "down", narrow: c2 });
    // (the round from the hashed wedge: plain, narrow at C1 - then a wedge narrow at C1, as the round goes)
    st().bondKey(ab, 1);
    expect(bond()).toMatchObject({ stereo: "none", narrow: c1 });
    st().bondKey(ab, 1);
    expect(bond()).toMatchObject({ stereo: "up", narrow: c1 });
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

describe("clicks on a bond, so many in a row", () => {
  it("two make it double - its first click waits, and turns nothing - again its second line on its next side; three a triple", () => {
    const { st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    // (a double-click: only its second counts - components/BondsPick2D turns the kind on one click once no second has come)
    st().bondClicked(ab, 2);
    expect(bondKindOf(bond())).toBe("double");
    const side = bond().doubleMode ?? "auto";
    st().bondClicked(ab, 2);
    expect(bondKindOf(bond())).toBe("double");
    expect(bond().doubleMode ?? "auto").not.toBe(side);
    st().bondClicked(ab, 3);
    expect(bondKindOf(bond())).toBe("triple");
    // (and one click on the triple: single, as the key 1 makes it)
    st().bondClicked(ab, 1);
    expect(bondKindOf(bond())).toBe("single");
  });
});

describe("a bond's menu as it is opened", () => {
  it("on a bond among those selected: their kind chosen for all, one step - its own kind again each of that kind one step on - its keys hidden", () => {
    const { doc, st, ab, bc } = chain();
    const bond = (id: number) => st().model.bonds.find((x) => x.id === id)!;
    st().setBondsKind([ab], "wedge");
    st().setSel({ atoms: new Set(), bonds: new Set([ab, bc]) });
    const menu = bondKindMenu(st(), ab)!;
    expect(menu.current).toBe("wedge");
    expect(menu.one).toBe(false);
    expect(menu.lie).toEqual(bondLie(bond(ab), st().model.atoms, st().model.bonds));
    const narrow = menu.lie.narrowLeft;
    const depth = doc.history().undoDepth;
    menu.choose("wedge");
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect([bondKindOf(bond(ab)), bondKindOf(bond(bc))]).toEqual(["wedge", "wedge"]);
    expect(bondLie(bond(ab), st().model.atoms, st().model.bonds).narrowLeft).toBe(!narrow);
    bondKindMenu(st(), ab)!.choose("double");
    expect([bondKindOf(bond(ab)), bondKindOf(bond(bc))]).toEqual(["double", "double"]);
  });

  it("on a bond not selected: that bond alone, its keys shown; none on what is no bond", () => {
    const { st, ab, bc } = chain();
    const bond = (id: number) => st().model.bonds.find((x) => x.id === id)!;
    st().setSel({ atoms: new Set(), bonds: new Set([bc]) });
    const menu = bondKindMenu(st(), ab)!;
    expect(menu.one).toBe(true);
    expect(menu.current).toBe("single");
    menu.choose("triple");
    expect([bondKindOf(bond(ab)), bondKindOf(bond(bc))]).toEqual(["triple", "single"]);
    expect(bondKindMenu(st(), 9999)).toBeUndefined();
  });
});

describe("a kind's own round, by kind", () => {
  it("a hashed wedge chosen again is narrow at its other end; a wavy, bold, hashed, dashed or dative bond chosen again, nothing", () => {
    const { st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    st().setBondsKind([ab], "hashed-wedge");
    const narrow = bondLie(bond(), st().model.atoms, st().model.bonds).narrowLeft;
    expect(st().setBondsKind([ab], "hashed-wedge", true)).toBe(true);
    expect(bondKindOf(bond())).toBe("hashed-wedge");
    expect(bondLie(bond(), st().model.atoms, st().model.bonds).narrowLeft).toBe(!narrow);
    for (const kind of OTHER_BOND_KINDS) {
      st().setBondsKind([ab], kind);
      expect(st().setBondsKind([ab], kind, true), kind).toBe(false);
      expect(bondKindOf(bond()), kind).toBe(kind);
    }
  });

  it("lies, for a bond standing upright, with its upper atom at the icon's left", () => {
    const atoms = [
      { id: 1, x: 0, y: 1 },
      { id: 2, x: 0, y: 0 },
    ];
    const bonds = [{ id: 10, a: 1, b: 2 }];
    expect(bondLie({ ...bonds[0], narrow: 1 }, atoms, bonds).narrowLeft).toBe(true);
    expect(bondLie({ ...bonds[0], narrow: 2 }, atoms, bonds).narrowLeft).toBe(false);
    expect(bondLie({ id: 10, a: 2, b: 1, narrow: 1 }, atoms, bonds).narrowLeft).toBe(true);
  });
});
