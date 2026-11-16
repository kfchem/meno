import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ATOM_HOVER_RING_RADIUS_RATIO } from "../constants";
import { startAlone } from "../utils/stroke";
import { bandStep, type BandClock } from "./hoverBand";

/** How long the mark takes to come in, and to go, in seconds: a hovered atom's ring's. */
const DUR_IN = 0.12;
const DUR_OUT = 0.12;
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);

/**
 * Where a stroke begun on empty space starts - Quick Add's Chain, a chain from empty space - while it has no bond yet: a quiet disc in the
 * look a hovered atom's ring has, eased in, and eased out once the first bond is there (the maintainer, 2026-11-17). The start's atom is
 * drawn as a bare vertex till then, no CH4 (components/DrawnLayout): the mark keeps it from being lost.
 */
export default function StrokeStart2D() {
  const start = useEditor((s) => (s.extend.active ? startAlone(s.extend.stroke, s.extend.preview) : null));
  const invalidate = useThree((s) => s.invalidate);
  const mark = useRef<{ u: number; x: number; y: number; clock: BandClock }>({ u: 0, x: 0, y: 0, clock: { last: null } });
  const [, setFrame] = useState(0);
  if (start) {
    mark.current.x = start.x;
    mark.current.y = start.y;
  }
  useFrame(() => {
    const m = mark.current;
    const inward = !!start;
    const d = bandStep(m.clock, performance.now(), inward ? m.u < 1 : m.u > 0);
    const u = Math.min(1, Math.max(0, m.u + (inward ? d / DUR_IN : -d / DUR_OUT)));
    if (u !== m.u || m.clock.last != null) {
      m.u = u;
      setFrame((f) => f + 1);
      invalidate();
    }
  });
  const m = mark.current;
  const s = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH * easeOutCubic(m.u);
  if (s <= 1e-5) return null;
  return (
    <mesh position={[m.x, m.y, -0.02]} scale={[s, s, 1]}>
      <circleGeometry args={[1, 64]} />
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={ALPHA.highlight * easeOutCubic(m.u)} depthTest depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
