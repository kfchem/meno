import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import type { Poly } from "../../../../lib/chem/layout2d";
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
  // (each shape's triangles, kept while the layout keeps the shape: a
  // structure not laid out again - lib/chem/layoutStructures - is not cut
  // into triangles again either)
  const triangles = useRef(new WeakMap<Poly, Float32Array>());
  const geometry = useMemo(() => {
    const kept = triangles.current;
    const shapes: Float32Array[] = [];
    let n = 0;
    for (const p of layout.polys) {
      if (p.points.length < 3) continue;
      let t = kept.get(p);
      if (!t) {
        const at = polyTriangles(p.points);
        t = new Float32Array(at.length * 3);
        at.forEach((i, k) => {
          t![3 * k] = p.points[i].x;
          t![3 * k + 1] = p.points[i].y;
        });
        kept.set(p, t);
      }
      shapes.push(t);
      n += t.length;
    }
    const positions = new Float32Array(n);
    // (each shape in its own colour, where it has one)
    const colors = new Float32Array(n);
    const base = new THREE.Color(opts.bondColor ?? "black");
    const c = new THREE.Color();
    let k = 0;
    let s = 0;
    for (const p of layout.polys) {
      if (p.points.length < 3) continue;
      const t = shapes[s++];
      const col = p.color ? c.set(p.color) : base;
      positions.set(t, k);
      for (let j = k; j < k + t.length; j += 3) {
        colors[j] = col.r;
        colors[j + 1] = col.g;
        colors[j + 2] = col.b;
      }
      k += t.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
