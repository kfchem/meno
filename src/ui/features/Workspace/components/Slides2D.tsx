/**
 * Slides on the page (docs/PRESENTING.md): each a frame round what a talk
 * shows at one point of it, in Meno's own colour, faint, its number at its
 * upper left corner, and a dashed line from each to the next in the talk's
 * order, a small arrowhead half way along it. Over everything on the page,
 * as thin as the light round a picture; gone while a talk is given, and
 * never in a picture of the page.
 *
 * What lies in a slide is the page's: only its edge and its number are the
 * slide's.
 * - A press on its edge is as on empty space: a drag moves the view. Held
 *   still a moment, the slide is taken hold of - lit from the pointer out -
 *   and selected, and the drag then moves it. A click selects it alone;
 *   Ctrl (Cmd on a Mac) and a click adds it to the selection or takes it
 *   out. Selected, a drag on its edge moves the selection.
 * - Its number dragged onto another slide puts it there in the talk's
 *   order, the others moving up or down one; held still and let go, it
 *   selects it as the edge does.
 * - Selected, a handle at each corner makes it larger or smaller, its
 *   proportions kept and the opposite corner where it was.
 * - Lit while the pointer is on its edge or its number.
 */
import * as THREE from "three";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useEditor, useEditorStore } from "../store";
import type { Slide } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { setCursor } from "../../../theme/cursors";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { pageAt } from "../utils/page";
import { guideScale } from "../utils/guiding";
import { dragSelection } from "../utils/dragSelection";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { useStyleOptions } from "../useDrawingStyle";
import { useLabelFontUrl } from "../../../fonts/typefaces";
import { boxOf, joinOf } from "../presenting/slides";

/** Where slides' frames lie: over the drawing and what is on the page. */
const Z = 0.6;
/** On the screen, in pixels: the frame's line; how far either side of it a press still takes it; the number's disc and its figures; the dashes of the line to the next and its arrowhead. */
const LINE_PX = 1.5;
const EDGE_PX = 6;
const NUMBER_PX = 11;
const FIGURES_PX = 12;
const JOIN_PX = 1.5;
const DASH_PX = 7;
const GAP_PX = 5;
const HEAD_PX = 6;
/** A corner's handle, on the screen: its radius, and how far off it a press still takes it, in its radii; how small a slide may be made, in pixels. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
const LEAST_PX = 48;
/** How a frame is seen at rest, and lit; the line to the next. */
const REST = 0.45;
const LIT = 0.95;
const JOIN = 0.5;
/** How far a press may move and still be a click, and before it moves the view (PanZoom2D's), in pixels. */
const CLICK_PX = 4;
const PAN_PX = 3;

type Pt = { x: number; y: number };

export default function Slides2D() {
  const slides = useEditor((s) => s.slides);
  const selSlides = useEditor((s) => s.selSlides);
  const hovered = useEditor((s) => s.hoveredSlide);
  const presenting = useEditor((s) => s.presenting != null);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  // (the number in the drawing's type, as a PDF's name is - the style's, so that a zoom draws none of this again: each
  // part keeps its size on the screen frame by frame, `useScreenSize`)
  const font = useLabelFontUrl(useStyleOptions().fontFamily ?? "Arial", false);
  // how much they are seen: none while a talk is given, coming and going - eased on their materials frame by frame,
  // as the view moves at a talk's start and end, and gone once unseen
  const seen = useRef(presenting ? 0 : 1);
  const [gone, setGone] = useState(presenting);
  // each part's work at a frame - its size on the screen, how much it is seen - done here, in one of the canvas's frame
  // callbacks, not one of its own each: the canvas sorts all of those again at every one added, and a talk's end adds
  // the slides' parts all at once
  const parts = useMemo(() => new Set<PartFrame>(), []);
  useFrame((_, dt) => {
    const to = presenting ? 0 : 1;
    const now = seen.current;
    if (now !== to) {
      const next = Math.abs(now - to) < 0.01 ? to : follow(now, to, Math.min(dt, 1 / 20), TAU.move);
      seen.current = next;
      if ((next === 0) !== gone) setGone(next === 0);
      invalidate();
    }
    const px = 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
    for (const part of parts) part(px, dt);
  });
  // a number being dragged onto another slide: where it is, and the slide it is over
  const [carried, setCarried] = useState<{ id: number; at: Pt; over: number | null } | null>(null);

  const toWorld = (cx: number, cy: number): Pt => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  // the slide a point lies in, other than `not`: the smallest that holds it
  const slideAt = (p: Pt, not: number): number | null => {
    let best: Slide | null = null;
    for (const s of store.getState().slides) {
      if (s.id === not) continue;
      const b = boxOf(s);
      if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && (!best || s.w * s.h < best.w * best.h)) best = s;
    }
    return best?.id ?? null;
  };

  const startCarry = (id: number, ev: PointerEvent) => {
    const from = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const onMove = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - from.x, m.clientY - from.y) < CLICK_PX) return;
      moved = true;
      const at = toWorld(m.clientX, m.clientY);
      setCarried({ id, at, over: slideAt(at, id) });
      invalidate();
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(u.pointerId);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCarried(null);
      if (!moved) {
        s.clearSel();
        s.selectSlides([id]);
        return;
      }
      const over = slideAt(toWorld(u.clientX, u.clientY), id);
      const to = over == null ? -1 : s.slides.findIndex((x) => x.id === over);
      if (to >= 0) s.orderSlide(id, to);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  const joins = useMemo(() => slides.slice(1).map((s, i) => joinOf(slides[i], s)), [slides]);
  const joinSeen = useCallback(() => JOIN * seen.current, []);
  const carriedSeen = useCallback(() => 0.85, []);
  if (!slides.length || (gone && presenting)) return null;
  return (
    <PartFrames.Provider value={parts}>
      <group position={[0, 0, Z]}>
        {joins.map((j, i) => (j ? <Join key={`${slides[i].id}-${slides[i + 1].id}`} from={j.from} to={j.to} opacity={joinSeen} /> : null))}
        {slides.map((s, i) => (
          <SlideFrame
            key={s.id}
            s={s}
            n={i + 1}
            seen={seen}
            font={font}
            selected={selSlides.has(s.id)}
            lit={hovered === s.id || carried?.over === s.id}
            toWorld={toWorld}
            onCarry={startCarry}
          />
        ))}
        {carried && (
          <group position={[carried.at.x, carried.at.y, 0.01]}>
            <SlideNumber n={slides.findIndex((x) => x.id === carried.id) + 1} font={font} opacity={carriedSeen} />
          </group>
        )}
      </group>
    </PartFrames.Provider>
  );
}

/** A part's work at each frame, before it is drawn: given a pixel's size on the page, and the frame's time. */
type PartFrame = (px: number, dt: number) => void;
const PartFrames = createContext<Set<PartFrame> | null>(null);

/** `work` done at each frame by the slides' one frame callback (Slides2D), as long as the part is there. */
function usePartFrame(work: PartFrame): void {
  const parts = useContext(PartFrames);
  const latest = useRef(work);
  latest.current = work;
  useEffect(() => {
    if (!parts) return;
    const part: PartFrame = (px, dt) => latest.current(px, dt);
    parts.add(part);
    return () => void parts.delete(part);
  }, [parts]);
}

/**
 * A part kept the same size on the screen at any zoom: `place` called with
 * a pixel's size on the page as it changes - before the frame is drawn, never
 * by drawing anything again - and once more where `deps` change.
 */
function useScreenSize(place: (px: number) => void, deps: readonly unknown[]): void {
  const at = useRef<{ px: number; deps: readonly unknown[] } | null>(null);
  usePartFrame((px) => {
    const was = at.current;
    if (was && was.px === px && was.deps.length === deps.length && was.deps.every((d, i) => d === deps[i])) return;
    at.current = { px, deps };
    place(px);
  });
}

/** A slide's number: a disc in Meno's colour, its figures in white, the same size on the screen at any zoom; as seen as `opacity` says, frame by frame. */
function SlideNumber({ n, font, opacity }: { n: number; font: string | null; opacity: () => number }) {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.MeshBasicMaterial>(null);
  const figures = useRef<THREE.Mesh & { fillOpacity: number }>(null);
  useScreenSize((px) => group.current?.scale.setScalar(px), []);
  usePartFrame(() => {
    const o = opacity();
    if (disc.current) disc.current.opacity = o;
    if (figures.current) figures.current.fillOpacity = o;
  });
  return (
    <group ref={group}>
      <mesh renderOrder={44}>
        <circleGeometry args={[NUMBER_PX, 28]} />
        <meshBasicMaterial ref={disc} color={COLORS.base} transparent opacity={opacity()} depthTest={false} toneMapped={false} />
      </mesh>
      <Text ref={figures} font={font ?? undefined} fontSize={FIGURES_PX} anchorX="center" anchorY="middle" color="#ffffff" fillOpacity={opacity()} renderOrder={45}>
        {String(n)}
      </Text>
    </group>
  );
}

/** A slide's four sides, `line` wide: each a rectangle's middle and its width and height, from the slide's middle - the top, the bottom, the right, the left. */
function sidesOf(s: Pick<Slide, "w" | "h">, line: number): [number, number, number, number][] {
  return [
    [0, s.h / 2, s.w + line, line],
    [0, -s.h / 2, s.w + line, line],
    [s.w / 2, 0, line, s.h],
    [-s.w / 2, 0, line, s.h],
  ];
}

function SlideFrame({
  s,
  n,
  seen,
  font,
  selected,
  lit,
  toWorld,
  onCarry,
}: {
  s: Slide;
  n: number;
  seen: { readonly current: number };
  font: string | null;
  selected: boolean;
  lit: boolean;
  toWorld: (cx: number, cy: number) => Pt;
  onCarry: (id: number, ev: PointerEvent) => void;
}) {
  const store = useEditorStore();
  const { gl, invalidate } = useThree();
  // its line, lit while the pointer is on it, coming and going
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.base, transparent: true, opacity: REST, depthTest: false, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  // taken hold of by a press held on its edge: where, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => invalidate(), [held, invalidate]);
  usePartFrame((_, dt) => {
    if (held && heldShows(held, performance.now())) {
      setTick((t) => t + 1);
      invalidate();
    }
    const to = (lit || selected ? LIT : REST) * seen.current;
    material.color.set(selected ? COLORS.highlight : COLORS.base);
    if (Math.abs(material.opacity - to) < 1e-3) {
      material.opacity = to;
      return;
    }
    material.opacity = follow(material.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });

  // (what is drawn on the page under its edge is pressed, not the slide)
  const drawingHas = () => {
    const st = store.getState();
    return st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d != null || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredMark != null;
  };
  const onDown = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }, onNumber: boolean) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0 || drawingHas()) return;
    e.stopPropagation();
    const st = store.getState();
    if (addsToSelection(ev)) {
      st.toggleSlideSel(s.id);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY };
    const move = () => {
      store.getState().beginPanHold(ev.pointerId);
      dragSelection(store, toWorld, from, (u) => {
        const s2 = store.getState();
        s2.endPanHold(u.pointerId);
        s2.suppressDoubleClick(DOUBLE_CLICK_MS);
        setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      });
    };
    // its number: dragged, onto another slide; a drag never moves the view from it
    if (onNumber && !st.selSlides.has(s.id)) {
      st.beginPanHold(ev.pointerId);
      onCarry(s.id, ev);
      return;
    }
    // selected: a drag moves the selection
    if (st.selSlides.has(s.id)) {
      move();
      return;
    }
    // else a drag moves the view; held still, it is taken hold of; a click selects it
    const at = toWorld(ev.clientX, ev.clientY);
    setHeld({ x: at.x - s.x, y: at.y - s.y, start: performance.now() });
    invalidate();
    let panned = false;
    const hold = window.setTimeout(() => {
      stop();
      const s2 = store.getState();
      s2.clearSel();
      s2.selectSlides([s.id]);
      setHeld((h) => (h ? { ...h, done: true } : h));
      move();
    }, LONG_PRESS_MS);
    const onMove = (m: PointerEvent) => {
      if (panned || Math.hypot(m.clientX - from.x, m.clientY - from.y) < PAN_PX) return;
      panned = true;
      window.clearTimeout(hold);
      setHeld((h) => (h ? { ...h, let: performance.now() } : h));
    };
    const onUp = (u: PointerEvent) => {
      stop();
      window.clearTimeout(hold);
      setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      if (panned || Math.hypot(u.clientX - from.x, u.clientY - from.y) >= CLICK_PX) return;
      const s2 = store.getState();
      s2.clearSel();
      s2.selectSlides([s.id]);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };
  const over = () => store.getState().setHoveredSlide(s.id);
  const out = () => {
    if (store.getState().hoveredSlide === s.id) store.getState().setHoveredSlide(null);
  };

  // its edge's line and the band along it a press takes, the same width on the screen at any zoom
  const lines = useRef<(THREE.Mesh | null)[]>([]);
  const bands = useRef<(THREE.Mesh | null)[]>([]);
  useScreenSize(
    (px) => {
      const line = LINE_PX * px;
      const edge = 2 * EDGE_PX * px;
      sidesOf(s, line).forEach(([x, y, w, h], k) => {
        lines.current[k]?.position.set(x, y, 0);
        lines.current[k]?.scale.set(w, h, 1);
        bands.current[k]?.position.set(x, y, 0);
        bands.current[k]?.scale.set(k < 2 ? w + edge : edge, k < 2 ? edge : h + edge, 1);
      });
    },
    [s.w, s.h],
  );
  const opacity = useCallback(() => seen.current, [seen]);
  const now = performance.now();
  return (
    <group position={[s.x, s.y, 0]}>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} ref={(m) => void (lines.current[k] = m)} material={material} renderOrder={40}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      {/* (what a press takes - never drawn: a pointer finds it all the same) */}
      {[0, 1, 2, 3].map((k) => (
        <mesh key={`edge-${k}`} ref={(m) => void (bands.current[k] = m)} onPointerOver={over} onPointerOut={out} onPointerDown={(e) => onDown(e, false)}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial visible={false} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <group
        position={[-s.w / 2, s.h / 2, 0.002]}
        onPointerOver={() => {
          over();
          setCursor(gl.domElement, "move");
        }}
        onPointerOut={() => {
          out();
          setCursor(gl.domElement, null);
        }}
        onPointerDown={(e) => onDown(e, true)}
      >
        <SlideNumber n={n} font={font} opacity={opacity} />
      </group>
      {held && <HeldLight b={{ x0: -s.w / 2, x1: s.w / 2, y0: -s.h / 2, y1: s.h / 2 }} at={held} held={held} now={now} z={-0.001} />}
      {selected && <Handles s={s} toWorld={toWorld} />}
    </group>
  );
}

/**
 * A selected slide's handles, one at each corner, the same size on the
 * screen at any zoom: dragged, it makes the slide larger or smaller - its
 * proportions kept, the opposite corner where it was - as one step.
 */
function Handles({ s, toWorld }: { s: Slide; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  const { camera, gl } = useThree();
  const handles = useRef<(THREE.Group | null)[]>([]);
  useScreenSize((px) => handles.current.forEach((h) => h?.scale.setScalar(HANDLE_PX * px)), []);
  const corners = [
    { x: s.x - s.w / 2, y: s.y - s.h / 2 },
    { x: s.x + s.w / 2, y: s.y - s.h / 2 },
    { x: s.x + s.w / 2, y: s.y + s.h / 2 },
    { x: s.x - s.w / 2, y: s.y + s.h / 2 },
  ];
  const startScale = (k: number, ev: PointerEvent) => {
    const fixed = corners[(k + 2) % 4];
    const grabbed = corners[k];
    const len = Math.hypot(grabbed.x - fixed.x, grabbed.y - fixed.y);
    const dir = { x: (grabbed.x - fixed.x) / len, y: (grabbed.y - fixed.y) / len };
    const least = (LEAST_PX * len) / ((camera as THREE.OrthographicCamera).zoom || 1) / Math.min(s.w, s.h);
    const gesture = `scale-${performance.now()}`;
    store.getState().beginPanHold(ev.pointerId);
    // (as wide or as tall as something near, where it comes near: docs/PRESENTING.md, *Guides*)
    const placeAt = (f: number) => ({ w: s.w * f, h: s.h * f, x: fixed.x + (dir.x * len * f) / 2, y: fixed.y + (dir.y * len * f) / 2 });
    const guide = guideScale(store, toWorld, { x: ev.clientX, y: ev.clientY }, boxOf(s));
    const onMove = (m: PointerEvent) => {
      const q = toWorld(m.clientX, m.clientY);
      const along = Math.max(least, (q.x - fixed.x) * dir.x + (q.y - fixed.y) * dir.y);
      const f = Math.max(least / len, guide.step(along / len, m, (g) => boxOf({ ...s, ...placeAt(g) })));
      store.getState().updateSlide(s.id, placeAt(f), gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      guide.end();
      const st = store.getState();
      st.endPanHold(u.pointerId);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCursor(gl.domElement, null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };
  return (
    <group>
      {corners.map((c, k) => (
        <group
          key={k}
          ref={(g) => void (handles.current[k] = g)}
          position={[c.x - s.x, c.y - s.y, 0.003]}
          onPointerOver={() => setCursor(gl.domElement, k % 2 === 0 ? "corner-up" : "corner-down")}
          onPointerOut={() => setCursor(gl.domElement, null)}
          onPointerDown={(e) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            startScale(k, e.nativeEvent);
          }}
        >
          <mesh>
            <circleGeometry args={[HANDLE_HIT, 20]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh renderOrder={46}>
            <circleGeometry args={[1, 20]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
          </mesh>
          <mesh renderOrder={47}>
            <ringGeometry args={[0.68, 1, 20]} />
            <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// language=GLSL
const JOIN_VERTEX = /* glsl */ `
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uWidth;
varying float vAlong;
void main() {
  vec2 d = uTo - uFrom;
  float len = length(d);
  vec2 u = d / max(len, 1e-9);
  vec2 n = vec2(-u.y, u.x);
  float along = (position.x + 0.5) * len;
  vAlong = along;
  vec2 p = uFrom + u * along + n * position.y * uWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;
// language=GLSL
const JOIN_FRAGMENT = /* glsl */ `
uniform float uPx;
uniform float uDash;
uniform float uGap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
void main() {
  if (mod(vAlong / uPx, uDash + uGap) > uDash) discard;
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}
`;

/** The line from a slide to the next: dashed, the same on the screen at any zoom, with an arrowhead half way along that says which way the talk goes; as seen as `opacity` says, frame by frame. */
function Join({ from, to, opacity }: { from: Pt; to: Pt; opacity: () => number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uFrom: { value: new THREE.Vector2() },
          uTo: { value: new THREE.Vector2() },
          uWidth: { value: 1 },
          uPx: { value: 1 },
          uDash: { value: DASH_PX },
          uGap: { value: GAP_PX },
          uColor: { value: new THREE.Color(COLORS.base) },
          uOpacity: { value: JOIN },
        },
        vertexShader: JOIN_VERTEX,
        fragmentShader: JOIN_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const head = useRef<THREE.Mesh>(null);
  const headMaterial = useRef<THREE.MeshBasicMaterial>(null);
  useScreenSize(
    (px) => {
      // (a little apart from the frames at either end)
      const gap = Math.min(NUMBER_PX * px * 1.4, len / 3);
      material.uniforms.uFrom.value.set(from.x + ux * gap, from.y + uy * gap);
      material.uniforms.uTo.value.set(to.x - ux * gap, to.y - uy * gap);
      material.uniforms.uWidth.value = JOIN_PX * px;
      material.uniforms.uPx.value = px;
      if (head.current) {
        head.current.scale.setScalar(HEAD_PX * px);
        head.current.visible = len > 6 * HEAD_PX * px;
      }
    },
    [from.x, from.y, to.x, to.y, material],
  );
  usePartFrame(() => {
    const o = opacity();
    material.uniforms.uOpacity.value = o;
    if (headMaterial.current) headMaterial.current.opacity = o * 1.4;
  });
  return (
    <group>
      <mesh material={material} renderOrder={38} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={head} position={[mid.x, mid.y, 0]} rotation={[0, 0, Math.atan2(uy, ux)]} renderOrder={39}>
        <circleGeometry args={[1, 3]} />
        <meshBasicMaterial ref={headMaterial} color={COLORS.base} transparent opacity={opacity() * 1.4} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
