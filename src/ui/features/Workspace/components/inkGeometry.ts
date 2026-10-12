import * as THREE from "three";
import { MARKER_OPACITY, strokeTriangles, type InkPen, type InkStroke } from "../../../../lib/chem/ink";

/** Strokes `width` wide as triangles, in one geometry - what Inks2D and a PDF's page draw writing with. */
export function strokesGeometry(strokes: readonly InkStroke[], width: number, taper: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const s of strokes) {
    const t = strokeTriangles(s, width, taper);
    const base = positions.length / 3;
    for (let i = 0; i < t.positions.length; i += 2) positions.push(t.positions[i], t.positions[i + 1], 0);
    for (const i of t.indices) indices.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}

/**
 * How writing on a PDF's page is drawn: see-through always, at `opacity`
 * (the page's own, as it fades) - as the page's pictures are. What is
 * see-through is drawn after all that is not, so writing that was not would
 * have the pictures under it drawn over it.
 */
export function pageInkLook(pen: InkPen, opacity: number): { opacity: number; transparent: true; depthWrite: false } {
  return { opacity: (pen === "marker" ? MARKER_OPACITY : 1) * opacity, transparent: true, depthWrite: false };
}
