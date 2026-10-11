import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { polyTriangles } from "./polyTriangles";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * What lies behind the drawing, from the shared layout: rings filled with a
 * colour, then parts highlighted in one (docs/EDITOR-2D.md, *Colour*) -
 * each a light tint, flat and opaque, so that pieces of one colour run
 * together into one shape with a sharp edge, as on the page. Under the
 * selection's shade, which shows over them what is selected.
 */
export default function Fills2D() {
  const { layout } = useDrawnLayout();
  const geometry = useMemo(() => {
    const under = layout.under ?? [];
    if (!under.length) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (const u of under) {
      if (u.points.length < 3) continue;
      c.set(u.color);
      for (const i of polyTriangles(u.points)) {
        positions.push(u.points[i].x, u.points[i].y, 0);
        colors.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [layout]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, 0, -0.05]} renderOrder={-3} frustumCulled={false} raycast={() => {}}>
      <meshBasicMaterial color="#ffffff" vertexColors toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
