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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { Ink, InkLook } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { inkColour, inkWidth, markerColour, MARKER_OPACITY, strokeHit, strokesBounds, type InkStroke } from "../../../../lib/chem/ink";
import { setInUse } from "../../../../lib/chem/palette";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { strokesGeometry } from "./inkGeometry";
import { pageAt } from "../utils/page";
import { dragSelection } from "../utils/dragSelection";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { HeldGlow } from "./HeldLight";
import { type Held } from "./held";
import { useDrawnLayout } from "./drawnLayoutContext";
import { boxRaycast, NO_RAYCAST, PartFramesProvider, pixelNow, SQUARE, UNSEEN, usePartFrame, usePartFrames } from "./partFrames";

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
    <mesh geometry={geometry} frustumCulled={false} raycast={NO_RAYCAST}>
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
  const { opts } = useDrawnLayout();
  const pointPx = opts.pointPx ?? POINT_FALLBACK;
  const ink = opts.bondColor ?? "#000000";
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  // (each piece's work at each frame done from this one callback: partFrames)
  const parts = usePartFrames();
  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const rect = gl.domElement.getBoundingClientRect();
      const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    },
    [gl, camera],
  );
  return (
    <PartFramesProvider value={parts}>
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
    </PartFramesProvider>
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

// (drawn again only as it changes: a pointer coming onto one piece leaves the other thousands as they were)
const InkItem = memo(function InkItem({ k, z, pointPx, ink, selected, hovered, toWorld }: { k: Ink; z: number; pointPx: number; ink: string; selected: boolean; hovered: boolean; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  // (the canvas's state taken a part at a time: the whole of it would draw every piece again as any of it changed)
  const camera = useThree((st) => st.camera);
  const invalidate = useThree((st) => st.invalidate);
  const width = inkWidth(k, pointPx);
  // the light round its strokes, under the pointer or selected - there only as long as it is
  const [glowing, setGlowing] = useState(false);
  if ((hovered || selected) && !glowing) setGlowing(true);
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  useEffect(() => invalidate(), [held, invalidate]);
  // (round its strokes; as far again as a press may miss by, at the zoom of the press - boxRaycast)
  const b = useMemo(() => strokesBounds(k.strokes, width / 2) ?? { x0: 0, y0: 0, x1: 0, y1: 0 }, [k.strokes, width]);
  const m = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const raycast = useMemo(() => boxRaycast(camera, () => b, EDGE_PX), [camera, b]);
  const slack = EDGE_PX * pixelNow(camera);
  const drawingHas = () => {
    const st = store.getState();
    return st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d != null || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredMark != null || st.hoveredSlide != null || st.inkMode != null;
  };
  const hit = (p: Pt) => k.strokes.some((s) => strokeHit(s, p, EDGE_PX * pixelNow(camera), width));
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
  return (
    <group position={[0, 0, z]}>
      {glowing && (
        <group position={[0, 0, -Z_STEP / 4]}>
          <LightRound k={k} pointPx={pointPx} to={selected ? CHOSEN : hovered ? LIT : 0} gone={() => setGlowing(false)} />
        </group>
      )}
      <StrokesLook look={k} strokes={k.strokes} pointPx={pointPx} ink={ink} />
      <mesh args={[SQUARE, UNSEEN]} position={[0, 0, Z_STEP / 2]} raycast={raycast} onPointerMove={onMove} onPointerOut={out} onPointerDown={onDown} />
      {held && (
        <group position={[m.x, m.y, 0]}>
          <HeldGlow held={held} b={{ x0: b.x0 - slack - m.x, x1: b.x1 + slack - m.x, y0: b.y0 - slack - m.y, y1: b.y1 + slack - m.y }} at={held} z={Z_STEP / 3} gone={() => setHeld(null)} />
        </group>
      )}
    </group>
  );
});

/**
 * The light round a piece's strokes: coming as it is lit (`to`) and going
 * as it is not - `gone` told once gone - as far round them on the screen at
 * any zoom, made again as the view zooms while it is there.
 */
function LightRound({ k, pointPx, to, gone }: { k: Ink; pointPx: number; to: number; gone: () => void }) {
  const camera = useThree((st) => st.camera);
  const invalidate = useThree((st) => st.invalidate);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => material.dispose(), [material]);
  const [px, setPx] = useState(() => pixelNow(camera));
  const width = inkWidth(k, pointPx) + 2 * LIT_PX * px;
  const marker = k.pen === "marker";
  const geometry = useMemo(() => strokesGeometry(k.strokes, width, !marker), [k.strokes, width, marker]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  usePartFrame((pxNow, dt) => {
    // (a hundredth of a zoom's change makes nothing again)
    if (Math.abs(pxNow / px - 1) > 0.01) setPx(pxNow);
    if (Math.abs(material.opacity - to) < 1e-3) {
      material.opacity = to;
      if (to === 0) gone();
      return;
    }
    material.opacity = follow(material.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
}
