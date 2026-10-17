/**
 * Electron-pushing arrows on the page as a zoom goes (PushArrows2D), drawn
 * into a scene without WebGL: a zoom, the drawing laid out again the same at
 * each frame of it, lays the arrows out no more, and draws nothing of them
 * not seen (the maintainer, 2026-10-16: with arrows on the page, a zoom
 * stuttered).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend } from "@react-three/fiber";
import { EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import { DrawnLayoutContext, DrawnZoomContext, drawnZoomOf, type DrawnLayout } from "./drawnLayoutContext";
import { editorLayoutOptions } from "../layoutOptions";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import * as pushes from "../utils/pushes";
import PushArrows2D from "./PushArrows2D";

// (each laying out of the arrows counted)
const laidOut = vi.hoisted(() => ({ n: 0 }));
vi.mock("../utils/pushes", async (real) => {
  const m = await real<typeof pushes>();
  return { ...m, pushShapes: (...a: Parameters<typeof m.pushShapes>) => (laidOut.n++, m.pushShapes(...a)) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

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
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
});

describe("arrows on the page as the view zooms", () => {
  it("are laid out once, however often the drawing is laid out again the same, and their unlit bands not drawn", async () => {
    const B = NOMINAL_BOND_LENGTH;
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    const st = () => store.getState();
    const a = st().addAtom(0, 0, "C");
    const b = st().addAtom(B, 0, "C");
    const c = st().addAtom(2 * B, 0.5 * B, "C");
    st().addBond(a, b, 1);
    st().addBond(b, c, 1);
    st().addPush({ atom: a }, { atom: c }, false);
    const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
    // (as the document has them: the store is joined to it as it is drawn)
    const model = doc.getState().model;
    const atoms = model.atoms.map((x) => ({ id: x.id, x: x.x, y: x.y, el: x.el }));
    const bonds = model.bonds.map((x) => ({ a: atoms.findIndex((y) => y.id === x.a), b: atoms.findIndex((y) => y.id === x.b), order: x.order }));
    // (the drawing as laid out: its lines - the same at every zoom, a new object each time it is laid out)
    const laid = (): DrawnLayout => ({
      atoms,
      bonds,
      opts,
      layout: { texts: [], lines: [{ x1: 0, y1: 0, x2: B, y2: 0 }, { x1: B, y1: 0, x2: 2 * B, y2: 0.5 * B }] } as unknown as DrawnLayout["layout"],
      laidAt: 1,
    } as unknown as DrawnLayout);
    const zoom = drawnZoomOf(1);
    const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const root = createRoot(canvas);
    const draw = (layout: DrawnLayout) =>
      root.render(
        <EditorProvider tabId="t" document={doc}>
          <DrawnLayoutContext.Provider value={layout}>
            <DrawnZoomContext.Provider value={zoom}>
              <PushArrows2D />
            </DrawnZoomContext.Provider>
          </DrawnLayoutContext.Provider>
        </EditorProvider>,
      );
    await act(async () => {
      await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
      draw(laid());
    });
    mounted.push(() => act(async () => void root.unmount()));
    const once = laidOut.n;
    expect(once).toBeGreaterThan(0);
    // (twenty frames of a zoom, the drawing laid out again - the same - at each)
    for (let k = 1; k <= 20; k++) await act(async () => {
      zoom.set(1 + k * 0.1);
      draw(laid());
    });
    expect(laidOut.n).toBe(once);
    // (what is drawn of them: the arrow - its bands, taking the pointer, not drawn while unlit)
    const scene = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): { scene: THREE.Scene } } }>).get(canvas)!.store.getState().scene;
    const drawnMeshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).visible) drawnMeshes.push(m);
    });
    expect(drawnMeshes).toHaveLength(1);
    // (the drawing laid out otherwise - a line moved: laid out again)
    await act(async () => {
      draw({ ...laid(), layout: { texts: [], lines: [{ x1: 0, y1: 0.1, x2: B, y2: 0 }] } as unknown as DrawnLayout["layout"] } as DrawnLayout);
    });
    expect(laidOut.n).toBe(once + 1);
  });
});

describe("what arrows are laid by", () => {
  it("is the same for a drawing laid out again the same, and other where a line or a label moves", () => {
    const a = { texts: [{ x: 1, y: 2, text: "OH", fontPx: 1 }], lines: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] } as never;
    const b = { texts: [{ x: 1, y: 2, text: "OH", fontPx: 1 }], lines: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] } as never;
    expect(pushes.laidKey(a)).toBe(pushes.laidKey(b));
    expect(pushes.laidKey(a)).not.toBe(pushes.laidKey({ texts: [{ x: 1, y: 2.5, text: "OH", fontPx: 1 }], lines: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] } as never));
    expect(pushes.laidKey(a)).not.toBe(pushes.laidKey({ texts: [{ x: 1, y: 2, text: "OH", fontPx: 1 }], lines: [{ x1: 0, y1: 0, x2: 1, y2: 0.01 }] } as never));
  });
});
