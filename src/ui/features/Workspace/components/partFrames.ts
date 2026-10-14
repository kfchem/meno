/**
 * Work done at each frame for the parts of a layer of many - shapes, writing
 * by hand, words on the page - from the layer's one frame callback, not one
 * of each part's own: one each made every mount and unmount cost as much as
 * all of them, thousands at once taking seconds to come and to go. A part
 * has work at each frame only while it shows something that moves - a light
 * coming and going, a press held - and none at rest.
 */
import * as THREE from "three";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** A part's work at each frame, before it is drawn: given a pixel's size on the page, and the frame's time. */
export type PartFrame = (px: number, dt: number) => void;

const PartFrames = createContext<Set<PartFrame> | null>(null);

/** The parts' work, for the layer to give them (`PartFramesProvider`), done at each frame by its one callback. */
export function usePartFrames(): Set<PartFrame> {
  const camera = useThree((s) => s.camera);
  const parts = useMemo(() => new Set<PartFrame>(), []);
  useFrame((_, dt) => {
    if (!parts.size) return;
    const px = 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
    for (const part of parts) part(px, dt);
  });
  return parts;
}

export const PartFramesProvider = PartFrames.Provider;

/** How many parts have work at each frame, in all layers: for tests. */
let registered = 0;
export const partFramesRegistered = () => registered;

/** `work` done at each frame by the layer's one frame callback, as long as the part is there. */
export function usePartFrame(work: PartFrame): void {
  const parts = useContext(PartFrames);
  const latest = useRef(work);
  latest.current = work;
  useEffect(() => {
    if (!parts) return;
    const part: PartFrame = (px, dt) => latest.current(px, dt);
    parts.add(part);
    registered++;
    return () => {
      parts.delete(part);
      registered--;
    };
  }, [parts]);
}

/** A pixel's size on the page, as the view is now: for a press's reach, worked out as it comes rather than as a part was last drawn. */
export function pixelNow(camera: THREE.Camera): number {
  return 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
}

/** A box on the page, in the frame of what it is drawn in. */
export type HitBox = { x0: number; x1: number; y0: number; y1: number };

const plane = new THREE.Plane();
const normal = new THREE.Vector3(0, 0, 1);
const at = new THREE.Vector3();

/**
 * What a press takes on a part, worked out as the press comes: the box
 * `boxOf` gives then - grown by `reach`, as far as a press may miss by on
 * the screen - on the plane the part lies in. A part needs no geometry of
 * its own to be pressed, nor to be laid out again as the view zooms. (Its
 * mesh lies unturned and unscaled on the page, in its group.)
 */
export function boxRaycast(camera: THREE.Camera, boxOf: () => HitBox | null, reach = 0): THREE.Object3D["raycast"] {
  return function (this: THREE.Object3D, raycaster, intersects) {
    const b = boxOf();
    if (!b) return;
    const e = this.matrixWorld.elements;
    plane.set(normal, -e[14]);
    if (!raycaster.ray.intersectPlane(plane, at)) return;
    const slack = reach * pixelNow(camera);
    const x = at.x - e[12];
    const y = at.y - e[13];
    if (x < b.x0 - slack || x > b.x1 + slack || y < b.y0 - slack || y > b.y1 + slack) return;
    const distance = raycaster.ray.origin.distanceTo(at);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point: at.clone(), object: this });
  };
}

/** What a part's shapes share, made once: a square a side long, and what a press takes, never drawn. */
export const SQUARE = new THREE.PlaneGeometry(1, 1);
export const UNSEEN = new THREE.MeshBasicMaterial({ visible: false });
/** A part not to be pressed: what is drawn of it over what is. */
export const NO_RAYCAST: THREE.Object3D["raycast"] = () => undefined;
