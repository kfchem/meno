import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act, useState } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import { tiedAfter, tiedTo, useTiedSaying } from "./tiedSaying";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A drawing: atoms of these ids, each its own object, and bonds between them. */
const atom = (id: number) => ({ id });
const bond = (a: number, b: number) => ({ a, b });

describe("a warning tied to the structure it is about, as it was", () => {
  const a1 = atom(1);
  const a2 = atom(2);
  const a9 = atom(9);
  const b12 = bond(1, 2);
  const was = { atoms: [a1, a2, a9], bonds: [b12] };

  it("is out of sight once an undo has the structure gone, and back as a redo brings it as it was", () => {
    const said = tiedTo("words", [1, 2], was)!;
    expect(said.hidden).toBe(false);
    const undone = tiedAfter(said, { atoms: [a9], bonds: [] });
    expect(undone.hidden).toBe(true);
    expect(tiedAfter(undone, was).hidden).toBe(false);
  });

  it("is out of sight once the structure is changed - an atom moved, a bond added at it - while some of it is left, and back with it", () => {
    const said = tiedTo("words", [1, 2], was)!;
    // (an atom of it moved: a new object for it)
    expect(tiedAfter(said, { atoms: [a1, { id: 2 }, a9], bonds: [b12] }).hidden).toBe(true);
    // (a bond put on at it)
    expect(tiedAfter(said, { atoms: [a1, a2, a9], bonds: [b12, bond(2, 9)] }).hidden).toBe(true);
    // (one of its bonds gone, its atoms left)
    expect(tiedAfter(said, { atoms: [a1, a2, a9], bonds: [] }).hidden).toBe(true);
  });

  it("stays through an edit elsewhere: what it is about kept as it was", () => {
    const said = tiedTo("words", [1, 2], was)!;
    expect(tiedAfter(said, { atoms: [a1, a2, { id: 9 }, atom(10)], bonds: [b12, bond(9, 10)] })).toBe(said);
  });

  it("about no atoms, is tied to nothing - shown as any other words; said after an undo took its atoms, out of sight from the first", () => {
    expect(tiedTo("words", [], was)).toBeNull();
    expect(tiedTo("words", [7], was)!.hidden).toBe(true);
  });
});

const unmounts: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const u of unmounts.splice(0)) await u();
});

/** The line's words mounted as the canvas has them, on a workspace with a C-C drawn; and what it shows now. */
async function mounted() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const c1 = st().addAtom(0, 0, "C");
  const c2 = st().addAtom(1.5, 0, "C");
  st().addBond(c1, c2);
  const out: { shown: string | null; sayAbout?: (text: string, atoms: Iterable<number>) => void } = { shown: null };
  function Probe() {
    const [said, setSaid] = useState<string | null>(null);
    const { shown, sayAbout } = useTiedSaying(doc, said, setSaid);
    out.shown = shown;
    out.sayAbout = sayAbout;
    return null;
  }
  const canvas = { style: {}, width: 10, height: 10, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const none = () => undefined;
  const gl = new Proxy({ render: none, getPixelRatio: () => 1, domElement: { style: {}, addEventListener: none, removeEventListener: none }, xr: { enabled: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === "then" ? undefined : none),
  });
  await act(async () => {
    await root.configure({ gl: gl as never, size: { width: 10, height: 10, top: 0, left: 0 }, frameloop: "never" });
    root.render(<Probe />);
  });
  unmounts.push(() => act(async () => void root.unmount()));
  return { doc, st, out, atoms: [c1, c2] };
}

describe("the chemistry's line with a warning tied to a structure", () => {
  it("shows it; hides it as an undo takes the structure; shows it again with the redo; hides it as the structure is changed, back with that edit's undo", async () => {
    const { doc, st, out, atoms } = await mounted();
    await act(async () => out.sayAbout!("Clean-up left C2H6 as drawn: made-up words.", atoms));
    expect(out.shown).toBe("Clean-up left C2H6 as drawn: made-up words.");
    // (an edit elsewhere: still said)
    await act(async () => void st().addAtom(9, 9, "O"));
    expect(out.shown).toBe("Clean-up left C2H6 as drawn: made-up words.");
    await act(async () => void doc.undo());
    await act(async () => void doc.undo());
    expect(out.shown).toBeNull();
    await act(async () => void doc.redo());
    expect(out.shown).toBe("Clean-up left C2H6 as drawn: made-up words.");
    // (a bond put on at one of its atoms: the structure is another now)
    await act(async () => void st().addAtomBonded(atoms[1], 3, 0));
    expect(out.shown).toBeNull();
    await act(async () => void doc.undo());
    expect(out.shown).toBe("Clean-up left C2H6 as drawn: made-up words.");
  });

  it("shows a warning about no atoms as any other", async () => {
    const { out } = await mounted();
    await act(async () => out.sayAbout!("Select the atoms first, in made-up words.", []));
    expect(out.shown).toBe("Select the atoms first, in made-up words.");
  });
});
