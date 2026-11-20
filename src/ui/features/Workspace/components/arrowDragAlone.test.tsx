import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend } from "@react-three/fiber";
import { EditorProvider, storeOf } from "../store";
import { createWorkspaceDocument } from "../document";
import { DrawnLayoutContext, DrawnZoomContext, drawnZoomOf, type DrawnLayout } from "./drawnLayoutContext";
import { editorLayoutOptions } from "../layoutOptions";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";
import Arrows2D from "./Arrows2D";

// A reaction arrow dragged by itself through the real component (Arrows2D's own press, the pointer's moves on the window): it goes alone,
// its words staying where they stand - over it again where it is put within their reach, else words of their own; with both selected,
// both go. Each drag one undo step. (docs/EDITOR-2D.md, words over and under arrows)

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing: every call answered, nothing done. */
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
  const own = {
    render: none,
    getPixelRatio: () => 1,
    domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none },
  };
  return new Proxy(own, handler);
}

type Listener = (e: { clientX: number; clientY: number; pointerId: number; button: number }) => void;
const listeners = new Map<string, Set<Listener>>();
const fire = (type: string, x: number, y: number) => {
  for (const f of [...(listeners.get(type) ?? [])]) f({ clientX: x, clientY: y, pointerId: 1, button: 0 });
};
const mounted: (() => Promise<void>)[] = [];
const was = (globalThis as { window?: unknown }).window;
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  listeners.clear();
  (globalThis as { window?: unknown }).window = was;
});

async function page() {
  (globalThis as { window?: unknown }).window = {
    addEventListener: (t: string, f: Listener) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
    removeEventListener: (t: string, f: Listener) => void listeners.get(t)?.delete(f),
    requestAnimationFrame: (f: (t: number) => void) => (f(0), 1),
    cancelAnimationFrame: () => undefined,
  };
  const doc = createWorkspaceDocument();
  const store = storeOf(doc);
  const st = () => store.getState();
  const arrow = st().addArrow(0, 0);
  const word = st().addCaption("Pd(PPh3)4", 0, 1, arrow);
  const opts = editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE));
  const layout = { atoms: [], bonds: [], opts, layout: { texts: [], lines: [] }, laidAt: 1 } as unknown as DrawnLayout;
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <DrawnLayoutContext.Provider value={layout}>
          <DrawnZoomContext.Provider value={drawnZoomOf(1)}>
            <Arrows2D />
          </DrawnZoomContext.Provider>
        </DrawnLayoutContext.Provider>
      </EditorProvider>,
    );
  });
  mounted.push(() => act(async () => void root.unmount()));
  const three = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): { scene: THREE.Scene; camera: THREE.OrthographicCamera } } }>).get(canvas)!.store.getState();
  // (1 unit is 40 px on the screen)
  three.camera.zoom = 40;
  three.camera.updateProjectionMatrix();
  three.camera.updateMatrixWorld();
  // (the arrow's own press: its group's handler)
  let down: ((e: unknown) => void) | null = null;
  three.scene.traverse((o) => {
    const h = (o as unknown as { __r3f?: { handlers?: { onPointerDown?: (e: unknown) => void } } }).__r3f?.handlers?.onPointerDown;
    if (h && !down && o.type === "Group" && o.children.length >= 2) down = h;
  });
  /** A drag from the screen's middle by `dx`, `dy` pixels, in two moves. */
  const drag = async (dx: number, dy: number) => {
    await act(async () => down!({ stopPropagation: () => undefined, nativeEvent: { clientX: 400, clientY: 300, button: 0, pointerId: 1 } }));
    await act(async () => fire("pointermove", 400 + dx / 2, 300 + dy / 2));
    await act(async () => fire("pointerup", 400 + dx, 300 + dy));
  };
  return { doc, st, arrow, word, drag, found: down != null };
}

describe("a reaction arrow dragged by itself", () => {
  it("goes alone, its words where they stand; put near them they are over it again, put far they are words of their own; one undo step each", async () => {
    const { doc, st, arrow, drag, found } = await page();
    expect(found).toBe(true);
    const wordAt = () => ({ x: st().captions[0].x, y: st().captions[0].y });
    const before = wordAt();
    const depth = doc.history().undoDepth;
    // (2 units along: within the words' reach)
    await drag(80, 0);
    expect(st().arrows[0].x).toBeCloseTo(2, 5);
    expect(wordAt()).toEqual(before);
    expect(st().captions[0].arrow).toBe(arrow);
    expect(doc.history().undoDepth).toBe(depth + 1);
    // (5 units up from there: out of their reach)
    await drag(0, -200);
    expect(wordAt()).toEqual(before);
    expect(st().captions[0].arrow).toBeUndefined();
    expect(doc.history().undoDepth).toBe(depth + 2);
    // (undo: the arrow back by it, and the words over it again)
    await act(async () => doc.undo());
    expect(st().captions[0].arrow).toBe(arrow);
  });

  it("takes its words along where both are selected", async () => {
    const { st, arrow, word, drag } = await page();
    await act(async () => {
      st().clearSel();
      st().selectArrows([arrow]);
      st().selectCaptions([word], true);
    });
    const x0 = st().captions[0].x;
    await drag(80, 0);
    expect(st().arrows[0].x).toBeCloseTo(2, 5);
    expect(st().captions[0].x).toBeCloseTo(x0 + 2, 5);
    expect(st().captions[0].arrow).toBe(arrow);
  });
});
