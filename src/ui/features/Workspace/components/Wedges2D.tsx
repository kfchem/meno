import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { polyTriangles } from "./polyTriangles";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * The drawing's filled shapes, from the shared layout: wedges, bold bonds,
 * hashes cut as trapezoids, arrowheads, and the mitres where lines meet. All
 * of them in one mesh, rebuilt when the layout changes - which is every frame
 * of a drag - with the old geometry let go each time.
 *
 * Drawn with the see-through layers, in their order, though it is opaque:
 * the highlights under the pointer (HoverOverlay2D, AtomsHoverRings2D) are
 * see-through and come before it, so they sit behind these shapes as they
 * sit behind the lines, which hide them by depth. Drawn with the opaque
 * layers, before every see-through one, it would have them on top.
 */
export default function Wedges2D() {
  const { layout, opts } = useDrawnLayout();
  const geometry = useMemo(() => {
    const positions: number[] = [];
    // (each shape in its own colour, where it has one)
    const colors: number[] = [];
    const base = new THREE.Color(opts.bondColor ?? "black");
    const c = new THREE.Color();
    for (const p of layout.polys) {
      if (p.points.length < 3) continue;
      const col = p.color ? c.set(p.color) : base;
      for (const i of polyTriangles(p.points)) {
        positions.push(p.points[i].x, p.points[i].y, 0);
        colors.push(col.r, col.g, col.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [layout, opts.bondColor]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      renderOrder={20}
      frustumCulled={false}
      // Let BondsPick2D handle pointer events instead of this mesh
      raycast={() => {}}
    >
      <meshBasicMaterial
        color="#ffffff"
        vertexColors
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
