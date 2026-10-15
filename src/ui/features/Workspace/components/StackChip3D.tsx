import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import Frames3D from "./Frames3D";
import { calcLine } from "../../../../lib/calc/output";
import type { Result } from "../../../../lib/calc/results";
import type { Molecule3D, Turn3D } from "../store/types";
import type { Style3D } from "../../../../lib/chem/style3d";
import { lookOf, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { eyeOf } from "../utils/page";
import { follow } from "../../../theme/motion";

/** How gently the chip follows the lowest point of what its stack shows as it turns, in seconds (as a molecule's frames' chip does). */
const CHIP_TAU = 0.12;

/**
 * What the calculation a stacked molecule was read from found of it, to say in the stack's chip: its own values, and its frames'
 * at the frame shown - each told as the molecule's, since the chip's frames are the stack's. The molecule's and its frames'
 * results otherwise reach no chip, where its stack's stands for its own (a result set of an xTB run, say).
 */
export function stackedResults(shown: Pick<Molecule3D, "calc">, frame: number): Result[] | undefined {
  const results = shown.calc?.results;
  if (!results?.length) return undefined;
  return results.flatMap((r): Result[] => {
    if (r.on === "molecule") return [r];
    if (r.on === "frames") return [{ ...r, on: "molecule", value: r.values[frame] ?? null } as unknown as Result];
    return [];
  });
}

/**
 * A stack's chip, just below the molecule it shows (utils/stacks): which of
 * how many, and its record's title (*3 / 60  aspirin*) - and, clicked, a
 * slider through them (Frames3D),
 * as a molecule's frames have. The stack's own, not its molecules': it
 * stays as they go over one to the next, a drag along its slider going on
 * through them.
 */
export default function StackChip3D({
  shown,
  turn,
  frame,
  style,
  index,
  count,
  open,
  onShow,
}: {
  /** The molecule the stack shows, turned and in the frame it is. */
  shown: Molecule3D;
  turn?: Turn3D;
  frame: number;
  style: Style3D;
  index: number;
  count: number;
  open: boolean;
  onShow: (index: number) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const group = useRef<THREE.Group>(null!);
  const low = useRef<number | null>(null);
  useFrame((_, dt) => {
    const b = seenBounds(poseOf(shown, solidOf(shown, style), lookOf(shown), turn, frame), eyeOf(camera));
    if (!Number.isFinite(b.minY)) return;
    const to = b.minY;
    low.current = low.current == null ? to : follow(low.current, to, Math.min(dt, 1 / 20), CHIP_TAU);
    if (Math.abs(low.current - to) > 1e-3) invalidate();
    group.current.position.set(shown.at.x, low.current, 0);
  });
  return (
    <group ref={group}>
      <Frames3D
        count={count}
        frame={index}
        open={open}
        onFrame={onShow}
        area={gl.domElement}
        title={shown.title}
        about={shown.calc ? calcLine(shown.calc) : undefined}
        results={stackedResults(shown, frame)}
        unread={shown.calc?.unread}
        made={shown.made?.how}
      />
    </group>
  );
}
