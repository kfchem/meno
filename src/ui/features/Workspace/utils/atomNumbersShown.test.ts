import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { readRecord, recordText } from "./copyPaste";
import { readWorkspace, workspaceText } from "./workspace";
import { numbersItemsFor } from "./atomNumbersShown";
import { numbersShownOn } from "./atomNumbers";

// (a molecule in 3D of three atoms, the first mapped)
function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const m3d: Omit<Molecule3D, "id"> = {
    atoms: [
      { el: "C", x: 0, y: 0, z: 0, map: 1 },
      { el: "C", x: 1.5, y: 0, z: 0 },
      { el: "O", x: 2.2, y: 1.2, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
    ],
    at: { x: 30, y: 0 },
  };
  st().pasteModel({ atoms: [], bonds: [], molecules3d: [m3d] });
  return { doc, st, id: st().molecules3d[0].id };
}
const on = (m: Molecule3D) => [...numbersShownOn(m)];

describe("atom numbers on a molecule in 3D", () => {
  it("are shown on all of it, one undo step, and then offered to be hidden", () => {
    const { doc, st, id } = editor();
    const at = { kind: "molecule3d", id, selection: "none" as const };
    const got = numbersItemsFor(st(), at)!;
    expect(got.items.map((i) => i.name)).toEqual(["Show atom numbers"]);
    st().setAtomNumbers(got.items[0].of, true);
    expect(st().molecules3d[0].atomNumbers).toEqual({ kind: "order" });
    expect(doc.history().undoLabel).toBe("show atom numbers");
    expect(numbersItemsFor(st(), at)!.items[0].name).toBe("Hide atom numbers");
    doc.undo();
    expect(st().molecules3d[0].atomNumbers).toBeUndefined();
  });

  it("on the atom right-clicked alone, or on those chosen in it", () => {
    const { st, id } = editor();
    const got = numbersItemsFor(st(), { kind: "molecule3d", id, selection: "none", atom: 2 })!;
    expect(got.items.map((i) => i.name)).toEqual(["Show atom numbers", "Show this atom's number"]);
    st().setAtomNumbers(got.items[1].of, true);
    expect(on(st().molecules3d[0])).toEqual([0, 0, 1]);
    const chosen = numbersItemsFor({ ...st(), chosen3d: { id, atoms: [0, 2], bonds: [] } }, { kind: "molecule3d", id, selection: "none", atom: 2 })!;
    expect(chosen.items).toEqual([{ name: "Show atom numbers", show: true, of: [{ id, atoms: [0, 2] }] }]);
    st().setAtomNumbers(chosen.items[0].of, true);
    expect(on(st().molecules3d[0])).toEqual([1, 0, 1]);
    // (all shown: kept as all)
    st().setAtomNumbers([{ id, atoms: [1] }], true);
    expect(st().molecules3d[0].atomNumbers).toEqual({ kind: "order" });
    st().setAtomNumbers([{ id, atoms: [1] }], false);
    expect(st().molecules3d[0].atomNumbers).toEqual({ kind: "order", atoms: [0, 2] });
  });

  it("offer the atom map where the molecule has one, and keep the kind chosen", () => {
    const { st, id } = editor();
    const at = { kind: "molecule3d", id, selection: "none" as const };
    expect(numbersItemsFor(st(), at)!.kinds).toEqual([]);
    st().setAtomNumbers([{ id }], true);
    const kinds = numbersItemsFor(st(), at)!.kinds;
    expect(kinds.map((k) => [k.name, k.checked])).toEqual([
      ["Atom order", true],
      ["Atom map", false],
    ]);
    st().setAtomNumberKind(kinds[1].molecules, "map");
    expect(st().molecules3d[0].atomNumbers).toEqual({ kind: "map" });
  });

  it("are kept by the workspace's file and carried by a copy; a kind not known is not read", () => {
    const { st, id } = editor();
    st().setAtomNumbers([{ id, atoms: [2, 0] }], true);
    const ws = readWorkspace(workspaceText(st()))!;
    expect(ws.drawn.molecules3d?.[0].atomNumbers).toEqual({ kind: "order", atoms: [0, 2] });
    const ms = st().molecules3d.map(({ id: _id, ...m }) => m);
    expect(readRecord(recordText({ atoms: [], bonds: [], molecules3d: ms } as never))!.molecules3d?.[0].atomNumbers).toEqual({ kind: "order", atoms: [0, 2] });
    const odd = ms.map((m) => ({ ...m, atomNumbers: { kind: "roman" } }));
    expect(readRecord(recordText({ atoms: [], bonds: [], molecules3d: odd } as never))!.molecules3d?.[0].atomNumbers).toBeUndefined();
  });
});
