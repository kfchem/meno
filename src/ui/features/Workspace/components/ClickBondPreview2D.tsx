import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditorStore } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { pageAt } from "../utils/page";
import { newBondFrom } from "../utils/geometry";
import { bondLengthFrom } from "../utils/magnified";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * Where a click with Option (Alt) held would draw its bond (docs/EDITOR-2D.md, *A bond by one click*): while the key is
 * held and the pointer is on an atom, a thin line in the highlight's colour from the atom to where the bond would end -
 * the line a bond drawn out of an atom is led by (ExtendPreview2D) - easing in, and out as the key is let go or the
 * pointer leaves the atom. Not while a label is typed, a button is held or a bond is being drawn.
 */
export default function ClickBondPreview2D() {
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const lineWidthWorld = useDrawnLayout().opts.lineWidthPx;
  const thin = useRef<THREE.Mesh>(null!);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const seen = useRef(0);
  // (the key, the buttons and the pointer, as the window has them)
  const held = useRef({ alt: false, buttons: 0, x: 0, y: 0 });
  // (where the line was last drawn: it fades out there)
  const last = useRef<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      held.current.alt = e.altKey;
      invalidate();
    };
    const pointer = (e: PointerEvent) => {
      held.current.alt = e.altKey;
      held.current.buttons = e.buttons;
      held.current.x = e.clientX;
      held.current.y = e.clientY;
      if (e.altKey || seen.current > 0) invalidate();
    };
    const blur = () => {
      held.current.alt = false;
      invalidate();
    };
    window.addEventListener("keydown", keys, true);
    window.addEventListener("keyup", keys, true);
    window.addEventListener("pointermove", pointer, true);
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("pointerup", pointer, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keys, true);
      window.removeEventListener("keyup", keys, true);
      window.removeEventListener("pointermove", pointer, true);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("pointerup", pointer, true);
      window.removeEventListener("blur", blur);
    };
  }, [invalidate]);

  useFrame((_, dt) => {
    const st = store.getState();
    const h = held.current;
    const id = st.hovered.atomId;
    let shown: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
    if (h.alt && !h.buttons && id != null && !st.labelEdit.active && !st.extend.active) {
      const rect = gl.domElement.getBoundingClientRect();
      const toward = pageAt(((h.x - rect.left) / rect.width) * 2 - 1, -(((h.y - rect.top) / rect.height) * 2 - 1), camera);
      const from = st.model.atoms.find((a) => a.id === id);
      const to = from ? newBondFrom(st.model.atoms, st.model.bonds, id, toward, bondLengthFrom(st.model.atoms, id)) : null;
      if (from && to) shown = { from, to };
    }
    if (shown) last.current = shown;
    const goal = shown ? 1 : 0;
    if (seen.current !== goal) {
      const n = follow(seen.current, goal, Math.min(dt || 0.016, 1 / 20), TAU.quick);
      seen.current = Math.abs(n - goal) < 0.01 ? goal : n;
      invalidate();
    }
    const m = thin.current;
    if (!m) return;
    const at = last.current;
    m.visible = seen.current > 0 && !!at;
    if (!m.visible || !at) return;
    (m.material as THREE.MeshBasicMaterial).opacity = ALPHA.highlight * seen.current;
    const len = Math.hypot(at.to.x - at.from.x, at.to.y - at.from.y);
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(at.to.y - at.from.y, at.to.x - at.from.x));
    m.position.set((at.from.x + at.to.x) / 2, (at.from.y + at.to.y) / 2, -0.04);
    m.quaternion.copy(q);
    m.scale.set(Math.max(len, 1e-6), Math.max(lineWidthWorld, 1 / Math.max(zoom, 1e-6)), 1);
  });

  return (
    <mesh ref={thin} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={0} depthWrite={false} depthTest={true} toneMapped={false} />
    </mesh>
  );
}
