import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { strokeTarget } from "../utils/stroke";
import { useDrawnLayout } from "./drawnLayoutContext";
import { TAU, follow } from "../../../theme/motion";
import { bondLengthFrom } from "../utils/magnified";

// Preview for a stroke drawn out of an atom (see utils/stroke).
// - Works out where the bond the pointer is leading ends - springing round
//   to the snapped angle, following the pointer exactly once a bond stroke
//   has paused, straight onto an atom it closes onto - and publishes that as
//   the gesture's preview: the drawing itself (DrawnLayout) lays the bond out
//   there, joined to the rest as it will be once dropped.
// - Draws only what is not the drawing: a thin highlight line from the atom
//   it leaves to the pointer.
export default function ExtendPreview2D() {
  const model = useEditor((s) => s.model);
  const extend = useEditor((s) => s.extend);
  const setExtendPreview = useEditor((s) => s.setExtendPreview);
  const { camera, invalidate } = useThree();
  // The drawing's own line, in world units.
  const lineWidthWorld = useDrawnLayout().opts.lineWidthPx;
  const thin = useRef<THREE.Mesh>(null!);
  const q = useMemo(() => new THREE.Quaternion(), []);
  // The shown angle springs to the snapped one; length stays a bond's.
  const curAngRef = useRef(0);
  const angVelRef = useRef(0);
  const lastTip = useRef<{ x: number; y: number } | null>(null);
  // Letting go of the grid eases from the snapped bond to the pointer.
  const freeing = useRef<{ t: number; ang: number } | null>(null);
  const wasFree = useRef(false);
  // how far the thin line is in view: in as a bond is drawn out, out after
  const seen = useRef(0);

  useFrame((_, dtRaw) => {
    // Angle smoothing runs while the gesture is active (on-demand rendering).
    if (extend.active) invalidate();
    const ptr = extend.pointer;
    const target =
      extend.active && extend.stroke && ptr
        ? strokeTarget(model, extend.stroke, ptr, bondLengthFrom(model.atoms, extend.stroke.baseId))
        : null;
    const seenTo = target && ptr ? 1 : 0;
    if (seen.current !== seenTo) {
      const n = follow(seen.current, seenTo, Math.min(dtRaw || 0.016, 1 / 20), TAU.quick);
      seen.current = Math.abs(n - seenTo) < 0.01 ? seenTo : n;
    }
    if (thin.current) (thin.current.material as THREE.MeshBasicMaterial).opacity = ALPHA.highlight * seen.current;
    if (!target || !thin.current || !ptr) {
      // (let go: the line goes out of view where it was)
      if (thin.current) thin.current.visible = seen.current > 0;
      if (seen.current > 0) invalidate();
      angVelRef.current = 0;
      lastTip.current = null;
      freeing.current = null;
      wasFree.current = false;
      return;
    }
    const L = extend.stroke ? bondLengthFrom(model.atoms, extend.stroke.baseId) : NOMINAL_BOND_LENGTH;
    const tip = target.tip;
    const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
    const toPtr = Math.atan2(ptr.y - tip.y, ptr.x - tip.x);
    const lenPtr = Math.hypot(ptr.x - tip.x, ptr.y - tip.y);
    const want = Math.atan2(target.end.y - tip.y, target.end.x - tip.x);
    // a new tip (the stroke laid an atom down, or began): start from the
    // snapped angle, no spring
    const moved =
      !lastTip.current ||
      Math.abs(lastTip.current.x - tip.x) > 1e-9 ||
      Math.abs(lastTip.current.y - tip.y) > 1e-9;
    if (moved) {
      curAngRef.current = want;
      angVelRef.current = 0;
      lastTip.current = { x: tip.x, y: tip.y };
    }

    let end: { x: number; y: number };
    const free = extend.stroke?.kind === "bond" && extend.stroke.free;
    if (target.atomId != null || target.pathIndex != null || target.ring) {
      // closing onto an atom, or a metal's onto a ring: the bond goes to it, or to the ring's centre
      end = target.end;
      curAngRef.current = want;
      angVelRef.current = 0;
    } else if (free) {
      if (!wasFree.current) freeing.current = { t: 0, ang: curAngRef.current };
      const f = freeing.current;
      if (f && f.t < 1) {
        f.t = Math.min(1, f.t + dt / 0.18);
        const s = 1 - Math.pow(1 - f.t, 3); // ease out
        const d = Math.atan2(Math.sin(toPtr - f.ang), Math.cos(toPtr - f.ang));
        const ang = f.ang + d * s;
        const len = L + (lenPtr - L) * s;
        end = { x: tip.x + len * Math.cos(ang), y: tip.y + len * Math.sin(ang) };
      } else {
        end = { x: ptr.x, y: ptr.y };
      }
      curAngRef.current = toPtr;
      angVelRef.current = 0;
    } else {
      // Angle-only spring: snappy, with a little bounce
      const k = 800;
      const c = 2 * Math.sqrt(k) * 0.5;
      const err = Math.atan2(
        Math.sin(curAngRef.current - want),
        Math.cos(curAngRef.current - want),
      );
      angVelRef.current += (-k * err - c * angVelRef.current) * dt;
      curAngRef.current += angVelRef.current * dt;
      end = {
        x: tip.x + L * Math.cos(curAngRef.current),
        y: tip.y + L * Math.sin(curAngRef.current),
      };
    }
    wasFree.current = free;

    // the thin line from the atom it leaves to the pointer, behind the bonds
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    const thickWorld = Math.max(lineWidthWorld, 1 / Math.max(zoom, 1e-6));
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), toPtr);
    thin.current.position.set(
      tip.x + (ptr.x - tip.x) * 0.5,
      tip.y + (ptr.y - tip.y) * 0.5,
      -0.04,
    );
    thin.current.quaternion.copy(q);
    thin.current.scale.set(Math.max(lenPtr, 1e-6), thickWorld, 1);
    thin.current.visible = true;

    // The drawing lays the bond out there.
    if (Number.isFinite(end.x) && Number.isFinite(end.y)) {
      setExtendPreview(end.x, end.y, {
        atomId: target.atomId,
        pathIndex: target.pathIndex,
      });
    }
  });

  return (
    <group>
      <mesh ref={thin} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
