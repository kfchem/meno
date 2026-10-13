/**
 * Writing by hand on the page (docs/PRESENTING.md, *Handwriting*): each
 * piece as lib/chem/ink draws its strokes - a pen's over everything on the
 * page, a marker's see-through and under the words - and the stroke being
 * written, as it will be kept.
 *
 * A press on a piece's strokes is as on a picture: a drag moves the view;
 * held still, it is taken hold of and selected, and the drag then moves it;
 * a click selects it; Ctrl (⌘) and a click adds it to the selection or takes
 * it out. Selected, its strokes are lit. What the drawing has under the
 * pointer is pressed, not the writing.
 */
import * as THREE from "three";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { Ink, InkLook } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { boundsPadded, inkColour, inkWidth, markerColour, MARKER_OPACITY, strokeHit, strokesBounds, type InkStroke } from "../../../../lib/chem/ink";
import { setInUse } from "../../../../lib/chem/palette";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { strokesGeometry } from "./inkGeometry";
import { pageAt } from "../utils/page";
import { dragSelection } from "../utils/dragSelection";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { useStyleOptions } from "../useDrawingStyle";

/** Where writing lies: a pen's over the drawing, words and shapes (under the slides' frames, 0.6); a marker's over the shapes and under the drawing's fills (-0.05). */
const Z_PEN = 0.3;
const Z_MARKER = -0.12;
/** A pen's writing while a talk is given: over everything on the page. */
const Z_TALK = 0.7;
const Z_STEP = 1e-4;
/** On the screen, in pixels: how far off a stroke a press still takes it; how far round its strokes the light reaches. */
const EDGE_PX = 5;
const LIT_PX = 3;
const LIT = 0.2;
const CHOSEN = 0.4;
const CLICK_PX = 4;
const PAN_PX = 3;
const POINT_FALLBACK = NOMINAL_BOND_LENGTH / 14.4;

type Pt = { x: number; y: number };

/** Strokes as they are drawn, in a piece's look. */
function StrokesLook({ look, strokes, pointPx, ink, extra = 0, color, opacity }: { look: InkLook; strokes: readonly InkStroke[]; pointPx: number; ink: string; extra?: number; color?: string; opacity?: number }) {
  const width = inkWidth(look, pointPx) + extra;
  const marker = look.pen === "marker";
  // (a marker's own colour: the first of the set in use)
  const own = markerColour(setInUse(useAppSettings((s) => s.colours)));
  const geometry = useMemo(() => strokesGeometry(strokes, width, !marker), [strokes, width, marker]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const o = opacity ?? (marker ? MARKER_OPACITY : 1);
  return (
    // (drawn only where in view: its triangles are where they are drawn, so their bounds are the writing's)
    <mesh geometry={geometry} raycast={() => {}}>
      <meshBasicMaterial color={color ?? inkColour(look, ink, own)} transparent={o < 1} opacity={o} depthWrite={o >= 1} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function Inks2D() {
  const inks = useEditor((s) => s.inks);
  const selInks = useEditor((s) => s.selInks);
  const hovered = useEditor((s) => s.hoveredInk);
  const draft = useEditor((s) => s.inkDraft);
  const talkInk = useEditor((s) => s.talkInk);
  // (the style's, not the drawing's layout: a zoom draws none of the writing again - each piece keeps what the screen
  // sizes in it frame by frame)
  const opts = useStyleOptions();
  const pointPx = opts.pointPx ?? POINT_FALLBACK;
  const ink = opts.bondColor ?? "#000000";
  const { camera, gl } = useThree();
  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const rect = gl.domElement.getBoundingClientRect();
      const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    },
    [camera, gl],
  );
  return (
    <group>
      {inks.map((k, i) => (
        <InkItem key={k.id} k={k} z={(k.pen === "marker" ? Z_MARKER : Z_PEN) + i * Z_STEP} pointPx={pointPx} ink={ink} selected={selInks.has(k.id)} hovered={hovered === k.id} toWorld={toWorld} />
      ))}
      {/* (a pen's writing over the slide while a talk is given, over everything) */}
      {talkInk.map((k, i) => (
        <TalkStroke key={`talk${i}`} k={k} z={Z_TALK + i * Z_STEP} pointPx={pointPx} ink={ink} />
      ))}
      {draft && (
        <group position={[0, 0, (draft.look.pen === "marker" ? Z_MARKER : Z_PEN) + inks.length * Z_STEP]}>
          <StrokesLook look={draft.look} strokes={[draft.stroke]} pointPx={pointPx} ink={ink} />
        </group>
      )}
    </group>
  );
}

/** A stroke written over the slide in a talk: drawn up once. */
function TalkStroke({ k, z, pointPx, ink }: { k: { look: InkLook; stroke: InkStroke }; z: number; pointPx: number; ink: string }) {
  const strokes = useMemo(() => [k.stroke], [k.stroke]);
  return (
    <group position={[0, 0, z]}>
      <StrokesLook look={k.look} strokes={strokes} pointPx={pointPx} ink={ink} />
    </group>
  );
}

const InkItem = memo(function InkItem({ k, z, pointPx, ink, selected, hovered, toWorld }: { k: Ink; z: number; pointPx: number; ink: string; selected: boolean; hovered: boolean; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  const { camera, invalidate } = useThree();
  const pxNow = () => 1 / ((camera as THREE.OrthographicCamera).zoom || 1);
  const px = pxNow();
  const width = inkWidth(k, pointPx);
  // (its strokes' bounds, found once: what the screen adds round them - where a press still takes it - added as the view zooms)
  const core = useMemo(() => strokesBounds(k.strokes, width / 2), [k.strokes, width]);
  // the light round its strokes, under the pointer or selected, coming and going
  const [light, setLight] = useState(0);
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => invalidate(), [held, invalidate]);
  const padded = (pad: number) => (core ? boundsPadded(core, pad) : { x0: 0, y0: 0, x1: 0, y1: 0 });
  const b = padded(EDGE_PX * px);
  const m = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  // the band a pointer is looked for in, and the light round its strokes while there is light, the same on the screen at any zoom
  const band = useRef<THREE.Mesh>(null);
  const bandPx = useRef(px);
  const [, setLitZoom] = useState(0);
  const litPx = useRef(px);
  // (one frame callback for all of it: the canvas sorts all of those again at every one added, and writing comes in
  // thousands of pieces)
  useFrame((_, dt) => {
    const to = selected ? CHOSEN : hovered ? LIT : 0;
    if (Math.abs(light - to) >= 1e-3) {
      setLight(follow(light, to, Math.min(dt, 1 / 20), TAU.quick));
      invalidate();
    } else if (light !== to) setLight(to);
    if (held && heldShows(held, performance.now())) {
      setTick((t) => t + 1);
      invalidate();
    }
    const now = pxNow();
    if (band.current && bandPx.current !== now) {
      bandPx.current = now;
      const c = padded(EDGE_PX * now);
      band.current.scale.set(c.x1 - c.x0, c.y1 - c.y0, 1);
    }
    if (light > 0.005 && litPx.current !== now) {
      litPx.current = now;
      setLitZoom((n) => n + 1);
    }
  });
  const drawingHas = () => {
    const st = store.getState();
    return st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d != null || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredMark != null || st.hoveredSlide != null || st.inkMode != null;
  };
  const hit = (p: Pt) => k.strokes.some((s) => strokeHit(s, p, EDGE_PX * pxNow(), width));
  const onMove = (e: { point: THREE.Vector3; stopPropagation: () => void }) => {
    const st = store.getState();
    if (!drawingHas() && hit({ x: e.point.x, y: e.point.y })) {
      e.stopPropagation();
      st.setHoveredInk(k.id);
    } else if (st.hoveredInk === k.id) st.setHoveredInk(null);
  };
  const out = () => {
    if (store.getState().hoveredInk === k.id) store.getState().setHoveredInk(null);
  };
  const onDown = (e: { nativeEvent: PointerEvent; point: THREE.Vector3; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    const st = store.getState();
    if (ev.button !== 0 || drawingHas() || !hit({ x: e.point.x, y: e.point.y })) return;
    e.stopPropagation();
    st.setHoveredInk(k.id);
    if (addsToSelection(ev)) {
      st.toggleInkSel(k.id);
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
    if (st.selInks.has(k.id)) {
      move();
      return;
    }
    const at = toWorld(ev.clientX, ev.clientY);
    setHeld({ x: at.x - m.x, y: at.y - m.y, start: performance.now() });
    invalidate();
    let panned = false;
    const hold = window.setTimeout(() => {
      stop();
      const s2 = store.getState();
      s2.clearSel();
      s2.selectInks([k.id]);
      setHeld((h) => (h ? { ...h, done: true } : h));
      move();
    }, LONG_PRESS_MS);
    const onMoveDrag = (mv: PointerEvent) => {
      if (panned || Math.hypot(mv.clientX - from.x, mv.clientY - from.y) < PAN_PX) return;
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
      s2.selectInks([k.id]);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMoveDrag);
      window.removeEventListener("pointerup", onUp, true);
    };
    window.addEventListener("pointermove", onMoveDrag);
    window.addEventListener("pointerup", onUp, true);
  };
  const now = performance.now();
  return (
    <group position={[0, 0, z]}>
      {light > 0.005 && (
        <group position={[0, 0, -Z_STEP / 4]}>
          <StrokesLook look={k} strokes={k.strokes} pointPx={pointPx} ink={ink} extra={2 * LIT_PX * px} color={COLORS.highlight} opacity={light} />
        </group>
      )}
      <StrokesLook look={k} strokes={k.strokes} pointPx={pointPx} ink={ink} />
      {/* (never drawn: a pointer finds it all the same) */}
      <mesh ref={band} position={[m.x, m.y, Z_STEP / 2]} scale={[b.x1 - b.x0, b.y1 - b.y0, 1]} onPointerMove={onMove} onPointerOut={out} onPointerDown={onDown}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial visible={false} transparent opacity={0} depthWrite={false} />
      </mesh>
      {held && heldShows(held, now) && (
        <group position={[m.x, m.y, 0]}>
          <HeldLight b={{ x0: b.x0 - m.x, x1: b.x1 - m.x, y0: b.y0 - m.y, y1: b.y1 - m.y }} at={held} held={held} now={now} z={Z_STEP / 3} />
        </group>
      )}
    </group>
  );
});
