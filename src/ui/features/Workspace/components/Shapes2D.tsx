/**
 * Shapes on the page (docs/PRESENTING.md, *Shapes*): each drawn as
 * lib/chem/shapes says - filled, its line over its fill - under the drawing and over the pictures and PDFs, each over
 * those before it; and one being drawn from Quick Add, as it will be.
 *
 * A press on one is as on a picture: on its line, or anywhere inside it
 * where it is filled - a shape with no fill lets a press inside it through
 * to what is under it. A drag moves the view; held still a moment, it is
 * taken hold of - lit from the pointer out - and selected, and the drag
 * then moves it. A click selects it alone; Ctrl (⌘ on a Mac) and a click
 * adds it to the selection or takes it out. A shape is a shape: no words
 * are written in it. Selected, it is lit along its line, with a handle at
 * each corner and side of a box and each end of a line: dragged, it takes
 * that corner, side or end along, one step - Shift keeping a box's
 * proportions, a line to steps of 15 degrees. A rectangle selected alone
 * has one more, inside its top left corner, where its corners' curve
 * begins: dragged along its top, it rounds them, from square to round
 * ends. Its corners rounded otherwise - from its menu, by an undo - go
 * round or square eased; its line is as wide as the drawing's bonds unless
 * it has a width of its own. What is drawn over it - atoms, bonds, words, arrows - is
 * pressed, not it. Lit along its line while the pointer is on it.
 */
import { longPressMs } from "../longPress";
import * as THREE from "three";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { Shape } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { setCursor, type CursorName } from "../../../theme/cursors";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import {
  asBonds,
  bondLinePtOf,
  drawnShape,
  fillOutline,
  handlesOf,
  isBox,
  lineWidthOf,
  middleOf,
  outlineOf,
  reshaped,
  roundestOf,
  shapeBounds,
  shapeHit,
  strokePieces,
  strokeTriangles,
  type ShapeGeometry,
  type ShapeHandle,
} from "../../../../lib/chem/shapes";
import { pageAt } from "../utils/page";
import { guideScale, guideSides } from "../utils/guiding";
import { dragSelection } from "../utils/dragSelection";
import { DOUBLE_CLICK_MS } from "../constants";
import { HeldGlow } from "./HeldLight";
import { type Held } from "./held";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { polyTriangles } from "./polyTriangles";
import { roundHandleAt, roundInOf, roundsOf } from "./shapeRounds";
import { boxRaycast, NO_RAYCAST, PartFramesProvider, pixelNow, SQUARE, UNSEEN, usePartFrame, usePartFrames } from "./partFrames";

/** Where shapes lie: under the drawing and its fills (-0.05), over the pictures (Pictures2D's -0.3); each a little over the one before. */
const Z = -0.2;
const Z_STEP = 1e-4;
/** On the screen, in pixels: how far off its line a press still takes a shape; how far either side of its line the light along it reaches. */
const EDGE_PX = 5;
const LIT_PX = 4;
/** How lit a shape's line is under the pointer, and selected. */
const LIT = 0.18;
const CHOSEN = 0.38;
/** A handle, on the screen: its radius, how far off it a press still takes it, in its radii; how small a box may be made, in pixels. */
const HANDLE_PX = 5;
const HANDLE_HIT = 2;
const LEAST_PX = 8;

/** How far a press may move and still be a click, and before it moves the view (PanZoom2D's), in pixels. */
const CLICK_PX = 4;
const PAN_PX = 3;
/** A label's size in points, ACS 1996's, for drawings that do not say how large a point is. */
const POINT_FALLBACK = NOMINAL_BOND_LENGTH / 14.4;

/**
 * What every selected shape's handles draw with, made once and shared: what
 * a press takes, never drawn; the white; the
 * ring. (A handle each, each its own three parts, was some twenty-four a box:
 * thousands selected took seconds to come and to go.)
 */
const HANDLE_HIT_DISC = new THREE.CircleGeometry(HANDLE_HIT, 20);
const HANDLE_DISC = new THREE.CircleGeometry(1, 20);
const HANDLE_RING = new THREE.RingGeometry(0.68, 1, 20);
const HANDLE_FILL = new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false, toneMapped: false });
const HANDLE_LINE = new THREE.MeshBasicMaterial({ color: COLORS.highlight, depthTest: false, toneMapped: false });
const WHITE = new THREE.Color("#ffffff");
const ROUND = new THREE.Color(COLORS.highlight);

type Pt = { x: number; y: number };

/** Triangles of what a shape draws, in page units: its fill, and its line. */
function shapeGeometry(points: { positions: number[]; indices: number[] }): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((points.positions.length / 2) * 3);
  for (let i = 0; i < points.positions.length / 2; i++) {
    pos[3 * i] = points.positions[2 * i];
    pos[3 * i + 1] = points.positions[2 * i + 1];
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(points.indices);
  return g;
}

/** Polygons as triangles - each filled flat - in one set. */
function polygons(polys: readonly Pt[][]): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const poly of polys) {
    const base = positions.length / 2;
    for (const p of poly) positions.push(p.x, p.y);
    for (const i of polyTriangles(poly)) indices.push(base + i);
  }
  return { positions, indices };
}

/** Lines, each `width` wide, as triangles in one set. */
function lines(pieces: readonly { points: Pt[]; closed: boolean }[], width: number): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const piece of pieces) {
    const t = strokeTriangles(piece.points, piece.closed, width);
    const base = positions.length / 2;
    positions.push(...t.positions);
    indices.push(...t.indices.map((i) => i + base));
  }
  return { positions, indices };
}

/** A shape as it is drawn: its fill and its line, at `z` among the shapes. */
function ShapeLook({ s, pointPx, ink, opacity = 1 }: { s: ShapeGeometry & { stroke?: string; fill?: string }; pointPx: number; ink: string; opacity?: number }) {
  const key = JSON.stringify(s);
  const { fill, line } = useMemo(() => {
    const area = s.fill ? fillOutline(s, pointPx) : null;
    const lined = s.stroke !== "none";
    return {
      fill: area ? shapeGeometry(polygons([area])) : null,
      line: lined ? shapeGeometry(lines(strokePieces(s, pointPx), lineWidthOf(s, pointPx))) : null,
    };
    // (made again when the shape changes, not when it is drawn again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pointPx]);
  useEffect(
    () => () => {
      fill?.dispose();
      line?.dispose();
    },
    [fill, line],
  );
  const lineColor = s.stroke && s.stroke !== "none" ? s.stroke : ink;
  const see = opacity < 1;
  return (
    <group>
      {fill && (
        <mesh geometry={fill} frustumCulled={false} raycast={NO_RAYCAST}>
          <meshBasicMaterial color={s.fill} toneMapped={false} transparent={see} opacity={opacity} />
        </mesh>
      )}
      {line && (
        <mesh geometry={line} position={[0, 0, Z_STEP / 4]} frustumCulled={false} raycast={NO_RAYCAST}>
          <meshBasicMaterial color={lineColor} toneMapped={false} transparent={see} opacity={opacity} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export default function Shapes2D() {
  const shapes = useEditor((s) => s.shapes);
  const selShapes = useEditor((s) => s.selShapes);
  const hovered = useEditor((s) => s.hoveredShape);
  const draft = useEditor((s) => s.shapeDraft);
  const { opts } = useDrawnLayout();
  const pointPx = opts.pointPx ?? POINT_FALLBACK;
  const ink = opts.bondColor ?? "#000000";
  // (each drawn with its line as wide as the bonds', where it has no width of its own - the same one for a shape that has not changed: drawn again only as it does)
  const bondLinePt = bondLinePtOf(opts);
  const asDrawn = useMemo(() => {
    const kept = new WeakMap<Shape, Shape>();
    return (s: Shape) => {
      let d = kept.get(s);
      if (!d) kept.set(s, (d = asBonds(s, bondLinePt)));
      return d;
    };
  }, [bondLinePt]);
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  // (each shape's work at each frame done from this one callback: partFrames)
  const parts = usePartFrames();
  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const rect = gl.domElement.getBoundingClientRect();
      const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    },
    [gl, camera],
  );
  // (the selected ones, their handles drawn all together)
  const chosen = useMemo(() => shapes.flatMap((s, i) => (selShapes.has(s.id) ? [{ s: asDrawn(s), z: Z + i * Z_STEP }] : [])), [shapes, selShapes, asDrawn]);
  const drafted = draft ? asBonds({ kind: draft.kind, ...drawnShape(draft.kind, draft.from, draft.to, draft.even) }, bondLinePt) : null;
  return (
    <PartFramesProvider value={parts}>
      <group>
        {shapes.map((s, i) => (
          <ShapeItem key={s.id} s={asDrawn(s)} z={Z + i * Z_STEP} pointPx={pointPx} ink={ink} selected={selShapes.has(s.id)} hovered={hovered === s.id} toWorld={toWorld} />
        ))}
        {drafted && (
          <group position={[0, 0, Z + shapes.length * Z_STEP]}>
            <ShapeLook s={drafted} pointPx={pointPx} ink={ink} opacity={0.75} />
          </group>
        )}
        {chosen.length > 0 && <Handles chosen={chosen} toWorld={toWorld} pointPx={pointPx} />}
      </group>
    </PartFramesProvider>
  );
}

// (drawn again only as it changes: a pointer coming onto one shape leaves the other thousands as they were)
const ShapeItem = memo(function ShapeItem({
  s,
  z,
  pointPx,
  ink,
  selected,
  hovered,
  toWorld,
}: {
  s: Shape;
  z: number;
  pointPx: number;
  ink: string;
  selected: boolean;
  hovered: boolean;
  toWorld: (cx: number, cy: number) => Pt;
}) {
  const store = useEditorStore();
  // (the canvas's state taken a part at a time: the whole of it would draw every shape again as any of it changed)
  const camera = useThree((st) => st.camera);
  const invalidate = useThree((st) => st.invalidate);
  // the light along its line, under the pointer or selected - there only as long as it is
  const [glowing, setGlowing] = useState(false);
  if ((hovered || selected) && !glowing) setGlowing(true);
  // taken hold of by a press held on it: where, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  useEffect(() => invalidate(), [held, invalidate]);

  // its corners as round as they now are, eased there - as the handle goes, at once
  const toRound = s.radius ?? 0;
  const rounds = roundsOf(store);
  const [shownRound, setShownRound] = useState(toRound);
  if (shownRound !== toRound && rounds.byHand.has(s.id)) setShownRound(toRound);
  const easing = shownRound !== toRound;
  const look = easing ? { ...s, radius: shownRound } : s;
  // (its handle drawn where its corners are drawn, not where they are going: the two go together)
  useLayoutEffect(() => {
    rounds.shown.set(s.id, shownRound);
    for (const told of rounds.moved) told();
  }, [rounds, s.id, shownRound]);
  useEffect(() => () => void rounds.shown.delete(s.id), [rounds, s.id]);

  const b = useMemo(() => shapeBounds(s, pointPx), [s, pointPx]);
  const m = middleOf(b);
  // (what a press takes: the box round it, as far as a press on its line still takes it, at the zoom of the press - whether it is taken, its own to say)
  const raycast = useMemo(() => boxRaycast(camera, () => b, EDGE_PX), [camera, b]);
  const slack = () => EDGE_PX * pixelNow(camera);
  const filled = !!s.fill && isBox(s.kind);
  const lined = s.stroke !== "none";
  // (what is drawn on the page over it is pressed, not it)
  const drawingHas = () => {
    const st = store.getState();
    return st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d != null || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredMark != null || st.hoveredSlide != null;
  };
  const onMove = (e: { point: THREE.Vector3; stopPropagation: () => void }) => {
    const st = store.getState();
    const hit = !drawingHas() && shapeHit(s, { x: e.point.x, y: e.point.y }, slack(), pointPx, filled, lined);
    if (hit) {
      // (the one on top takes it: none under it is lit)
      e.stopPropagation();
      st.setHoveredShape(s.id);
    } else if (st.hoveredShape === s.id) st.setHoveredShape(null);
  };
  const out = () => {
    if (store.getState().hoveredShape === s.id) store.getState().setHoveredShape(null);
  };
  const onDown = (e: { nativeEvent: PointerEvent; point: THREE.Vector3; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    const st = store.getState();
    // (taken where the press is on it, whatever the pointer last moved over)
    if (ev.button !== 0 || drawingHas() || !shapeHit(s, { x: e.point.x, y: e.point.y }, slack(), pointPx, filled, lined)) return;
    e.stopPropagation();
    st.setHoveredShape(s.id);
    if (addsToSelection(ev)) {
      st.toggleShapeSel(s.id);
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
    // selected: a drag moves the selection
    if (st.selShapes.has(s.id)) {
      move();
      return;
    }
    // else a drag moves the view; held still, it is taken hold of; a click selects it
    const at = toWorld(ev.clientX, ev.clientY);
    setHeld({ x: at.x - m.x, y: at.y - m.y, start: performance.now() });
    invalidate();
    let panned = false;
    const hold = window.setTimeout(() => {
      stop();
      const s2 = store.getState();
      s2.clearSel();
      s2.selectShapes([s.id]);
      setHeld((h) => (h ? { ...h, done: true } : h));
      move();
    }, longPressMs());
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
      s2.selectShapes([s.id]);
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
      {glowing && <LightAlong s={look} pointPx={pointPx} to={selected ? CHOSEN : hovered ? LIT : 0} gone={() => setGlowing(false)} />}
      <ShapeLook s={look} pointPx={pointPx} ink={ink} />
      {easing && <RoundEase from={shownRound} to={toRound} onStep={setShownRound} />}
      <mesh args={[SQUARE, UNSEEN]} position={[0, 0, Z_STEP / 2]} raycast={raycast} onPointerMove={onMove} onPointerOut={out} onPointerDown={onDown} />
      {held && (
        <group position={[m.x, m.y, 0]}>
          <HeldGlow held={held} b={{ x0: b.x0 - m.x, x1: b.x1 - m.x, y0: b.y0 - m.y, y1: b.y1 - m.y }} at={held} z={Z_STEP / 3} gone={() => setHeld(null)} />
        </group>
      )}
    </group>
  );
});

/** A rectangle's corners going round or square, eased from `from` to `to` (TAU.quick): there only as long as they go - `onStep` told each frame's radius, the last `to`. */
function RoundEase({ from, to, onStep }: { from: number; to: number; onStep: (r: number) => void }) {
  const invalidate = useThree((st) => st.invalidate);
  const now = useRef(from);
  useEffect(() => invalidate(), [to, invalidate]);
  usePartFrame((_, dt) => {
    now.current = Math.abs(now.current - to) < 0.01 ? to : follow(now.current, to, Math.min(dt, 1 / 20), TAU.quick);
    onStep(now.current);
    invalidate();
  });
  return null;
}

/**
 * The light along a shape's line, under it: coming as it is lit (`to`) and
 * going as it is not - `gone` told once gone - its band as wide on the
 * screen at any zoom, made again as the view zooms while it is there.
 */
function LightAlong({ s, pointPx, to, gone }: { s: Shape; pointPx: number; to: number; gone: () => void }) {
  const invalidate = useThree((st) => st.invalidate);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => material.dispose(), [material]);
  // (the view's zoom as the drawing takes it up: drawn again as it changes - drawnLayoutContext `useDrawnZoom`)
  const px = 1 / useDrawnZoom();
  const key = JSON.stringify(s);
  const band = useMemo(
    () => shapeGeometry(lines([outlineOf(s, pointPx)], lineWidthOf(s, pointPx) + 2 * LIT_PX * px)),
    // (made again when the shape changes, not when it is drawn again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, pointPx, px],
  );
  useEffect(() => () => band.dispose(), [band]);
  usePartFrame((_, dt) => {
    if (Math.abs(material.opacity - to) < 1e-3) {
      material.opacity = to;
      if (to === 0) gone();
      return;
    }
    material.opacity = follow(material.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  return <mesh geometry={band} material={material} position={[0, 0, -Z_STEP / 4]} frustumCulled={false} raycast={NO_RAYCAST} />;
}

/** The pointer each handle shows: a corner's, as it points on the screen; a side's - and the one that rounds the corners - across or up and down; an end's, the move. */
function cursorOf(h: ShapeHandle | "round"): CursorName {
  if (h === "x0" || h === "x1" || h === "round") return "sideways";
  if (h === "y0" || h === "y1") return "updown";
  if (h === "x0y0" || h === "x1y1") return "corner-up";
  if (h === "x1y0" || h === "x0y1") return "corner-down";
  return "move";
}

/** A handle of a selected shape, among all of theirs: the shape, how far over the others it is, which handle and where - the one that rounds a rectangle's corners standing where its curve begins, on the screen. */
type HandleOf = { s: Shape; z: number; handle: ShapeHandle | "round"; at: Pt };

/**
 * The selected shapes' handles, drawn all together, the same size on the
 * screen at any zoom: a box's at its corners and sides, a line's at its
 * ends, and - a rectangle selected alone - the one that rounds its corners,
 * in the highlight's colour. Dragged, each takes what it is at along, as
 * one step.
 */
function Handles({ chosen, toWorld, pointPx }: { chosen: { s: Shape; z: number }[]; toWorld: (cx: number, cy: number) => Pt; pointPx: number }) {
  const store = useEditorStore();
  // (this document's corners, as its canvas draws them: shapeRounds)
  const rounds = roundsOf(store);
  const gl = useThree((st) => st.gl);
  const camera = useThree((st) => st.camera);
  const invalidate = useThree((st) => st.invalidate);
  // (the view's zoom as the drawing takes it up: laid again as it changes - drawnLayoutContext `useDrawnZoom`)
  const px = 1 / useDrawnZoom();
  const all = useMemo<HandleOf[]>(
    () => [
      ...chosen.flatMap(({ s, z }) => handlesOf(s).map(({ handle, at }) => ({ s, z, handle, at }))),
      // (placed as the zoom is taken up: `lay`)
      ...(chosen.length === 1 && chosen[0].s.kind === "rect" ? [{ ...chosen[0], handle: "round" as const, at: { x: 0, y: 0 } }] : []),
    ],
    [chosen],
  );
  // each handle an instance - what a press takes, never drawn; its white; its ring - room kept for more as more are selected
  const room = 2 ** Math.ceil(Math.log2(Math.max(8, all.length)));
  const hit = useRef<THREE.InstancedMesh>(null);
  const fill = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.InstancedMesh>(null);
  const lay = useCallback(
    (px: number) => {
      const meshes = [hit.current, fill.current, ring.current];
      const m = new THREE.Matrix4();
      all.forEach((h, i) => {
        const at = h.handle === "round" ? (h.at = roundHandleAt(h.s, pointPx, px, rounds)) : h.at;
        m.makeScale(HANDLE_PX * px, HANDLE_PX * px, 1).setPosition(at.x, at.y, h.z + 0.003);
        for (const mesh of meshes) mesh?.setMatrixAt(i, m);
        fill.current?.setColorAt(i, h.handle === "round" ? ROUND : WHITE);
      });
      for (const mesh of meshes) {
        if (!mesh) continue;
        mesh.count = all.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      invalidate();
    },
    [all, invalidate, pointPx, rounds],
  );
  // (laid before they are first drawn, and again as the zoom is taken up - and as a rectangle's corners go, its handle with them)
  useLayoutEffect(() => lay(px), [lay, room, px]);
  useEffect(() => {
    if (!all.some((h) => h.handle === "round")) return;
    const told = () => lay(px);
    rounds.moved.add(told);
    return () => void rounds.moved.delete(told);
  }, [all, lay, px, rounds]);
  const start = ({ s, handle }: HandleOf, ev: PointerEvent) => {
    const px = pixelNow(camera);
    const from = { x: ev.clientX, y: ev.clientY };
    const gesture = `reshape-${performance.now()}`;
    const st = store.getState();
    st.beginPanHold(ev.pointerId);
    if (handle === "round") {
      roundCorners(s, ev, gesture);
      return;
    }
    const h = handle;
    const was = s;
    // (a box's corner or side: as wide or as tall as something near, where it comes near - its proportions, with Shift; docs/PRESENTING.md, *Guides*)
    const sides = isBox(was.kind) ? { x: h.includes("x0") ? ("x0" as const) : h.includes("x1") ? ("x1" as const) : undefined, y: h.includes("y0") ? ("y0" as const) : h.includes("y1") ? ("y1" as const) : undefined } : null;
    const guide = sides ? guideSides(store, toWorld, from) : null;
    const scale = sides?.x && sides.y ? guideScale(store, toWorld, from, was) : null;
    const onMove = (m: PointerEvent) => {
      const q = toWorld(m.clientX, m.clientY);
      let next = reshaped(was, h, q, LEAST_PX * px, m.shiftKey);
      if (sides && scale && m.shiftKey) {
        // (its proportions kept: from the corner across, as large as a width or a height near it)
        const fx = sides.x === "x0" ? was.x1 : was.x0;
        const fy = sides.y === "y0" ? was.y1 : was.y0;
        const keep = (f: number) => {
          const w = (was.x1 - was.x0) * f;
          const ht = (was.y1 - was.y0) * f;
          return { x0: sides.x === "x0" ? fx - w : fx, x1: sides.x === "x0" ? fx : fx + w, y0: sides.y === "y0" ? fy - ht : fy, y1: sides.y === "y0" ? fy : fy + ht };
        };
        const f = scale.step((next.x1 - next.x0) / (was.x1 - was.x0), m, keep);
        next = { ...next, ...keep(Math.max(f, (LEAST_PX * px) / Math.min(was.x1 - was.x0, was.y1 - was.y0))) };
      } else if (sides && guide) next = { ...next, ...guide.step(next, sides, m) };
      store.getState().updateShape(s.id, { x0: next.x0, y0: next.y0, x1: next.x1, y1: next.y1 }, gesture);
    };
    // Escape - or undo, which sends it - lets it go, as large as it was
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      k.preventDefault();
      k.stopPropagation();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey, true);
      guide?.end();
      scale?.end();
      store.getState().dropShapeChange(s.id, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      guide?.end();
      scale?.end();
      const st2 = store.getState();
      st2.endPanHold(u.pointerId);
      st2.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCursor(gl.domElement, null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
  };
  /** Its corners rounded as the handle goes along its top - as far in as the pointer, square at its corner, round ends at half its shorter side - one step; Escape lets them go as they were. */
  const roundCorners = (s: Shape, ev: PointerEvent, gesture: string) => {
    rounds.byHand.add(s.id);
    const most = roundestOf(s.x1 - s.x0, s.y1 - s.y0);
    // (from where the pointer is on the handle, not the handle's middle: no jump as it is pressed - the handle staying under the pointer)
    const off = toWorld(ev.clientX, ev.clientY).x - roundHandleAt(s, pointPx, pixelNow(camera), rounds).x;
    const inset = roundInOf(s, pixelNow(camera));
    const onMove = (m: PointerEvent) => {
      const r = Math.min(Math.max(toWorld(m.clientX, m.clientY).x - off - inset - s.x0, 0), most);
      store.getState().updateShape(s.id, { radius: r / pointPx }, gesture);
    };
    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      rounds.byHand.delete(s.id);
    };
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      k.preventDefault();
      k.stopPropagation();
      end();
      store.getState().dropShapeChange(s.id, gesture);
    };
    const onUp = (u: PointerEvent) => {
      end();
      const st2 = store.getState();
      st2.endPanHold(u.pointerId);
      st2.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCursor(gl.domElement, null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
  };
  const cursorAt = (i: number | undefined) => (i != null && all[i] ? cursorOf(all[i].handle) : null);
  return (
    <group>
      <instancedMesh
        key={room}
        ref={hit}
        args={[HANDLE_HIT_DISC, UNSEEN, room]}
        frustumCulled={false}
        onPointerOver={(e) => setCursor(gl.domElement, cursorAt(e.instanceId))}
        onPointerMove={(e) => setCursor(gl.domElement, cursorAt(e.instanceId))}
        onPointerOut={() => setCursor(gl.domElement, null)}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0 || e.instanceId == null || !all[e.instanceId]) return;
          e.stopPropagation();
          start(all[e.instanceId], e.nativeEvent);
        }}
      />
      <instancedMesh key={`fill-${room}`} ref={fill} args={[HANDLE_DISC, HANDLE_FILL, room]} renderOrder={46} frustumCulled={false} raycast={NO_RAYCAST} />
      <instancedMesh key={`ring-${room}`} ref={ring} args={[HANDLE_RING, HANDLE_LINE, room]} renderOrder={47} frustumCulled={false} raycast={NO_RAYCAST} />
    </group>
  );
}
