/**
 * A molecule in 3D let go while turning (utils/coast) coasts in the frame the shared frame turns it (useCoasting, at FRAME_ORDER
 * `turning`), and the page's own view of it (Molecule3DView, reading Molecules3D's `turnOf` as it is placed) draws it so turned in
 * that same frame - not in the next, once React has drawn the page again: a frame shown with the turn of the frame before is a
 * frame the turn stands still. Drawn into a scene without WebGL; what is drawn read off the scene itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { _roots, createRoot, extend, type RootState } from "@react-three/fiber";
import { EditorProvider, storeOf, connectStoreToDocument } from "../store";
import { addMolecule3d, createWorkspaceDocument } from "../document";
import type { Molecule3D, Turn3D } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Coast } from "../utils/coast";
import Molecules3D from "./Molecules3D";
import { useCoasting } from "./useCoasting";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
vi.mock("./WarmShaders3D", () => ({ default: () => null }));
vi.mock("../utils/occlusions", async (actual) => ({ ...(await actual<object>()), askOcclusion: () => new Promise(() => undefined) }));
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

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Whether something in the scene is turned as `turn` is: the molecule's view, placed. */
const drawnTurned = (scene: THREE.Object3D, turn: Turn3D | undefined) => {
  if (!turn) return false;
  const want = new THREE.Quaternion(...turn);
  let found = false;
  scene.traverse((o) => void (o.quaternion.angleTo(want) < 1e-6 && (found = true)));
  return found;
};

describe("a molecule let go while turning", () => {
  it("is drawn, frame by frame, as the frame that turns it leaves it - not as the frame before left it", async () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout, devicePixelRatio: 1 });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    connectStoreToDocument(store, doc);
    doc.edit("add", (d) => addMolecule3d(d, ethane));
    const id = store.getState().molecules3d[0].id;
    // (its coast, as the page keeps one: by the molecule's id, turned in the store)
    const coasts = new Map<number, Coast>();
    function Coasting() {
      useCoasting(
        () => coasts,
        (key, axis, angle) => {
          const was = store.getState().turns3d[key];
          const q = (was ? new THREE.Quaternion(...was) : new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
          store.getState().setTurn3d(key, [q.x, q.y, q.z, q.w] as Turn3D);
        },
        () => STYLE_3D.turnDamping,
      );
      return null;
    }
    const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
    const root = createRoot(canvas);
    await act(async () => {
      await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
      root.render(
        <EditorProvider tabId="t" document={doc}>
          <Molecules3D style={STYLE_3D} />
          <Coasting />
        </EditorProvider>,
      );
    });
    mounted.push(() => act(async () => void root.unmount()));
    const state = (_roots as unknown as Map<HTMLCanvasElement, { store: { getState(): RootState } }>).get(canvas)!.store.getState();
    const start = performance.now();
    // (the frames' clock is the frames' own: each frame a sixtieth of a second after the last, however long the machine takes over it -
    //  a busy machine's real time between frames would slow the coast to a stop, and the test would ask of a turn no frame makes)
    let clock = start;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    coasts.set(id, { axis: new THREE.Vector3(0, 1, 0), speed: 6, at: start });
    const seen: Turn3D[] = [];
    for (let k = 1; k <= 4; k++) {
      // (one frame; React let draw the page only between frames, as it is)
      clock = start + k * (1000 / 60);
      state.advance(clock);
      const now = store.getState().turns3d[id];
      expect(now, `frame ${k}`).toBeDefined();
      expect(drawnTurned(state.scene, now), `frame ${k}`).toBe(true);
      seen.push(now!);
      await act(async () => undefined);
    }
    // (turned on each frame, never the same turn twice: the coast kept from one frame to the next)
    for (let k = 1; k < seen.length; k++) expect(new THREE.Quaternion(...seen[k]).angleTo(new THREE.Quaternion(...seen[k - 1]))).toBeGreaterThan(1e-4);
  });
});
