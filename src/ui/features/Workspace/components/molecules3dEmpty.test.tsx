/**
 * The molecules in 3D on a page with none yet (Molecules3D): its lights are
 * there, and the shaders a molecule is drawn with made ready under them
 * (WarmShaders3D) - so that the first one made is drawn as the page stands.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend, type RootState } from "@react-three/fiber";
import { EditorProvider, storeOf, connectStoreToDocument } from "../store";
import { createWorkspaceDocument } from "../document";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import Molecules3D from "./Molecules3D";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
const warmed = vi.hoisted(() => ({ styles: [] as unknown[] }));
vi.mock("./WarmShaders3D", () => ({
  default: (p: { style: unknown }) => {
    warmed.styles.push(p.style);
    return null;
  },
}));

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
  const own = { render: none, getPixelRatio: () => 1, shadowMap: {}, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  warmed.styles.length = 0;
  vi.unstubAllGlobals();
});

describe("the molecules in 3D of a page with none", () => {
  it("have their lights there and their shaders made ready, the workspace's style's", async () => {
    // (the page's window, as far as the molecules listen to it)
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout });
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    connectStoreToDocument(store, doc);
    const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const root = createRoot(canvas);
    await act(async () => {
      await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
      root.render(
        <EditorProvider tabId="t" document={doc}>
          <Molecules3D style={STYLE_3D} />
        </EditorProvider>,
      );
    });
    mounted.push(() => act(async () => void root.unmount()));
    expect(store.getState().molecules3d).toHaveLength(0);
    const state = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
    const lights: string[] = [];
    state.scene.traverse((o) => void ((o as THREE.Light).isLight && lights.push(o.type)));
    expect(lights.sort()).toEqual(["AmbientLight", "DirectionalLight"]);
    expect(warmed.styles[warmed.styles.length - 1]).toBe(STYLE_3D);
  });
});
