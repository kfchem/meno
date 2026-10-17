import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ALPHA, COLORS } from "../../../theme/colors";
import { useEditor } from "../store";
import { strokeTarget } from "../utils/stroke";
import { useDrawnLayout } from "./drawnLayoutContext";
import { bondLengthFrom } from "../utils/magnified";

/** The arc's radius, against a bond's length. */
const RADIUS = 0.3;
const GROW_S = 0.16;
const SHRINK_S = 0.12;
const SWEEP = (2 * Math.PI) / 3;

/**
 * The sign that a bond being drawn has snapped to 120 degrees from one
 * already at its atom, rather than only sitting on the 30-degree grid: an
 * arc between the two bonds, which grows out from the atom when the bond
 * snaps there and shrinks back into it when it leaves.
 */
export default function SnapArc2D() {
  const model = useEditor((s) => s.model);
  const extend = useEditor((s) => s.extend);
  const invalidate = useThree((s) => s.invalidate);
  const lineWidthWorld = useDrawnLayout().opts.lineWidthPx;
  const mesh = useRef<THREE.Mesh>(null!);
  const scale = useRef(0);
  // The last arc shown, kept while it shrinks away.
  const shown = useRef<{ x: number; y: number; start: number } | null>(null);
  const geometry = useMemo(() => {
    const r = RADIUS * NOMINAL_BOND_LENGTH;
    const w = Math.max(lineWidthWorld * 0.8, r * 0.04);
    return new THREE.RingGeometry(r - w / 2, r + w / 2, 40, 1, 0, SWEEP);
  }, [lineWidthWorld]);

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
    const ptr = extend.pointer;
    const target =
      extend.active && extend.stroke && ptr
        ? strokeTarget(model, extend.stroke, ptr, bondLengthFrom(model.atoms, extend.stroke.baseId))
        : null;
    const on =
      target != null &&
      target.trigonalTo != null &&
      target.atomId == null &&
      target.pathIndex == null;
    if (on) {
      const to = Math.atan2(
        target.end.y - target.tip.y,
        target.end.x - target.tip.x,
      );
      // the ring's sweep runs counter-clockwise, from whichever bond it
      // must start at to reach the other
      const ccw = Math.atan2(
        Math.sin(to - target.trigonalTo!),
        Math.cos(to - target.trigonalTo!),
      );
      const start = ccw > 0 ? target.trigonalTo! : to;
      const prev = shown.current;
      // a different arc, somewhere else: it grows afresh
      if (
        !prev ||
        Math.abs(prev.x - target.tip.x) > 1e-9 ||
        Math.abs(prev.y - target.tip.y) > 1e-9 ||
        Math.abs(Math.sin(prev.start - start)) > 1e-6 ||
        Math.cos(prev.start - start) < 0
      ) {
        if (prev && scale.current > 0) scale.current = 0;
      }
      shown.current = { x: target.tip.x, y: target.tip.y, start };
    }
    const goal = on ? 1 : 0;
    if (scale.current !== goal) {
      scale.current = on
        ? Math.min(1, scale.current + dt / GROW_S)
        : Math.max(0, scale.current - dt / SHRINK_S);
      invalidate();
    }
    const arc = shown.current;
    if (!arc || scale.current <= 0) {
      m.visible = false;
      if (!on) shown.current = null;
      return;
    }
    // growing out with a little overshoot, shrinking straight back in
    const u = scale.current;
    const s = on
      ? 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2)
      : u * u;
    m.visible = true;
    m.position.set(arc.x, arc.y, -0.02);
    m.rotation.set(0, 0, arc.start);
    m.scale.set(s, s, 1);
  });

  return (
    <mesh ref={mesh} geometry={geometry} visible={false} renderOrder={25}>
      <meshBasicMaterial
        color={COLORS.highlight}
        transparent
        opacity={ALPHA.highlight}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}
