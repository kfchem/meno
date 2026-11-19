/**
 * A molecule in 3D turned during a frame - as one let go while turning is (utils/coast, FRAME_ORDER `turning`) - is drawn turned in
 * that frame (Molecules3D's `turnOf`, read by each Molecule3DView as it is placed), not in the next, once React has drawn the page
 * again: a frame shown with the turn of the frame before is a frame the turn stands still.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend, useFrame, type RootState } from "@react-three/fiber";
import { EditorProvider, storeOf, connectStoreToDocument } from "../store";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import type { Molecule3D, Turn3D } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { FRAME_ORDER } from "../utils/page";
import Molecules3D from "./Molecules3D";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
vi.mock("./WarmShaders3D", () => ({ default: () => null }));
// (each molecule's view: as it is placed each frame, the turn its `turnOf` reads then, and the `turn` React last gave it)
const placed = vi.hoisted(() => ({ frames: [] as { read: unknown; given: unknown }[] }));
vi.mock("./Molecule3DView", async (actual) => {
  const real = await actual<typeof import("./Molecule3DView")>();
  const { useFrame: frame } = await import("@react-three/fiber");
  const { FRAME_ORDER: order } = await import("../utils/page");
  function Molecule3DView(p: { m: { id: number }; turn?: unknown; turnOf?: (id: number) => unknown }) {
    frame(() => void placed.frames.push({ read: p.turnOf?.(p.m.id), given: p.turn }), order.molecules);
    return null;
  }
  return { ...real, default: Molecule3DView };
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
  const own = { render: none, getPixelRatio: () => 1, shadowMap: {}, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const ethane: Omit<Molecule3D, "id"> = {
  atoms: [
    { el: "C", x: 0, y: 0, z: 0 },
    { el: "C", x: 1.5, y: 0, z: 0 },
  ],
  bonds: [{ a1: 0, a2: 1, order: 1 }],
  at: { x: 0, y: 0 },
};

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  placed.frames.length = 0;
  vi.unstubAllGlobals();
});

describe("a molecule turned during a frame", () => {
  it("is drawn turned in that frame - its view reads the turn as it is placed, after the turn and before React draws the page again", async () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout });
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    connectStoreToDocument(store, doc);
    doc.edit("add", (d) => addMolecule3d(d, ethane));
    const id = store.getState().molecules3d[0].id;
    const turned: Turn3D = [0, Math.sin(0.1), 0, Math.cos(0.1)];
    // (a turn set in the frame, where a coast is worked out: utils/coast)
    let turnNow = false;
    function Turning() {
      useFrame(() => {
        if (turnNow) store.getState().setTurn3d(id, turned);
      }, FRAME_ORDER.turning);
      return null;
    }
    const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const root = createRoot(canvas);
    await act(async () => {
      await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
      root.render(
        <EditorProvider tabId="t" document={doc}>
          <Molecules3D style={STYLE_3D} />
          <Turning />
        </EditorProvider>,
      );
    });
    mounted.push(() => act(async () => void root.unmount()));
    const state = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
    turnNow = true;
    // (one frame, React not let draw the page within it)
    state.advance(performance.now());
    const frame = placed.frames[placed.frames.length - 1];
    expect(frame.read).toEqual(turned);
    // (what React gave the view is the turn of the frame before: drawn from it, the frame would have stood still)
    expect(frame.given).toBeUndefined();
  });
});
