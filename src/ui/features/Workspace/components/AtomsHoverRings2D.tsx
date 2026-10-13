import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ATOM_HOVER_RING_RADIUS_RATIO } from "../constants";
import { useDrawnLayout } from "./drawnLayoutContext";

/** How long a ring takes to come in, and to go, in seconds. */
const DUR_IN = 0.12;
const DUR_OUT = 0.12;
/** How far the ring overshoots as it comes in, bouncing to its size. */
const BACK = 1.25;
const easeOutBack = (u: number) => {
  const c3 = BACK + 1;
  const x = u - 1;
  return 1 + c3 * x * x * x + BACK * x * x;
};
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);

/**
 * The ring behind the atom under the pointer. Each ring has its own way in:
 * one coming in as the pointer reaches an atom while the one it left goes
 * out, and one turned back half way going back from where it was - nothing
 * appears or vanishes at once. Once in, a ring rests, and nothing is drawn
 * again for it.
 */
export default function AtomsHoverRings2D() {
  const hovered = useEditor((s) => s.hovered);
  const drawn = useDrawnLayout();
  const invalidate = useThree((s) => s.invalidate);
  // each ring: how far in it is (0 out, 1 in), and where its atom was last
  const rings = useRef(new Map<number, { u: number; x: number; y: number }>());
  const [, setFrame] = useState(0);
  // (each ring's atom looked for by itself - one or two of them - not a
  // map of every atom made at every frame of a drag)
  const at = { get: (id: number) => drawn.atoms.find((a) => a.id === id) };
  const radius = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;

  // (where its atom is drawn now, on its way somewhere or not)
  for (const [id, r] of rings.current) {
    const a = at.get(id);
    if (a) {
      r.x = a.x;
      r.y = a.y;
    }
  }
  const id = hovered.atomId;
  if (id != null && !rings.current.has(id)) {
    const a = at.get(id);
    if (a) rings.current.set(id, { u: 0, x: a.x, y: a.y });
  }

  useFrame((_, dt) => {
    let moving = false;
    for (const [k, r] of rings.current) {
      const inward = k === hovered.atomId;
      const u = Math.min(1, Math.max(0, r.u + (inward ? dt / DUR_IN : -dt / DUR_OUT)));
      if (u !== r.u) {
        r.u = u;
        moving = true;
      }
      if (u === 0 && !inward) rings.current.delete(k);
    }
    if (moving) {
      setFrame((f) => f + 1);
      invalidate();
    }
  });

  return (
    <group>
      {[...rings.current.entries()].map(([k, r]) => {
        const s = radius * Math.max(0, easeOutBack(r.u));
        if (s <= 1e-5) return null;
        return (
          <mesh key={k} position={[r.x, r.y, -0.02]} scale={[s, s, 1]}>
            <circleGeometry args={[1, 64]} />
            <meshBasicMaterial
              color={COLORS.highlight}
              transparent
              opacity={ALPHA.highlight * easeOutCubic(r.u)}
              depthTest={true}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
