/**
 * A surface (an orbital's, a density's) as it is drawn, on the canvas
 * (../components/Surface3D) and in a picture (../render3d): both phases one
 * mesh, each point coloured by its phase - or, where another grid colours
 * it (lib/calc/results `SurfaceColour`: NCI's), by that grid's value there -
 * its triangles drawn in the order its index gives - from the farthest to
 * the nearest (./backToFront).
 */
import * as THREE from "three";
import { isAsk, readGrid, resultKey, resultsOn, type Grid } from "../../../../lib/calc/results";
import { givenValue } from "../../../../lib/calc/asks";
import { isoOf } from "../../../../lib/calc/grids";
import type { Style3D } from "../../../../lib/chem/style3d";
import type { Carried3D, Molecule3D } from "../store/types";
import type { Mesh, Vec3 } from "./isosurface";
import { frameOf, heightOf, lookOf, magnifiedOf, solidOf } from "./molecule3d";
import { seenAt, type Eye } from "./page";
import { surfaceNow } from "./surfaces";

/** How far a surface is seen through: its opacity. One coloured by another grid is not seen through: its colours are what it says. */
export const SURFACE_OPACITY = 0.6;
export const COLOURED_OPACITY = 1;

/** A surface's opacity: seen through, or - coloured by another grid - not. */
export const surfaceOpacity = (coloured: boolean) => (coloured ? COLOURED_OPACITY : SURFACE_OPACITY);
/** Its finish. */
export const SURFACE_FINISH = { roughness: 0.55, metalness: 0 };

/** A surface's two phases as one mesh - the positive's triangles, then the negative's - and where the negative's begin, by point; `coloured`, its points coloured already, by another grid (the positive's own colours, kept). */
export function surfaceGeometry(plus: Mesh, minus: Mesh | null): { geometry: THREE.BufferGeometry; split: number; coloured: boolean } {
  const n = plus.positions.length + (minus?.positions.length ?? 0);
  const positions = new Float32Array(n);
  const normals = new Float32Array(n);
  positions.set(plus.positions);
  normals.set(plus.normals);
  if (minus) {
    positions.set(minus.positions, plus.positions.length);
    normals.set(minus.normals, plus.positions.length);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  const colours = new Float32Array(n);
  const coloured = !!plus.colours && plus.colours.length === plus.positions.length && !minus;
  if (coloured) colours.set(plus.colours!);
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(n / 3), 1));
  g.userData.coloured = coloured;
  return { geometry: g, split: plus.positions.length / 3, coloured };
}

/** Each point its phase's colour: the first `split` points the positive's - unless another grid coloured them, whose colours stay. */
export function colourSurface(g: THREE.BufferGeometry, split: number, plus: string, minus: string) {
  if (g.userData.coloured) return;
  const attr = g.getAttribute("color") as THREE.BufferAttribute;
  const a = new THREE.Color(plus);
  const b = new THREE.Color(minus);
  for (let i = 0; i < attr.count; i++) (i < split ? a : b).toArray(attr.array, 3 * i);
  attr.needsUpdate = true;
}

/** Its material: seen through, both sides, in one go in the index's order. */
export function surfaceMaterial(opacity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    ...SURFACE_FINISH,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
}

/**
 * Where a molecule's frame `f` is centred, in ångströms: what its surface
 * is placed about, as its atoms are.
 */
export function frameCentre(m: Pick<Carried3D, "atoms" | "frames">, f: number): Vec3 {
  const xyz = f === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : (m.frames?.[f - 1] ?? []);
  const c: Vec3 = [0, 0, 0];
  const count = Math.floor(xyz.length / 3) || 1;
  for (let i = 0; i + 2 < xyz.length; i += 3) for (let x = 0; x < 3; x++) c[x] += xyz[i + x] / count;
  return c;
}

/**
 * The surface a carried molecule shows - its open list's chosen row's,
 * given (a promise not yet given shows none) - the value it is drawn at,
 * and what colours it, where another grid does (given too).
 */
export function shownSurface(m: Pick<Carried3D, "calc" | "list">): { grid: Grid; iso: number; colour?: { grid: Grid; from: number; to: number } } | null {
  const open = m.list;
  if (!open || open.row == null || !m.calc?.results) return null;
  const list = resultsOn(m.calc.results, "list").find((r) => resultKey(r) === open.id);
  const row = list?.rows[open.row];
  const v = row?.surface;
  if (!v || isAsk(v)) return null;
  // (read once for the grid given: the same grid each time, so that its surface is worked out once)
  const once = (x: object) => {
    if (!read.has(x)) read.set(x, readGrid(x) ?? null);
    return read.get(x) ?? null;
  };
  const grid = once(v);
  if (!grid) return null;
  const by = row?.colour ? (isAsk(row.colour.by) ? givenValue(m.calc.source, list?.from, row.colour.by.ask) : row.colour.by) : undefined;
  const colourGrid = by && typeof by === "object" ? once(by) : null;
  return { grid, iso: open.iso ?? isoOf(grid), ...(colourGrid && row?.colour ? { colour: { grid: colourGrid, from: row.colour.from, to: row.colour.to } } : {}) };
}
const read = new WeakMap<object, Grid | null>();

/**
 * The surface a carried molecule shows, as a picture draws it - its mesh
 * about the molecule's centre, in the page's units - and where it reaches
 * on the page, seen as the picture sees it: room the picture keeps for it,
 * a lobe reaching past the atoms. Null where it shows none.
 */
export function pictureSurface(m: Carried3D, style: Style3D, eye?: Eye): { plus: Mesh; minus: Mesh | null; bounds: { min: { x: number; y: number }; max: { x: number; y: number } } } | null {
  const shown = shownSurface(m);
  if (!shown) return null;
  const solid = solidOf({ ...m, id: 0 } as Molecule3D, style);
  const mesh = surfaceNow(shown.grid, frameCentre(m, frameOf(solid, m.frame)), shown.iso, shown.colour);
  const height = heightOf(m, solid, lookOf(m));
  const q = m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion();
  const mag = magnifiedOf(m);
  const p = new THREE.Vector3();
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const part of [mesh.plus, mesh.minus]) {
    if (!part) continue;
    const xyz = part.positions;
    for (let i = 0; i + 2 < xyz.length; i += 3) {
      p.set(xyz[i], xyz[i + 1], xyz[i + 2]).applyQuaternion(q).multiplyScalar(mag);
      const s = seenAt(m.at.x + p.x, m.at.y + p.y, height + p.z, eye);
      if (s.x < min.x) min.x = s.x;
      if (s.y < min.y) min.y = s.y;
      if (s.x > max.x) max.x = s.x;
      if (s.y > max.y) max.y = s.y;
    }
  }
  return Number.isFinite(min.x) ? { ...mesh, bounds: { min, max } } : null;
}
