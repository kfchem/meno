/**
 * Text sheets' pictures of their own words (utils/sheetPicture): each
 * drawn once, from the sheet's live words themselves, into a picture of
 * its own - a render target, with its smaller copies (mip-maps) so that
 * it stays calm as the view zooms - in an idle slot while the view is
 * still; let go of as the sheet leaves the page or the page closes, and
 * as a new one is made.
 */
import * as THREE from "three";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { whenIdle } from "../../../../lib/core/idle";
import { makesNow, pictureQueue, pictureSize } from "../utils/sheetPicture";

/** When the view last moved, and whether a press is held: pictures are made only while it is still. */
const view = { movedAt: 0, pressed: false };
const queue = pictureQueue(
  () => makesNow(performance.now(), view.movedAt, view.pressed),
  (work, ms) => void setTimeout(() => whenIdle(work), ms),
);
/** The bytes each sheet's picture holds, by the text's id. */
const held = new Map<number, number>();

/** How many bytes the page's sheets' pictures hold, their smaller copies with them. */
export function sheetPictureBytes(): number {
  let n = 0;
  for (const b of held.values()) n += b;
  return n;
}

/** Where the view moves (its zoom, its place) and where a press is held, heard for the pictures' sake: once on the page. */
export function useViewStill(): void {
  const { camera } = useThree();
  const last = useRef({ zoom: NaN, x: NaN, y: NaN });
  useFrame(() => {
    const l = last.current;
    const { zoom } = camera as THREE.OrthographicCamera;
    const { x, y } = camera.position;
    if (l.zoom !== zoom || l.x !== x || l.y !== y) {
      view.movedAt = performance.now();
      last.current = { zoom, x, y };
    }
  });
  useEffect(() => {
    const down = () => {
      view.pressed = true;
    };
    const up = () => {
      view.pressed = false;
      view.movedAt = performance.now();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      view.pressed = false;
    };
  }, []);
}

/** Whether every troika text in `o` has its letters set: a picture is drawn only of words laid out as they are. */
function wordsSet(o: THREE.Object3D): boolean {
  let set = true;
  o.traverse((c) => {
    const t = c as THREE.Object3D & { _needsSync?: boolean; _isSyncing?: boolean; textRenderInfo?: unknown; text?: string };
    if (t._needsSync === undefined) return;
    if (t._needsSync || t._isSyncing || (t.text && !t.textRenderInfo)) set = false;
  });
  return set;
}

/**
 * `sheet` - the sheet's paper and words, `w` x `h` in its own units, its
 * top left at its origin, down negative - drawn into a picture `width` x
 * `height` device pixels. Written as the canvas is written (its colours
 * in the screen's encoding, blended as the canvas blends them: three
 * treats a target so marked as it does the screen), so that the picture
 * and the live words are the same to look at.
 */
function drawPicture(gl: THREE.WebGLRenderer, sheet: THREE.Object3D, w: number, h: number, width: number, height: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true,
  });
  (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  rt.texture.anisotropy = gl.capabilities.getMaxAnisotropy();
  const cam = new THREE.OrthographicCamera(0, w, 0, -h, 0, 2);
  cam.matrixAutoUpdate = false;
  cam.matrixWorldAutoUpdate = false;
  sheet.updateWorldMatrix(true, false);
  cam.matrixWorld.copy(sheet.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, 0, 1));
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const before = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const alpha = gl.getClearAlpha();
  gl.setRenderTarget(rt);
  gl.setClearColor(0xffffff, 1);
  gl.clear(true, true, true);
  gl.render(sheet, cam);
  gl.setRenderTarget(before);
  gl.setClearColor(clear, alpha);
  return rt;
}

/**
 * A sheet's picture of its words: made once `wanted` (its words laid out
 * live in `sheet`, not being edited) for `key` - what it shows - and made
 * again only as `key` changes; `made` where it shows `key`.
 */
export function useSheetPicture(
  id: number,
  sheet: RefObject<THREE.Object3D | null>,
  key: string,
  wanted: boolean,
  w: number,
  h: number,
  type: number,
): { texture: THREE.Texture | null; made: boolean } {
  const { gl, invalidate } = useThree();
  const [picture, setPicture] = useState<{ rt: THREE.WebGLRenderTarget; key: string } | null>(null);
  const size = useRef({ w, h, type });
  size.current = { w, h, type };
  const dpr = gl.getPixelRatio();
  // (made again on a screen of other pixels, too)
  const of = `${key}|${dpr}`;
  const made = picture?.key === of;
  useEffect(() => {
    if (!wanted || made) return;
    queue.ask(id, () => {
      const o = sheet.current;
      if (!o || !wordsSet(o)) return false;
      const { w: ww, h: hh, type: tt } = size.current;
      const { width, height, bytes } = pictureSize(ww, hh, tt, dpr);
      const rt = drawPicture(gl, o, ww, hh, width, height);
      held.set(id, bytes);
      setPicture((was) => {
        was?.rt.dispose();
        return { rt, key: of };
      });
      invalidate();
      return true;
    });
    return () => queue.drop(id);
  }, [id, of, wanted, made, sheet, gl, dpr, invalidate]);
  // (let go of with the sheet, or the page)
  const now = useRef(picture);
  now.current = picture;
  useEffect(
    () => () => {
      now.current?.rt.dispose();
      held.delete(id);
    },
    [id],
  );
  return { texture: picture?.rt.texture ?? null, made };
}

/** What a sheet's picture is drawn with: as it was written, the canvas's encoding, as much as `opacity`. */
export function pictureMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, opacity: { value: 1 } },
    vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
    fragmentShader: "uniform sampler2D map;\nuniform float opacity;\nvarying vec2 vUv;\nvoid main() {\n  vec4 c = texture2D(map, vUv);\n  gl_FragColor = vec4(c.rgb, c.a * opacity);\n}",
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
