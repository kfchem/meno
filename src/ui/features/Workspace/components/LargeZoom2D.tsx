import * as THREE from "three";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useDrawnLayout } from "./drawnLayoutContext";
import { PICTURE_MARGIN, PICTURE_MOST_PIXELS } from "../utils/largeZoom";
import { TAU, follow } from "../../../theme/motion";

/**
 * A very large drawing held as a picture as the view zooms ("picture",
 * utils/largeZoom): the drawing's layers in `Held2D` - its lines, caps,
 * shapes, labels, marks, arrows and words - are drawn once into a picture
 * of the view and a margin round it, as the zoom starts, and the picture is
 * shown in their place, scaled with the view on the graphics card; once the
 * zoom stops and the drawing is laid out at it, they are drawn again, sharp,
 * and the picture fades from over them. What is not held - what the pointer
 * lights, what is selected, its handles - is drawn live all the while, over
 * the picture where it is drawn over the drawing.
 */

/** The layer what is held is drawn on for its picture (screenShade's is 2). */
const HELD_LAYER = 3;
/** Where the picture is drawn among the drawing's layers: over all that is held (labels at 30), under what is selected (39 and up). */
const PICTURE_ORDER = 35;

/** The groups held on a canvas, by its renderer: each `Held2D` puts its own in. */
const held = new WeakMap<THREE.WebGLRenderer, Set<THREE.Group>>();
function heldOn(gl: THREE.WebGLRenderer): Set<THREE.Group> {
  let set = held.get(gl);
  if (!set) held.set(gl, (set = new Set()));
  return set;
}

/** Layers of the drawing held as a picture while a very large drawing's view zooms: drawn as ever, but for then. */
export function Held2D({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const set = heldOn(gl);
    set.add(g);
    return () => void set.delete(g);
  }, [gl]);
  return <group ref={group}>{children}</group>;
}

/** The picture the held layers are shown as while the view zooms; nothing, where the drawing does not wait for the zoom so. */
export function LargeZoomPicture2D() {
  const { gl, scene, camera, invalidate } = useThree();
  const { zoom: laid, waits, layout } = useDrawnLayout();
  const on = waits === "picture";
  const quad = useRef<THREE.Mesh>(null);
  // (the picture holds its colours multiplied by how much is there: laid over what is under it as it is, and faded as a whole)
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      }),
    [],
  );
  const target = useRef<THREE.WebGLRenderTarget | null>(null);
  const state = useRef<{ held: boolean; level: number; of: unknown }>({ held: false, level: 0, of: null });
  useEffect(
    () => () => {
      material.dispose();
      target.current?.dispose();
      for (const g of heldOn(gl)) g.visible = true;
    },
    [material, gl],
  );

  /** The held layers drawn into the picture, as the view is now and a margin round it; the picture placed over what it shows. */
  const take = (groups: Set<THREE.Group>) => {
    const cam = camera as THREE.OrthographicCamera;
    const k = 1 + 2 * PICTURE_MARGIN;
    const shot = cam.clone();
    shot.left *= k;
    shot.right *= k;
    shot.top *= k;
    shot.bottom *= k;
    shot.updateProjectionMatrix();
    shot.updateMatrixWorld();
    shot.layers.set(HELD_LAYER);
    // (at the screen's resolution, as far as the graphics card and `PICTURE_MOST_PIXELS` allow)
    const buffer = gl.getDrawingBufferSize(new THREE.Vector2());
    const most = gl.capabilities.maxTextureSize;
    const fit = Math.min(1, Math.sqrt(PICTURE_MOST_PIXELS / (buffer.x * k * buffer.y * k)), most / (buffer.x * k), most / (buffer.y * k));
    const w = Math.max(1, Math.floor(buffer.x * k * fit));
    const h = Math.max(1, Math.floor(buffer.y * k * fit));
    let t = target.current;
    if (!t || t.width !== w || t.height !== h) {
      t?.dispose();
      t = target.current = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
      material.map = t.texture;
      material.needsUpdate = true;
    }
    for (const g of groups) {
      g.visible = true;
      g.traverse((o) => o.layers.enable(HELD_LAYER));
    }
    const background = scene.background;
    const clear = gl.getClearColor(new THREE.Color());
    const clearAlpha = gl.getClearAlpha();
    scene.background = null;
    gl.setRenderTarget(t);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
    gl.render(scene, shot);
    gl.setRenderTarget(null);
    gl.setClearColor(clear, clearAlpha);
    scene.background = background;
    const q = quad.current!;
    const a = new THREE.Vector3(-1, -1, 0).unproject(shot);
    const b = new THREE.Vector3(1, 1, 0).unproject(shot);
    q.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    q.scale.set(b.x - a.x, b.y - a.y, 1);
  };

  useFrame((_, dt) => {
    const q = quad.current;
    if (!q) return;
    const s = state.current;
    const groups = heldOn(gl);
    // (waiting: the view at another zoom than the drawing is laid out for)
    const waiting = on && ((camera as THREE.OrthographicCamera).zoom || 1) !== laid;
    // (taken again where the drawing changes while it is held - an edit, a typeface come in)
    if (waiting && (!s.held || s.of !== layout)) {
      take(groups);
      s.held = true;
      s.level = 1;
      s.of = layout;
      for (const g of groups) g.visible = false;
    } else if (!waiting && s.held) {
      // (laid out at the zoom: drawn sharp, the picture fading from over it)
      s.held = false;
      for (const g of groups) g.visible = true;
    }
    if (!s.held && s.level > 0) {
      const v = follow(s.level, 0, Math.min(dt, 1 / 30), TAU.quick);
      s.level = v < 0.01 ? 0 : v;
      invalidate();
      if (s.level === 0) {
        target.current?.dispose();
        target.current = null;
        material.map = null;
        material.needsUpdate = true;
      }
    }
    q.visible = s.level > 0;
    material.color.setScalar(s.level);
    material.opacity = s.level;
  });

  return (
    <mesh ref={quad} visible={false} renderOrder={PICTURE_ORDER} frustumCulled={false} raycast={() => {}} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
