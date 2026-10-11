/**
 * Guides as something is moved or made larger (docs/PRESENTING.md,
 * *Guides*; presenting/guides): a thin line in Meno's accent along each
 * edge or middle that lines up, from end to end of what lines up, and a
 * mark - a line with a tick at each end - across each space or size made
 * the same. Over everything on the page, the same on the screen at any
 * zoom, coming as they line up and going as they part.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import type { GuideMarks, Seg } from "../presenting/guides";

/** Where guides lie: over the drawing and the slides' frames. */
const Z = 0.65;
/** On the screen, in pixels: a guide's line, and a mark's ticks either side of it. */
const LINE_PX = 1;
const TICK_PX = 4;

export default function Guides2D() {
  const guides = useEditor((s) => s.guides);
  const { camera, invalidate } = useThree();
  const px = 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
  // (the last shown, kept while they go)
  const [shown, setShown] = useState<GuideMarks | null>(guides);
  useEffect(() => {
    if (guides) setShown(guides);
    invalidate();
  }, [guides, invalidate]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.attention, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const gone = useRef(false);
  useFrame((_, dt) => {
    const to = guides ? 1 : 0;
    if (Math.abs(material.opacity - to) < 1e-3) {
      material.opacity = to;
      if (!guides && shown && !gone.current) {
        gone.current = true;
        setShown(null);
      }
      return;
    }
    gone.current = false;
    material.opacity = follow(material.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  if (!shown) return null;
  const segs: Seg[] = [...shown.lines];
  for (const m of shown.marks) {
    segs.push(m);
    // (a tick across each end)
    const len = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) || 1;
    const nx = (-(m.y2 - m.y1) / len) * TICK_PX * px;
    const ny = ((m.x2 - m.x1) / len) * TICK_PX * px;
    for (const [x, y] of [
      [m.x1, m.y1],
      [m.x2, m.y2],
    ])
      segs.push({ x1: x - nx, y1: y - ny, x2: x + nx, y2: y + ny });
  }
  return (
    <group position={[0, 0, Z]}>
      {segs.map((s, i) => {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        return (
          <mesh
            key={i}
            material={material}
            position={[(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 0]}
            rotation={[0, 0, Math.atan2(s.y2 - s.y1, s.x2 - s.x1)]}
            scale={[len + LINE_PX * px, LINE_PX * px, 1]}
            renderOrder={48}
            raycast={() => {}}
          >
            <planeGeometry args={[1, 1]} />
          </mesh>
        );
      })}
    </group>
  );
}
