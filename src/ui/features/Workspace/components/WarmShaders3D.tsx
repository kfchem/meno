import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import type { Style3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import Molecule3DView from "./Molecule3DView";
import { probeNewPrograms } from "../../../../lib/core/frameProbe";

/**
 * The page's shaders for molecules in 3D made ready before the first is put
 * on it (docs/WORKSPACE.md, *Drawn by WebGL*): a molecule of no account -
 * ethanol, drawn nowhere - made in the workspace's style, unseen and far off
 * the page, once the page has nothing else to do as it starts; its
 * shaders compiled once it stands as a molecule shown stands - its colours
 * given, every part of it in its last state - in the background, where the
 * browser can (`compileAsync`, KHR_parallel_shader_compile), and again
 * whenever the style changes. Kept, unseen, so that its shaders are kept:
 * the first molecule made then draws with them, never waiting a frame on a
 * shader made for it.
 */
export default function WarmShaders3D({ style, stereoFont }: { style: Style3D; stereoFont: Parameters<typeof Molecule3DView>[0]["stereoFont"] }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // (once the page is idle as it starts: never in the way of its first frames)
    const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cancel = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idle && cancel) {
      const id = idle(() => setOn(true), { timeout: 2000 });
      return () => cancel(id);
    }
    const id = setTimeout(() => setOn(true), 500);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (on) console.warn(`[probe] warm: unseen molecule put in at ${performance.now().toFixed(0)}ms`);
  }, [on]);
  return on ? <Warmed style={style} stereoFont={stereoFont} /> : null;
}

/** Ethanol, C-C-O and its six hydrogens, as a molecule in 3D: what the page's molecules are drawn with, and nothing more. */
const WARM: Molecule3D = {
  id: -1,
  at: { x: 0, y: 0 },
  atoms: [
    { el: "C", x: -1.17, y: 0.18, z: 0 },
    { el: "C", x: 0.29, y: -0.34, z: 0 },
    { el: "O", x: 1.15, y: 0.78, z: 0 },
    { el: "H", x: -1.79, y: -0.71, z: 0 },
    { el: "H", x: -1.4, y: 0.78, z: 0.88 },
    { el: "H", x: -1.4, y: 0.78, z: -0.88 },
    { el: "H", x: 0.52, y: -0.94, z: 0.88 },
    { el: "H", x: 0.52, y: -0.94, z: -0.88 },
    { el: "H", x: 2.06, y: 0.45, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 0, a2: 4, order: 1 },
    { a1: 0, a2: 5, order: 1 },
    { a1: 1, a2: 6, order: 1 },
    { a1: 1, a2: 7, order: 1 },
    { a1: 2, a2: 8, order: 1 },
  ],
};
const NONE: number[] = [];
const nothing = () => {};

/** The unseen molecule, and its shaders compiled once it has come to stand as one shown does - after its own effects, its colours given among them - and again with each style. */
function Warmed({ style, stereoFont }: { style: Style3D; stereoFont: Parameters<typeof Molecule3DView>[0]["stereoFont"] }) {
  const group = useRef<THREE.Group>(null!);
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    let live = true;
    // (a frame after it is put in: every effect of it has run, and each part of it holds what it is drawn with)
    const frame = requestAnimationFrame(() => {
      if (live && group.current) {
        // TEMPORARY PROBE (not for merge): the warm-up's compile, its programs named
        console.warn(`[probe] warm: compile asked at ${performance.now().toFixed(0)}ms, programs ${gl.info.programs?.length ?? 0}`);
        probeNewPrograms(gl as never, "before the warm-up's compile");
        const at = performance.now();
        void gl
          .compileAsync(group.current, camera, scene)
          .then(() => console.warn(`[probe] warm: compile done after ${(performance.now() - at).toFixed(0)}ms, programs ${gl.info.programs?.length ?? 0}`))
          .catch((e) => console.warn(`[probe] warm: compile failed: ${String(e)}`));
        probeNewPrograms(gl as never, "by the warm-up's compile");
      }
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [gl, camera, scene, style]);
  return (
    <group ref={group} visible={false} position={[1e6, 1e6, 0]}>
      <Molecule3DView
        m={WARM}
        style={style}
        look="primary"
        frame={0}
        turn={undefined}
        lit={0}
        selected={false}
        chosen={NONE}
        chosenBonds={NONE}
        holding={null}
        following={false}
        framesOpen={false}
        onFrame={nothing}
        hoveredMeasure={null}
        stereoShown={null}
        stereoFont={stereoFont}
      />
    </group>
  );
}
