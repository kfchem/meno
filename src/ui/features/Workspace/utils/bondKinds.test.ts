import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { bondKeyOf, bondKindOf, bondKindPatch, COMMON_BOND_KINDS, doubleClickPatch, OTHER_BOND_KINDS, singleClickPatch, type BondKindName } from "./bondKinds";

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
    st().updateBond(ab, { color: "#ff0000", stereoOrient: "reverse" });
    const before = doc.history().undoDepth;
    st().setBondsKind([ab, bc], "wedge");
    const kinds = () => st().model.bonds.map((x) => bondKindOf(x));
    expect(kinds()).toEqual(["wedge", "wedge"]);
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(st().model.bonds[0]).toMatchObject({ color: "#ff0000", stereoOrient: "reverse" });
    doc.undo();
    expect(kinds()).toEqual(["single", "single"]);
    st().setBondsKind([ab], "dative");
    expect(kinds()).toEqual(["dative", "single"]);
  });
});

describe("a click on a single bond", () => {
  it("cycles plain, wedge, hashed wedge and plain again, the other end narrow the second time round", () => {
    const b = { stereo: "none" as const, stereoOrient: "principle" as const };
    expect(singleClickPatch(b)).toMatchObject({ stereo: "up" });
    expect(singleClickPatch({ ...b, stereo: "up" })).toMatchObject({ stereo: "down" });
    expect(singleClickPatch({ ...b, stereo: "down" })).toMatchObject({ stereo: "none", stereoOrient: "reverse" });
  });

  it("takes a bond of another kind out of it - wavy, bold, hashed, dashed, dative - to plain, so it can be cycled", () => {
    expect(singleClickPatch({ stereo: "wavy" })).toMatchObject({ stereo: "none" });
    for (const kind of ["bold", "hashed", "dashed", "dative"] as const) {
      const made = bondKindPatch(kind);
      const patch = singleClickPatch(made);
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

  it("1 on a single goes round as clicks do - wedge, hashed wedge, plain with the other end narrow", () => {
    const { st, ab } = chain();
    const bond = () => st().model.bonds.find((x) => x.id === ab)!;
    st().bondKey(ab, 1);
    expect(bondKindOf(bond())).toBe("wedge");
    st().bondKey(ab, 1);
    expect(bondKindOf(bond())).toBe("hashed-wedge");
    st().bondKey(ab, 1);
    expect(bond()).toMatchObject({ stereo: "none", stereoOrient: "reverse" });
  });

  it("make every bond selected what the one under the pointer becomes, as one undo step - only that one where it is not selected", () => {
    const { doc, st, ab, bc } = chain();
    const kinds = () => st().model.bonds.map((x) => bondKindOf(x));
    st().updateBond(bc, { order: 2 });
    st().setSel({ atoms: new Set(), bonds: new Set([ab, bc]) });
    const before = doc.history().undoDepth;
    st().bondKey(ab, 3);
    expect(kinds()).toEqual(["triple", "triple"]);
    expect(doc.history().undoDepth).toBe(before + 1);
    doc.undo();
    expect(kinds()).toEqual(["single", "double"]);
    st().setSel({ atoms: new Set(), bonds: new Set([bc]) });
    st().bondKey(ab, 2);
    expect(kinds()).toEqual(["double", "double"]);
  });
});
