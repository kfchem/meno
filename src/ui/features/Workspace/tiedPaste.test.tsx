import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { connectStoreToDocument, storeOf, type EditorStore } from "./store";
import { createWorkspaceDocument } from "./document";
import { useClipboardActions } from "./clipboardActions";
import { readRecord } from "./utils/copyPaste";
import { dragSelection } from "./utils/dragSelection";
import { tiedCaptionsSettled } from "./utils/tiedCaptions";

// Words that belong to a structure through the page's own copy and paste (the hook as the page runs it, the clipboard
// Meno holds outside the app), then everything that reads their tie: a drag of the pasted copy, deletes, undo and redo.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

const unmounts: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const u of unmounts.splice(0)) await u();
});

async function mounted() {
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  connectStoreToDocument(store, doc);
  const said: string[] = [];
  const out: { clip?: ReturnType<typeof useClipboardActions> } = {};
  function Probe() {
    out.clip = useClipboardActions(store, (m) => said.push(m));
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
  return { doc, store, said, clip: out.clip! };
}

// (an invented bent chain with its words under it)
function drawn(store: EditorStore) {
  store.getState().pasteModel(readRecord(JSON.stringify({
    format: "meno-structure",
    version: 1,
    atoms: [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 3, y: 1, el: "O" },
    ],
    bonds: [
      { id: 4, a: 1, b: 2, order: 1 },
      { id: 5, a: 2, b: 3, order: 1 },
    ],
  }))!);
  const a = store.getState().model.atoms[0];
  store.getState().addCaption("compound Q7", a.x + 1.5, a.y - 4.5, undefined, undefined, undefined, undefined, { of: { atom: a.id } });
  store.getState().clearSel();
}

// (each tie names a live atom; the words one each per structure)
function tiesLive(store: EditorStore) {
  const st = store.getState();
  const ids = new Set(st.model.atoms.map((a) => a.id));
  for (const c of st.captions) if (c.of && "atom" in c.of) expect(ids.has(c.of.atom)).toBe(true);
}

// (a page with a window to drag on: pointer events and frames as the page has them)
function withWindow() {
  const w = new EventTarget() as EventTarget & { requestAnimationFrame: (f: () => void) => number; cancelAnimationFrame: (n: number) => void };
  const frames = new Map<number, () => void>();
  let n = 0;
  w.requestAnimationFrame = (f) => (frames.set(++n, f), n);
  w.cancelAnimationFrame = (k) => void frames.delete(k);
  (globalThis as { window?: unknown }).window = w;
  const fire = (type: string, x: number, y: number) => {
    const ev = Object.assign(new Event(type), { clientX: x, clientY: y, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, button: 0 });
    w.dispatchEvent(ev);
    for (const [k, f] of [...frames]) {
      frames.delete(k);
      f();
    }
  };
  return { fire, done: () => delete (globalThis as { window?: unknown }).window };
}

describe("words that belong to a structure, copied and pasted by the page", () => {
  it("a pasted copy belongs to the pasted structure, and dragged, deleted, undone and redone, every tie names a drawn atom", async () => {
    const { doc, store, said, clip } = await mounted();
    drawn(store);
    const first = store.getState().model.atoms[0].id;
    store.getState().selectStructure(first);
    await act(async () => void (await clip.copy()));
    await act(async () => void (await clip.paste({ x: 30, y: 0 })));
    await act(async () => void (await clip.paste({ x: 30, y: 0 })));
    expect(said).toEqual([]);
    const st = store.getState();
    expect(st.captions.length).toBe(3);
    tiesLive(store);
    // (each copy its own words)
    const owners = st.captions.map((c) => (c.of && "atom" in c.of ? c.of.atom : -1));
    expect(new Set(owners).size).toBe(3);
    // (the last copy - selected as pasted - dragged by (5, -2))
    const pasted = st.captions[st.captions.length - 1];
    const atomsBefore = st.model.atoms.filter((a) => st.sel.atoms.has(a.id)).map((a) => ({ ...a }));
    const win = withWindow();
    try {
      dragSelection(store, (x, y) => ({ x, y }), { x: 0, y: 0 }, () => undefined);
      win.fire("pointermove", 2, -1);
      win.fire("pointermove", 5, -2);
      win.fire("pointerup", 5, -2);
    } finally {
      win.done();
    }
    const after = store.getState();
    // (as far as the pointer went - lined up with what is near by a little: utils/guiding)
    const first0 = after.model.atoms.find((x) => x.id === atomsBefore[0].id)!;
    const d = { x: first0.x - atomsBefore[0].x, y: first0.y - atomsBefore[0].y };
    expect(Math.hypot(d.x - 5, d.y + 2)).toBeLessThan(0.5);
    for (const a of atomsBefore) {
      const b = after.model.atoms.find((x) => x.id === a.id)!;
      expect(b.x - a.x).toBeCloseTo(d.x, 9);
      expect(b.y - a.y).toBeCloseTo(d.y, 9);
    }
    const moved = after.captions.find((c) => c.id === pasted.id)!;
    expect(moved.x - pasted.x).toBeCloseTo(d.x, 9);
    expect(moved.y - pasted.y).toBeCloseTo(d.y, 9);
    tiesLive(store);
    // (the copy deleted, then the original; undone and redone)
    store.getState().deleteSelection();
    tiesLive(store);
    expect(store.getState().captions.length).toBe(2);
    store.getState().selectStructure(first);
    store.getState().deleteSelection();
    expect(store.getState().captions.length).toBe(1);
    for (let k = 0; k < 6; k++) {
      doc.undo();
      tiesLive(store);
    }
    for (let k = 0; k < 6; k++) {
      doc.redo();
      tiesLive(store);
    }
    // (cut, then pasted)
    const left = store.getState().model.atoms[0].id;
    store.getState().selectStructure(left);
    await act(async () => void (await clip.cut()));
    tiesLive(store);
    await act(async () => void (await clip.paste({ x: 0, y: 0 })));
    tiesLive(store);
    expect(store.getState().captions.filter((c) => c.of).length).toBeGreaterThan(0);
    // (the settle read on every state the history holds, as a frame reads it)
    expect(() => tiedCaptionsSettled(doc.getState(), undefined)).not.toThrow();
  });
});
