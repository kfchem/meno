/**
 * A canvas with very many atoms on it - those drawn, and those ribbons
 * stand for (lib/chem/style3d `countedAtoms`): past `LARGE_ATOMS`, where
 * Settings says so ("Very large drawings: Lighter"), it is drawn lighter -
 * no shadows, and hollows shaded per atom where a style shades them on the
 * screen - so that turning stays smooth; and it says so, once. Kept by the
 * canvas's renderer: the key light (../components/KeyLight3D), which counts
 * the atoms, sets it; the molecules read it.
 */
import * as THREE from "three";
import type { WebGLRenderer } from "three";

/** How many atoms on a canvas make it a very large drawing. */
export const LARGE_ATOMS = 20_000;

export type LargeState = { atoms: number; lighter: boolean; told: boolean };
const states = new WeakMap<WebGLRenderer, LargeState>();

/** The canvas's state: how many atoms are on it, whether it is drawn lighter, and whether that has been said. */
export function largeOn(gl: WebGLRenderer): LargeState {
  let s = states.get(gl);
  if (!s) states.set(gl, (s = { atoms: 0, lighter: false, told: false }));
  return s;
}

/** Whether something would be drawn lighter, and what to say of it: none, where nothing would change. */
export function lighterText(shadows: boolean, screen: boolean): string | null {
  if (shadows && screen) return "Shown without shadows, and hollows shaded per atom, so that turning stays smooth.";
  if (shadows) return "Shown without shadows, so that turning stays smooth.";
  if (screen) return "Hollows shaded per atom, so that turning stays smooth.";
  return null;
}

/**
 * How many segments round each ball of a molecule, by how many pixels
 * across its largest ball is on the screen: 32 from about 40, down to 8
 * under about 8 - finer than the eye can tell at that size, and costing the
 * graphics card for nothing (the maintainer, 2026-10-13: 100 000 atoms
 * turned at 183 ms a frame with 32, 17 with 8). Under 40 pixels, a ball's
 * outline is within about 0.3 of a pixel of a circle at each (half its
 * width times one less the cosine of half a segment's angle), so that going
 * from one to another is not seen. On every canvas, not only one drawn
 * lighter: a large workflow page, 283 molecules in 3D, drew about 17.7
 * million triangles a frame at the style's 32 (2026-11-05). Never more than
 * the style's own (`most`).
 */
export function ballSegmentsFor(acrossPx: number, most: number): number {
  const segments = acrossPx >= 40 ? 32 : acrossPx >= 24 ? 24 : acrossPx >= 16 ? 16 : acrossPx >= 8 ? 12 : 8;
  return Math.min(most, segments);
}

/** How long the view stays within a hundredth of one zoom before a molecule's balls are given fewer segments, their size on the screen having shrunk, in ms. */
export const BALLS_SETTLE_MS = 150;
/** How near, as a share, a zoom is to another for the balls to count it as the same. */
export const BALLS_NEAR = 0.01;


/**
 * What a molecule's balls go to now, from the segments they have and those
 * their size on the screen wants (`ballSegmentsFor`): more at once, as they
 * grow on the screen; fewer only once the zoom has stayed for
 * `BALLS_SETTLE_MS` (`settledMs`, how long it has), so that a zoom going out
 * does not remake them at every step - else how long is left to wait.
 */
export function ballSegmentsNext(want: number, have: number, settledMs: number): { now: number } | { waitMs: number } | null {
  if (want === have) return null;
  if (want > have) return { now: want };
  const left = BALLS_SETTLE_MS - settledMs;
  return left <= 0 ? { now: want } : { waitMs: left };
}

/**
 * The segments round the line about a molecule's balls (utils/outlineMaterial):
 * as its balls', and past `fineMost` atoms no more than `coarse` - a line
 * as fine as the balls costs a frame more than it shows there. Around, and
 * half that from pole to pole where it is the coarse one.
 */
export function outlineSegments(balls: number, atoms: number, fineMost: number, coarse: number): [number, number] {
  if (atoms <= fineMost || balls <= coarse) return [balls, balls];
  return [coarse, coarse / 2];
}

/**
 * A molecule's unit sphere for its balls at `segments` round and from pole
 * to pole, with what each ball carries on the sphere it had (`was`) - its
 * number, whether it is lined, where its number stands: every instanced
 * attribute - moved over, so that going to more or fewer segments changes
 * nothing else of how its balls are drawn. The old sphere keeps none of
 * them: three's dispose of a geometry deletes the buffers of every
 * attribute it still lists, and the old sphere is disposed once the new one
 * has been drawn - shared, the new sphere's balls were left drawing from
 * deleted buffers, and drew nothing.
 */
export function carriedSphere(segments: number, was: THREE.BufferGeometry | null): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(1, segments, segments);
  if (was) {
    for (const [name, a] of Object.entries(was.attributes)) {
      if (!(a instanceof THREE.InstancedBufferAttribute)) continue;
      g.setAttribute(name, a);
      was.deleteAttribute(name);
    }
  }
  return g;
}

/**
 * How many screen pixels one unit of the scene spans at `depth` in front of
 * `camera` (its distance along the camera's view), the view `height` pixels
 * tall: an orthographic camera's - the canvas's - its zoom, wherever the
 * molecule stands; a perspective one's - Settings' previews - as far off as
 * the molecule stands. What a ball's size on the screen is reckoned by, and
 * a pixel at the molecule for its depth's fade.
 */
export function pxPerWorld(camera: THREE.Camera, height: number, depth: number): number {
  const pc = camera as THREE.PerspectiveCamera;
  if (pc.isPerspectiveCamera) return Math.max(height, 1) / (2 * Math.max(depth, 1e-6) * Math.tan((pc.fov * Math.PI) / 360));
  return (camera as THREE.OrthographicCamera).zoom || 1;
}
