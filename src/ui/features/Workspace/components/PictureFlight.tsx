/**
 * A box carried out of a PDF as a picture (docs/PDF.md, *Taking things
 * out*; components/boxDrag), drawn over everything - the column too - in
 * the canvas's own pixels (PdfColumn's last pass).
 *
 * It lifts off where it lay, toward the viewer - a little larger, a soft
 * shadow falling below it - its picture coming up in it once PDFium has
 * drawn it, and follows the pointer, held where it was pressed; over the
 * canvas, as large as the canvas shows the page. Let go there, it settles
 * onto it and the picture on the page takes its place; anywhere else, it
 * goes back down where it lay.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { TAU, follow } from "../../../theme/motion";
import { COLORS } from "../../../theme/colors";
import { useEditorStore } from "../store";
import type { PictureFlight as Flight } from "../store/types";

/** How long it takes to lift off, to come up once drawn, to settle where it is let go, to go back, and to give way to the picture on the page, in ms. */
const LIFT_MS = 220;
const SHOW_MS = 160;
const SETTLE_MS = 200;
const BACK_MS = 300;
const HANDOVER_MS = 120;
/** How long a picture that does not come is waited for, settled, before the flight goes, in ms. */
const WAIT_MS = 3000;
/** How high it is held, in pixels, and how far off the viewer is: held, it is that much nearer, and larger. */
const HEIGHT_PX = 36;
const DEPTH_PX = 760;
/** Its shadow: how strong, and how far it is blurred, in pixels. */
const SHADOW = 0.22;
const SHADOW_BLUR_PX = 14;

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const inOut = (u: number) => {
  const t = clamp01(u);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const out = (u: number) => 1 - (1 - clamp01(u)) ** 3;

// language=GLSL
const SHADOW_VERTEX = /* glsl */ `
uniform vec2 uSize;
varying vec2 vAt;
void main() {
  vAt = position.xy * uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// language=GLSL
const SHADOW_FRAGMENT = /* glsl */ `
uniform vec2 uHalf;
uniform float uBlur;
uniform float uOpacity;
varying vec2 vAt;
void main() {
  // (how far out of the box, in pixels: dark in it, fading out over the blur round it)
  vec2 d = max(abs(vAt) - uHalf, 0.0);
  float a = uOpacity * (1.0 - smoothstep(0.0, uBlur, length(d)));
  if (a <= 0.0) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

export default function PictureFlight({ f }: { f: Flight }) {
  const store = useEditorStore();
  const { gl, camera, invalidate } = useThree();
  const [x0, y0, x1, y1] = f.box.box;
  const w = (x1 - x0) * f.point;
  const h = (y1 - y0) * f.point;
  // where in it the pointer holds it, in units of the page from its middle (as components/boxDrag puts it down)
  const held = useMemo(() => ({ x: (f.grab.x - f.from.left) / f.from.k - w / 2, y: h / 2 - (f.grab.y - f.from.top) / f.from.k }), [f.grab, f.from, w, h]);
  const sheet = useRef<THREE.Mesh>(null);
  const picture = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const materials = useMemo(
    () => ({
      sheet: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
      edge: new THREE.LineBasicMaterial({ color: COLORS.highlight, transparent: true, depthTest: false, toneMapped: false }),
      picture: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
      shadow: new THREE.ShaderMaterial({
        uniforms: { uSize: { value: new THREE.Vector2(1, 1) }, uHalf: { value: new THREE.Vector2() }, uBlur: { value: 1 }, uOpacity: { value: 0 } },
        vertexShader: SHADOW_VERTEX,
        fragmentShader: SHADOW_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    }),
    [],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), []);
  useEffect(
    () => () => {
      // (its picture's pixels let go with it)
      (materials.picture.map?.image as ImageBitmap | undefined)?.close?.();
      materials.picture.map?.dispose();
      for (const m of Object.values(materials)) m.dispose();
      edges.dispose();
    },
    [materials, edges],
  );
  const motion = useRef<{ k: number; shownAt: number | null; end: { k: number; x: number; y: number } | null; settled: number | null; handed: number | null }>({
    k: f.from.k,
    shownAt: null,
    end: null,
    settled: null,
    handed: null,
  });

  useFrame((_, dt) => {
    const now = performance.now();
    const m = motion.current;
    const end = f.now.end;
    const rect = gl.domElement.getBoundingClientRect();
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    // (its picture, once drawn: given to WebGL once, coming up over the white)
    if (f.now.shown && !materials.picture.map) {
      const t = new THREE.Texture(f.now.shown);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      materials.picture.map = t;
      materials.picture.needsUpdate = true;
      m.shownAt = now;
    }
    let lift = out((now - f.start) / LIFT_MS);
    let seen = 1;
    let pointer = { x: f.now.x, y: f.now.y };
    if (end && !m.end) m.end = { k: m.k, x: f.now.x, y: f.now.y };
    if (end?.to === "back" && m.end) {
      // going back down where it lay
      const b = inOut((now - end.start) / BACK_MS);
      pointer = { x: m.end.x + (f.grab.x - m.end.x) * b, y: m.end.y + (f.grab.y - m.end.y) * b };
      m.k = m.end.k + (f.from.k - m.end.k) * b;
      lift *= 1 - b;
      seen = 1 - b;
      if (b >= 1) {
        store.getState().setPdfPicture(null);
        return;
      }
    } else if (end?.to === "page" && m.end) {
      // settling onto the canvas, as large as it shows the page; then the picture there in its place
      const s = inOut((now - end.start) / SETTLE_MS);
      m.k = m.end.k + (zoom - m.end.k) * s;
      lift *= 1 - s;
      if (s >= 1) {
        m.settled ??= now;
        if (m.handed == null && f.landing != null) {
          m.handed = now;
          store.getState().setPdfPicture({ ...f, landing: null });
        }
        if (m.handed != null) seen = 1 - clamp01((now - m.handed) / HANDOVER_MS);
        else if (now - m.settled > WAIT_MS) seen = 1 - clamp01((now - m.settled - WAIT_MS) / HANDOVER_MS);
        if (seen <= 0) {
          store.getState().setPdfPicture(null);
          return;
        }
      }
    } else {
      const to = f.now.over ? zoom : f.from.k;
      m.k = Math.abs(m.k - to) < to * 1e-4 ? to : follow(m.k, to, Math.min(dt, 1 / 20), TAU.move);
    }
    const k = m.k;
    const P = { x: pointer.x - rect.left, y: -(pointer.y - rect.top) };
    const mid = { x: P.x - held.x * k, y: P.y - held.y * k };
    const z = HEIGHT_PX * lift;
    const near = DEPTH_PX / (DEPTH_PX - z);
    const at = { x: P.x + (mid.x - P.x) * near, y: P.y + (mid.y - P.y) * near };
    for (const o of [sheet.current, picture.current]) {
      if (!o) continue;
      o.position.set(at.x, at.y, 0);
      o.scale.set(w * k * near, h * k * near, 1);
    }
    if (shadow.current) {
      // (the box it falls from, and the blur round it, in pixels - the higher, the softer)
      const blur = SHADOW_BLUR_PX * (0.5 + lift);
      const size = { x: w * k + 2 * blur, y: h * k + 2 * blur };
      shadow.current.position.set(mid.x + 0.12 * z, mid.y - 0.3 * z, 0);
      shadow.current.scale.set(size.x, size.y, 1);
      const u = materials.shadow.uniforms;
      u.uSize.value.set(size.x, size.y);
      u.uHalf.value.set((w * k) / 2, (h * k) / 2);
      u.uBlur.value = blur;
      u.uOpacity.value = SHADOW * lift * seen;
    }
    const up = m.shownAt == null ? 0 : out((now - m.shownAt) / SHOW_MS);
    materials.sheet.opacity = seen;
    materials.edge.opacity = (1 - up) * seen;
    materials.picture.opacity = up * seen;
    invalidate();
  });

  return (
    <>
      <mesh ref={shadow} renderOrder={27} material={materials.shadow}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={sheet} renderOrder={28} material={materials.sheet}>
        <planeGeometry args={[1, 1]} />
        <lineSegments geometry={edges} material={materials.edge} renderOrder={29} />
      </mesh>
      <mesh ref={picture} renderOrder={30} material={materials.picture}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}
