/**
 * An electron-pushing arrow begun from the right-click menu of an atom
 * (docs/EDITOR-2D.md, *Electron-pushing arrows*), drawn into a scene without
 * WebGL: the right-click selects the atom, the menu's entry begins the arrow
 * from it, and the arrow then follows the pointer to the atom under it and
 * is put down by a click there - as one begun from Quick Add's *Scheme* row,
 * once its first atom is pressed (PushDraw2D).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import { DrawnLayoutContext, type DrawnLayout } from "./drawnLayoutContext";
import { editorLayoutOptions } from "../layoutOptions";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { pushFromMenu } from "../utils/menuTarget";
import PushDraw2D from "./PushDraw2D";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** The canvas the pointer is over. */
const canvasEl = { style: {} as Record<string, string>, dataset: {}, addEventListener: () => undefined, removeEventListener: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };

/** A renderer that draws nothing. */
function nothingDrawn(): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { render: none, getPixelRatio: () => 1, domElement: canvasEl, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

// (the window's listeners, by type: the pointer's moves and presses handed to them as the window would)
const listening = new Map<string, Set<(e: unknown) => void>>();
const pointer = (type: string, at: { clientX: number; clientY: number }, button = 0) => {
  const e = { ...at, button, target: canvasEl, preventDefault: () => undefined, stopPropagation: () => undefined };
  for (const f of [...(listening.get(type) ?? [])]) f(e);
};

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  listening.clear();
  vi.unstubAllGlobals();
});

describe("an electron-pushing arrow from an atom's right-click menu", () => {
  it("follows the pointer to the atom under it and is put down by a click there, a fishhook as the entry chosen", async () => {
    vi.stubGlobal("window", {
      addEventListener: (type: string, f: (e: unknown) => void) => void (listening.get(type) ?? listening.set(type, new Set()).get(type)!).add(f),
      removeEventListener: (type: string, f: (e: unknown) => void) => void listening.get(type)?.delete(f),
      setTimeout,
      clearTimeout,
      devicePixelRatio: 1,
    });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const B = NOMINAL_BOND_LENGTH;
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    const st = () => store.getState();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(B, 0, "C");
    const c = st().addAtom(2 * B, 0.5 * B, "C");
    st().addBond(a, b, 1);
    st().addBond(b, c, 1);
    // (the right-click on the atom: it selected alone, the menu its - and the menu's "Fishhook arrow" chosen)
    st().selectAlone("atom", a);
    const from = pushFromMenu({ kind: "atom", id: a });
    expect(from).toEqual({ atom: a });
    st().setPushDraw({ from, half: true, pointer: { x: 0, y: 0 }, to: null });

    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
    const model = doc.getState().model;
    const atoms = model.atoms.map((x) => ({ id: x.id, x: x.x, y: x.y, el: x.el }));
    const bonds = model.bonds.map((x) => ({ a: atoms.findIndex((y) => y.id === x.a), b: atoms.findIndex((y) => y.id === x.b), order: x.order }));
    const laid = { atoms, bonds, opts, layout: { texts: [], lines: [] }, laidAt: 1 } as unknown as DrawnLayout;
    const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const root = createRoot(canvas);
    await act(async () => {
      await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
      root.render(
        <EditorProvider tabId="t" document={doc}>
          <DrawnLayoutContext.Provider value={laid}>
            <PushDraw2D />
          </DrawnLayoutContext.Provider>
        </EditorProvider>,
      );
    });
    mounted.push(() => act(async () => void root.unmount()));
    expect(listening.get("pointermove")?.size).toBe(1);

    // (the pointer, button up, onto the third atom: the arrow comes to it)
    store.setState({ hovered: { atomId: c, bondId: null } });
    await act(async () => pointer("pointermove", { clientX: 500, clientY: 250 }));
    expect(st().pushDraw).toMatchObject({ from: { atom: a }, half: true, to: { atom: c } });
    expect(st().pushes).toHaveLength(0);

    // (a click there: put down, one step - a fishhook from the atom right-clicked to the one under the pointer)
    await act(async () => pointer("pointerdown", { clientX: 500, clientY: 250 }));
    expect(st().pushDraw).toBeNull();
    expect(st().pushes).toHaveLength(1);
    expect(st().pushes[0]).toMatchObject({ from: { atom: a }, to: { atom: c }, half: true });
    // (one step: undone at once)
    await act(async () => void doc.undo());
    expect(st().pushes).toHaveLength(0);
  });
});
