import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { polyTriangles } from "../components/polyTriangles";
import { PAGE_GL_ORDER } from "./PageShapes";

/** A filled polygon on the page - a chip's energy profile - its corners in the page's units (y up), sRGB `color`. */
export type PagePoly = { key: string; points: readonly { x: number; y: number }[]; color: string; z?: number; opacity?: number };

const colour = new THREE.Color();

/**
 * The page's filled polygons (`PagePoly`), drawn by WebGL as one mesh - few
 * as they are, they are triangulated again whenever they change - under the
 * page's words, over its boxes drawn before them.
 */
export default function PagePolys({ items, order = PAGE_GL_ORDER }: { items: readonly PagePoly[]; order?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false }), []);
  // (a geometry of its own each time they change, the last let go - as PageIcons, for the app's WebKit)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    if (!items.length) {
      setGeometry(null);
      invalidate();
      return;
    }
    const positions: number[] = [];
    const colours: number[] = [];
    const index: number[] = [];
    const inOrder = items.map((p, i) => [p, i] as const).sort((a, b) => (a[0].z ?? 0) - (b[0].z ?? 0) || a[1] - b[1]);
    for (const [p] of inOrder) {
      const from = positions.length / 3;
      colour.set(p.color);
      for (const q of p.points) {
        positions.push(q.x, q.y, 0);
        colours.push(colour.r, colour.g, colour.b, p.opacity ?? 1);
      }
      for (const k of polyTriangles([...p.points])) index.push(from + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));
    g.setIndex(index);
    setGeometry(g);
    invalidate();
    return () => g.dispose();
  }, [items, invalidate]);
  return geometry ? <mesh geometry={geometry} material={material} renderOrder={order} frustumCulled={false} /> : null;
}
