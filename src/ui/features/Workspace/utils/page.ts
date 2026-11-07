import * as THREE from "three";

/**
 * How high above the page the canvas's camera stands, in world units (a
 * bond is 1.8): above anything standing on it. The camera is orthographic,
 * so how high changes nothing of what is seen.
 */
export const EYE_HEIGHT = 1000;

/**
 * The order things are done in each frame, before what is left at React
 * Three Fiber's 0 - the labels laid over the canvas (drei's Html) among it:
 * the camera moved first, then the molecules in 3D turned and placed, so
 * that a label is put where its atom is drawn this frame, not the one
 * before. (Below 0, so that the canvas still renders itself.)
 */
export const FRAME_ORDER = { camera: -2, molecules: -1 } as const;

/**
 * How far a camera that sees in perspective stands from the page, where a
 * view wants one (PageCamera): what the canvas used before it went
 * orthographic, kept for views that are to show depth.
 */
export const PAGE_DISTANCE = 60;

/**
 * Where a camera that sees in perspective looks from, in world units. A
 * view with an orthographic camera has none: it looks straight down from
 * anywhere, and nothing is seen larger for standing nearer.
 */
export type Eye = { x: number; y: number; z: number };

/** The eye of a camera that sees in perspective; none for an orthographic one. */
export function eyeOf(camera: THREE.Camera): Eye | undefined {
  return camera instanceof THREE.PerspectiveCamera ? camera.position : undefined;
}

/**
 * Where a point `z` above the page is seen on it, and how much larger than
 * on the page (`k`): straight below it, as large as it is, by an
 * orthographic camera; out from under an `eye`, and larger, in perspective.
 */
export function seenAt(x: number, y: number, z: number, eye?: Eye): { x: number; y: number; k: number } {
  if (!eye) return { x, y, k: 1 };
  const k = eye.z / Math.max(eye.z - z, 1e-3);
  return { x: eye.x + (x - eye.x) * k, y: eye.y + (y - eye.y) * k, k };
}

/**
 * The point of the page - the plane z = 0 - under a point of the screen,
 * given in normalised device coordinates: where the line of sight through
 * it meets the page, for an orthographic camera and a perspective one alike.
 */
export function pageAt(ndcX: number, ndcY: number, camera: THREE.Camera): THREE.Vector3 {
  const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
  const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
  return near.lerp(far, near.z / (near.z - far.z));
}

/** Where on the page (its units) a point on the screen is, over the canvas `el` seen by `camera`. */
export function pageAtScreen(screen: { x: number; y: number }, el: HTMLElement, camera: THREE.Camera): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const p = pageAt(((screen.x - r.left) / r.width) * 2 - 1, -((screen.y - r.top) / r.height) * 2 + 1, camera);
  return { x: p.x, y: p.y };
}
