import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import { bondKindOf, bondKindPatch, COMMON_BOND_KINDS, OTHER_BOND_KINDS, singleClickPatch, type BondKindName } from "./bondKinds";

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
