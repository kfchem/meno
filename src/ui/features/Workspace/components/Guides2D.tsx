/**
 * Guides as something is moved or made larger (docs/PRESENTING.md,
 * *Guides*; presenting/guides): a thin line in Meno's accent along each
 * edge or middle that lines up, from end to end of what lines up, and a
 * mark - a line with a tick at each end - across each space or size made
 * the same. Over everything on the page, the same on the screen at any
 * zoom, fading in as they line up and out as they part, one that moves
 * to another line gliding there, and one that lasts only a moment not
 * shown at all (presenting/guideFade).
 */
import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS } from "../../../theme/colors";
import { GuideFade } from "../presenting/guideFade";
import type { Seg } from "../presenting/guides";

/** Where guides lie: over the drawing and the slides' frames. */
const Z = 0.65;
/** On the screen, in pixels: a guide's line, and a mark's ticks either side of it. */
const LINE_PX = 1;
const TICK_PX = 4;

export default function Guides2D() {
  const guides = useEditor((s) => s.guides);
  const { camera, invalidate } = useThree();
  const px = 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
  // (what each guide is now - its place and how opaque - taken at each frame it is on its way)
  const fade = useRef(new GuideFade());
  const [, setStep] = useState(0);
  // (a frame for each change of the guides: the canvas draws on demand)
  useEffect(() => invalidate(), [guides, invalidate]);
  const drawn = useRef<{ seg: Seg; level: number; mark: boolean }[]>([]);
  useFrame(() => {
    const { drawn: now, moving } = fade.current.update(performance.now(), guides);
    // (drawn again where it changed: while any is coming, going or gliding)
    if (moving || now.length !== drawn.current.length) {
      drawn.current = now;
      setStep((n) => n + 1);
    }
    if (moving) invalidate();
  });
  if (!drawn.current.length) return null;
  const pieces: { seg: Seg; level: number }[] = [];
  for (const d of drawn.current) {
    pieces.push({ seg: d.seg, level: d.level });
    if (!d.mark) continue;
    // (a tick across each end of a mark)
    const m = d.seg;
    const len = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) || 1;
    const nx = (-(m.y2 - m.y1) / len) * TICK_PX * px;
    const ny = ((m.x2 - m.x1) / len) * TICK_PX * px;
    for (const [x, y] of [
      [m.x1, m.y1],
      [m.x2, m.y2],
    ])
      pieces.push({ seg: { x1: x - nx, y1: y - ny, x2: x + nx, y2: y + ny }, level: d.level });
  }
  return (
    <group position={[0, 0, Z]}>
      {pieces.map(({ seg: s, level }, i) => {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        return (
          <mesh
            key={i}
            position={[(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 0]}
            rotation={[0, 0, Math.atan2(s.y2 - s.y1, s.x2 - s.x1)]}
            scale={[len + LINE_PX * px, LINE_PX * px, 1]}
            renderOrder={48}
            raycast={() => {}}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color={COLORS.attention} transparent opacity={level} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}
