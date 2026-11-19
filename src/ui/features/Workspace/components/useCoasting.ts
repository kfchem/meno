/**
 * The frame that turns every molecule let go while turning (utils/coast): on the page (Molecules3D), in a talk
 * (presenting/Presenter) and in Settings' preview (StyleEditor/Preview3D), each with its own coasts. It runs at
 * FRAME_ORDER `turning` - after the camera, before the molecules are placed - so that a coasting molecule is drawn
 * in the frame that turns it, as a dragged one is, never a frame late.
 */
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { coastsFrame, type Coast } from "../utils/coast";
import { FRAME_ORDER } from "../utils/page";

export function useCoasting<K>(
  /** (its coasts, as they stand at the frame: none, where there is nothing to coast in) */
  coasts: () => Map<K, Coast> | null | undefined,
  turn: (key: K, axis: THREE.Vector3, angle: number) => void,
  damping: () => number,
  /** (after the frame has turned them: what else the turn moves - the atom under a pointer resting on one) */
  turned?: () => void,
): void {
  const invalidate = useThree((s) => s.invalidate);
  useFrame(() => {
    const now = coasts();
    if (!now?.size) return;
    coastsFrame(now, performance.now(), damping(), turn);
    turned?.();
    invalidate();
  }, FRAME_ORDER.turning);
}
