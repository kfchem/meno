import { STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { heightOf, lookOf, reachOf, solidOf } from "./molecule3d";

/** A molecule in 3D as a document holds it or a copy carries it (with its turn and frame, which a restyle leaves as they are). */
type Placed3D = Omit<Molecule3D, "id">;

/** A molecule's sphere: about its centre, as high as it stands, as far as it reaches in any frame and any turn, in the look it is shown in. */
type Sphere = { x: number; y: number; z: number; r: number };

/**
 * Molecules in 3D as a change of the drawing style puts them (utils/restyle
 * `restyled`): each body's middle moved to `about` + (middle - `about`) x
 * `k`, k being the old style's bond length in pt over the new one's - so
 * that it stays where it was in pt - and everything else as it was. A
 * molecule keeps its size in world units (1.5 Å is a drawn bond in every
 * style), its height, its turn, its frame and its atoms; a body - the
 * molecules whose spheres touch, a complex put together on the page, ones
 * turned together that touch - keeps the offsets among them, so that it is
 * written in the same ångströms as before (utils/written). Separate
 * bodies move apart or closer in world units, as structures in 2D do. A
 * body's middle is the middle of its spheres' box on the page: a lone
 * molecule's, where it stands. Where `k` is 1, the very molecules given.
 */
export function restyled3d<M extends Placed3D>(molecules: readonly M[], k: number, about: { x: number; y: number } = { x: 0, y: 0 }, style: Style3D = STYLE_3D): M[] {
  // (the same array: nothing to convert, nothing made anew)
  if (k === 1 || molecules.length === 0) return molecules as M[];
  // (each one's sphere holds it in every frame and turned any way: which touch is the same however they are turned and shown)
  const spheres: Sphere[] = molecules.map((m) => {
    const solid = solidOf(m as unknown as Molecule3D, style);
    const look = lookOf(m);
    return { x: m.at.x, y: m.at.y, z: heightOf(m, solid, look), r: reachOf(m, solid, look) };
  });
  const body = bodiesOf(spheres);
  const boxes = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  spheres.forEach((s, i) => {
    const b = boxes.get(body[i]) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    boxes.set(body[i], { x0: Math.min(b.x0, s.x - s.r), x1: Math.max(b.x1, s.x + s.r), y0: Math.min(b.y0, s.y - s.r), y1: Math.max(b.y1, s.y + s.r) });
  });
  return molecules.map((m, i) => {
    const b = boxes.get(body[i])!;
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2;
    const dx = about.x + (mx - about.x) * k - mx;
    const dy = about.y + (my - about.y) * k - my;
    return { ...m, at: { ...m.at, x: m.at.x + dx, y: m.at.y + dy } };
  });
}

/** Which body each sphere is of (by the first of its body's index): spheres that touch, or touch one that does, are one body. */
export function bodiesOf(spheres: readonly Sphere[]): number[] {
  const up = spheres.map((_, i) => i);
  const top = (i: number): number => {
    while (up[i] !== i) i = up[i] = up[up[i]];
    return i;
  };
  for (let i = 0; i < spheres.length; i++) {
    for (let j = i + 1; j < spheres.length; j++) {
      const a = spheres[i];
      const b = spheres[j];
      const reach = a.r + b.r;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > reach * (1 + 1e-9)) continue;
      const [ti, tj] = [top(i), top(j)];
      if (ti !== tj) up[Math.max(ti, tj)] = Math.min(ti, tj);
    }
  }
  return spheres.map((_, i) => top(i));
}
