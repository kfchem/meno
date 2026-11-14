import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument, stereoShownOf } from "../document";
import type { Molecule3D } from "../store/types";
import { readRecord, recordText } from "./copyPaste";
import { readWorkspace, workspaceText } from "./workspace";
import { stereoItemFor } from "./stereoShown";

// (2-butanol drawn - C2 a stereocentre, three bonds - and but-2-ene beside it; and a molecule in 3D with two labels and a double bond)
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const c1 = st().addAtom(0, 0, "C");
  const c2 = st().addAtom(1.5, 0.9, "C");
  const o = st().addAtom(1.5, 2.7, "O");
  const c3 = st().addAtom(3, 0, "C");
  const c4 = st().addAtom(4.5, 0.9, "C");
  st().addBond(c1, c2, 1);
  st().addBond(c2, o, 1);
  st().addBond(c2, c3, 1);
  st().addBond(c3, c4, 1);
  const e1 = st().addAtom(10, 0, "C");
  const e2 = st().addAtom(11.5, 0.9, "C");
  st().addBond(e1, e2, 2);
  const m3d: Omit<Molecule3D, "id"> = {
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "C", x: 1.5, y: 0, z: 0 },
      { el: "C", x: 2.2, y: 1.2, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
    ],
    at: { x: 30, y: 0 },
    stereo: { atoms: { 0: "R", 1: "S" }, bonds: { 1: "E" }, chosen: { atoms: [1], bonds: [] } },
  };
  st().pasteModel({ atoms: [], bonds: [], molecules3d: [m3d] });
  const bonds = st().model.bonds;
  const bondOf = (a: number, b: number) => bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))!.id;
  return { doc, st, c1, c2, double: bondOf(e1, e2), single: bondOf(c1, c2), m3d: st().molecules3d[0].id };
}

const none = { kind: null, id: null, selection: "none" as const };

describe("R/S and E/Z, shown on what they are asked for on", () => {
  it("are offered on an atom that can be a stereocentre, and on a double bond - nowhere else", () => {
    const { st, c1, c2, double, single } = editor();
    expect(stereoItemFor(st(), { ...none, kind: "atom", id: c2 })).toMatchObject({ name: "Show R/S", show: true, of: { atoms: [c2], bonds: [] } });
    expect(stereoItemFor(st(), { ...none, kind: "atom", id: c1 })).toBeNull();
    expect(stereoItemFor(st(), { ...none, kind: "bond", id: double })).toMatchObject({ name: "Show E/Z", of: { bonds: [double] } });
    expect(stereoItemFor(st(), { ...none, kind: "bond", id: single })).toBeNull();
    expect(stereoItemFor(st(), none)).toBeNull();
  });

  it("are shown on an atom asked, one undo step, and then offered to be hidden", () => {
    const { doc, st, c2 } = editor();
    const show = stereoItemFor(st(), { ...none, kind: "atom", id: c2 })!;
    st().setStereoShown(show.of, show.show);
    expect(st().model.atoms.find((a) => a.id === c2)?.stereoShown).toBe(true);
    expect(doc.history().undoLabel).toBe("show R/S");
    expect(stereoItemFor(st(), { ...none, kind: "atom", id: c2 })).toMatchObject({ name: "Hide R/S", show: false });
    doc.undo();
    expect(st().model.atoms.find((a) => a.id === c2)?.stereoShown).toBeUndefined();
  });

  it("on a selection, take all of it together - the drawing's and the molecules in 3D's", () => {
    const { st, c1, c2, double, m3d } = editor();
    st().setSel({ atoms: new Set([c1, c2]), bonds: new Set([double]) });
    // (and the molecule in 3D with them)
    const sel3d = new Set([m3d]);
    const item = stereoItemFor({ ...st(), sel3d }, { kind: null, id: null, selection: "here" })!;
    expect(item.name).toBe("Show R/S and E/Z");
    expect(item.of).toEqual({ atoms: [c2], bonds: [double], molecules: [{ id: m3d, atoms: [0, 1], bonds: [1] }] });
    st().setStereoShown(item.of, true);
    expect(stereoShownOf(st().molecules3d[0])).toEqual({ atoms: [0, 1], bonds: [1] });
    expect(stereoItemFor({ ...st(), sel3d }, { kind: null, id: null, selection: "here" })!.name).toBe("Hide R/S and E/Z");
  });

  it("in 3D: those its drawing left open shown until it is asked otherwise - its own set then", () => {
    const { st, m3d } = editor();
    expect(stereoShownOf(st().molecules3d[0])).toEqual({ atoms: [1], bonds: [] });
    st().setStereoShown({ molecules: [{ id: m3d, atoms: [1], bonds: [] }] }, false);
    expect(stereoShownOf(st().molecules3d[0])).toEqual({ atoms: [], bonds: [] });
  });

  it("in 3D: act on the whole molecule right-clicked, wherever on it - never the atom under the pointer alone - and say so", () => {
    const { st, m3d } = editor();
    const at = (atom?: number) => ({ kind: "molecule3d", id: m3d, selection: "none" as const, ...(atom != null ? { atom } : {}) });
    const whole = { molecules: [{ id: m3d, atoms: [0, 1], bonds: [1] }] };
    // (one of them shown, as its drawing left it: any shown is hidden at once - from a labelled atom, an unlabelled one, or no atom)
    for (const atom of [0, 1, 2, undefined]) expect(stereoItemFor(st(), at(atom)), `${atom}`).toMatchObject({ name: "Hide R/S and E/Z", show: false, of: whole });
    // (the record's run: all shown, then hidden from a labelled atom - every one goes, as the words said)
    st().setStereoShown(whole, true);
    const hide = stereoItemFor(st(), at(0))!;
    expect(hide.name).toBe("Hide R/S and E/Z");
    st().setStereoShown(hide.of, hide.show);
    expect(stereoShownOf(st().molecules3d[0])).toEqual({ atoms: [], bonds: [] });
    // (none shown: shown, all of them, from any atom)
    for (const atom of [0, 1, 2]) expect(stereoItemFor(st(), at(atom)), `${atom}`).toMatchObject({ name: "Show R/S and E/Z", show: true, of: whole });
    // (some shown, some not - the double bond's E alone: hidden)
    st().setStereoShown({ molecules: [{ id: m3d, atoms: [], bonds: [1] }] }, true);
    expect(stereoItemFor(st(), at(1))).toMatchObject({ name: "Hide R/S and E/Z", show: false });
  });

  it("in 3D: act on what is chosen in the molecule where it is right-clicked on it, its count said; elsewhere on the molecule, all of it", () => {
    const { st, m3d } = editor();
    const at = (atom: number) => ({ kind: "molecule3d", id: m3d, selection: "none" as const, atom });
    st().chooseAtom3d(m3d, 0);
    // (atom 0 chosen, its R not shown)
    expect(stereoItemFor(st(), at(0))).toMatchObject({ name: "Show R/S of 1 atom", show: true, of: { molecules: [{ id: m3d, atoms: [0], bonds: [] }] } });
    // (right-clicked on an atom not chosen: the whole molecule)
    expect(stereoItemFor(st(), at(2))).toMatchObject({ name: "Hide R/S and E/Z", of: { molecules: [{ id: m3d, atoms: [0, 1], bonds: [1] }] } });
    st().chooseAtom3d(m3d, 1);
    expect(stereoItemFor(st(), at(1))!.name).toBe("Hide R/S of 2 atoms");
    // (a bond chosen too: right-clicked on one of its atoms)
    st().chooseBond3d(m3d, 1);
    expect(stereoItemFor(st(), at(2))).toMatchObject({ name: "Hide R/S and E/Z of 2 atoms and 1 bond", of: { molecules: [{ id: m3d, atoms: [0, 1], bonds: [1] }] } });
  });

  it("are kept by the workspace's file and carried by a copy - the drawing's and the 3D's apart", () => {
    const { st, c2, double, m3d } = editor();
    st().setStereoShown({ atoms: [c2], bonds: [double], molecules: [{ id: m3d, atoms: [0], bonds: [] }] }, true);
    const ws = readWorkspace(workspaceText(st()))!;
    expect(ws.drawn.atoms.filter((a) => a.stereoShown).map((a) => a.id)).toEqual([c2]);
    expect(ws.drawn.bonds.filter((b) => b.stereoShown).map((b) => b.id)).toEqual([double]);
    expect(ws.drawn.molecules3d?.[0].stereo?.shown).toEqual({ atoms: [0, 1], bonds: [] });
    const copy = readRecord(recordText({ atoms: st().model.atoms, bonds: st().model.bonds, molecules3d: st().molecules3d.map(({ id: _id, ...m }) => m) } as never))!;
    expect(copy.atoms.filter((a) => a.stereoShown).map((a) => a.id)).toEqual([c2]);
    expect(copy.molecules3d?.[0].stereo?.shown).toEqual({ atoms: [0, 1], bonds: [] });
    // (anything but true is not read as shown)
    const odd = readRecord(recordText({ atoms: [{ ...st().model.atoms[0], stereoShown: "yes" as never }], bonds: [] } as never))!;
    expect(odd.atoms[0].stereoShown).toBeUndefined();
  });
});
