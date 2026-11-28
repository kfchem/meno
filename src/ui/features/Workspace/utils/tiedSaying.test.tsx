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
    expect(tiedAfter(said, { atoms: [a1, a2, { id: 9 }, atom(10)], bonds: [b12, bond(9, 10)] }).hidden).toBe(false);
  });

  it("is out of sight once a bond comes to end at it anywhere in the list, the count of bonds kept: one taken away after it and one put on at it, or one made anew in place", () => {
    const a10 = atom(10);
    const b910 = bond(9, 10);
    const page = { atoms: [a1, a2, a9, a10], bonds: [b12, b910] };
    const said = tiedTo("words", [1, 2], page)!;
    // (one edit: the 9-10 bond taken away, a bond from 2 to 9 put on - as many bonds as before)
    expect(tiedAfter(said, { atoms: page.atoms, bonds: [b12, bond(2, 9)] }).hidden).toBe(true);
    // (the 9-10 bond made anew where it lay, its end now at 2 - an atom merged onto it, an end dragged to it)
    expect(tiedAfter(said, { atoms: page.atoms, bonds: [b12, bond(2, 10)] }).hidden).toBe(true);
    // (and back as it was with the undo)
    const changed = tiedAfter(said, { atoms: page.atoms, bonds: [b12, bond(2, 10)] });
    expect(tiedAfter(changed, page).hidden).toBe(false);
  });

  it("costs what the structure warned of costs, not the page: an edit elsewhere on a page of thousands reads its atoms alone where the bonds stay, the bonds once where they are made anew, and nothing for what it has seen", () => {
    const many = 5000;
    const atoms = [a1, a2, ...Array.from({ length: many }, (_, i) => atom(100 + i))];
    const bonds = [b12, ...Array.from({ length: many - 1 }, (_, i) => bond(100 + i, 101 + i))];
    const said = tiedTo("words", [1, 2], { atoms, bonds })!;
    // (every element read counted, list by list)
    const reads = { atoms: 0, bonds: 0 };
    const counted = <T,>(list: T[], of: keyof typeof reads) =>
      new Proxy(list, {
        get: (t, k, r) => {
          if (typeof k === "string" && /^\d+$/.test(k)) reads[of]++;
          return Reflect.get(t, k, r);
        },
      });
    const far = (list: typeof atoms) => counted(list.map((a, i) => (i === 3000 ? { id: a.id } : a)), "atoms");
    // (a step of a drag far off, the bonds list kept: its two atoms, where they lay)
    const step = { atoms: far(atoms), bonds };
    const after = tiedAfter(said, step);
    expect(after.hidden).toBe(false);
    expect(reads).toEqual({ atoms: 2, bonds: 0 });
    // (the same drawing again: nothing)
    reads.atoms = 0;
    expect(tiedAfter(after, step)).toBe(after);
    expect(reads).toEqual({ atoms: 0, bonds: 0 });
    // (a step that makes the bonds list anew: its two atoms, and one pass over the bonds)
    const remade = { atoms: far(atoms), bonds: counted([...bonds], "bonds") };
    expect(tiedAfter(after, remade).hidden).toBe(false);
    expect(reads).toEqual({ atoms: 2, bonds: bonds.length });
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
