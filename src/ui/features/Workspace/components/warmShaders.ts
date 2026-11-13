import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import type * as THREE from "three";
import { probeNewPrograms } from "../../../../lib/core/frameProbe";

/**
 * What the page's shaders are made ready by, before what needs them is
 * first drawn (WarmShaders3D, WarmShaders2D; docs/WORKSPACE.md, *Drawn by
 * WebGL*, *Shaders made ready*).
 */

/** Whether the page has come to be idle since it started: never in the way of its first frames (a short wait where the browser tells no idle time). */
export function useIdleStart(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const cancel = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idle && cancel) {
      const id = idle(() => setOn(true), { timeout: 2000 });
      return () => cancel(id);
    }
    const id = setTimeout(() => setOn(true), 500);
    return () => clearTimeout(id);
  }, []);
  return on;
}

/**
 * What `group` holds compiled - its shaders made, in the background where
 * the browser can (`compileAsync`) - once it is `ready`, and again as
 * `again` changes: after the page's next frame, never in it, so that what
 * it stands under - the page's lights, the key light's shadows set in that
 * frame - is as the page draws it.
 */
export function useCompiledAfterFrame(group: RefObject<THREE.Object3D | null>, ready: boolean, again: unknown): void {
  const { gl, camera, scene, invalidate } = useThree();
  const asked = useRef(false);
  const frame = useRef(0);
  useEffect(() => {
    if (!ready) return;
    asked.current = true;
    invalidate();
    return () => {
      asked.current = false;
      cancelAnimationFrame(frame.current);
    };
  }, [ready, again, invalidate]);
  useFrame(() => {
    if (!asked.current) return;
    asked.current = false;
    frame.current = requestAnimationFrame(() => {
      if (group.current) {
        // TEMPORARY PROBE (not for merge): each warm-up's compile, its programs named
        const what = group.current.userData.warm ?? "?";
        console.warn(`[probe] warm ${what}: compile asked at ${performance.now().toFixed(0)}ms, programs ${gl.info.programs?.length ?? 0}, shadowMap ${gl.shadowMap.enabled}`);
        probeNewPrograms(gl as never, `before the ${what} warm-up's compile`);
        const at = performance.now();
        void gl
          .compileAsync(group.current, camera, scene)
          .then(() => console.warn(`[probe] warm ${what}: compile done after ${(performance.now() - at).toFixed(0)}ms, programs ${gl.info.programs?.length ?? 0}`))
          .catch((e) => console.warn(`[probe] warm ${what}: compile failed: ${String(e)}`));
        probeNewPrograms(gl as never, `by the ${what} warm-up's compile`);
      }
    });
  });
}
