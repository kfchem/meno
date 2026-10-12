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
 * adds it to the selection or takes it out; a second click writes in it -
 * a box - as its words are written anywhere. Selected, it is lit along its
 * line, with a handle at each corner and side of a box, each end of a
 * line, and a callout's tail: dragged, it takes that corner, side, end or
 * tail along, one step - Shift keeping a box's proportions, a line to steps
 * of 15 degrees. What is drawn over it - atoms, bonds, words, arrows - is
 * pressed, not it. Lit along its line while the pointer is on it.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { Shape } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { setCursor, type CursorName } from "../../../theme/cursors";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import {
  drawnShape,
  fillOutline,
  handlesOf,
  isBox,
  lineWidthOf,
  middleOf,
  outlineOf,
  reshaped,
  shapeBounds,
  shapeHit,
  strokePieces,
  strokeTriangles,
  wordsRoom,
  type ShapeGeometry,
  type ShapeHandle,
} from "../../../../lib/chem/shapes";
import { pageAt } from "../utils/page";
import { guideScale, guideSides } from "../utils/guiding";
import { dragSelection } from "../utils/dragSelection";
import { SHAPE_PAD } from "../document";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { useDrawnLayout } from "./drawnLayoutContext";
import { polyTriangles } from "./polyTriangles";

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
        <mesh geometry={fill} frustumCulled={false} raycast={() => {}}>
          <meshBasicMaterial color={s.fill} toneMapped={false} transparent={see} opacity={opacity} />
        </mesh>
      )}
      {line && (
        <mesh geometry={line} position={[0, 0, Z_STEP / 4]} frustumCulled={false} raycast={() => {}}>
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
  const { camera, gl } = useThree();
  const toWorld = (cx: number, cy: number): Pt => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  const drafted = draft ? { kind: draft.kind, ...drawnShape(draft.kind, draft.from, draft.to, draft.even) } : null;
  return (
    <group>
      {shapes.map((s, i) => (
        <ShapeItem key={s.id} s={s} z={Z + i * Z_STEP} pointPx={pointPx} ink={ink} selected={selShapes.has(s.id)} hovered={hovered === s.id} toWorld={toWorld} />
      ))}
      {drafted && (
        <group position={[0, 0, Z + shapes.length * Z_STEP]}>
          <ShapeLook s={drafted} pointPx={pointPx} ink={ink} opacity={0.75} />
        </group>
      )}
    </group>
  );
}

function ShapeItem({
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
  const { camera, invalidate } = useThree();
  const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
  const px = 1 / zoom;
  // the light along its line, under the pointer or selected, coming and going
  const light = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => light.dispose(), [light]);
  useFrame((_, dt) => {
    const to = selected ? CHOSEN : hovered ? LIT : 0;
    if (Math.abs(light.opacity - to) < 1e-3) {
      light.opacity = to;
      return;
    }
    light.opacity = follow(light.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  const key = JSON.stringify(s);
  const width = lineWidthOf(s, pointPx);
  // (the light's band, as wide on the screen at any zoom: made again as the view zooms)
  const band = useMemo(() => {
    return shapeGeometry(lines([outlineOf(s, pointPx)], width + 2 * LIT_PX * px));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pointPx, px]);
  useEffect(() => () => band.dispose(), [band]);
  // taken hold of by a press held on it: where, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => invalidate(), [held, invalidate]);
  useFrame(() => {
    if (!held || !heldShows(held, performance.now())) return;
    setTick((t) => t + 1);
    invalidate();
  });
  // (the last click on it, for a second: its words written)
  const clicked = useRef(0);

  const b = shapeBounds(s, pointPx);
  const m = middleOf(b);
  const slack = EDGE_PX * px;
  const filled = !!s.fill && isBox(s.kind);
  const lined = s.stroke !== "none";
  // (what is drawn on the page over it is pressed, not it)
  const drawingHas = () => {
    const st = store.getState();
    return st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d != null || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredMark != null || st.hoveredSlide != null;
  };
  const onMove = (e: { point: THREE.Vector3; stopPropagation: () => void }) => {
    const st = store.getState();
    const hit = !drawingHas() && shapeHit(s, { x: e.point.x, y: e.point.y }, slack, pointPx, filled, lined);
    if (hit) {
      // (the one on top takes it: none under it is lit)
      e.stopPropagation();
      st.setHoveredShape(s.id);
    } else if (st.hoveredShape === s.id) st.setHoveredShape(null);
  };
  const out = () => {
    if (store.getState().hoveredShape === s.id) store.getState().setHoveredShape(null);
  };
  /** Its words written: those it has, the caret at their end - or new ones, about its middle. */
  const write = () => {
    const st = store.getState();
    const words = st.captions.find((c) => c.shape === s.id);
    if (words) st.setCaptionEdit({ id: words.id, at: { x: words.x, y: words.y } });
    else {
      const room = wordsRoom(s, SHAPE_PAD);
      if (room) st.setCaptionEdit({ id: null, at: { x: room.x, y: room.y }, shape: s.id });
    }
  };
  const onDown = (e: { nativeEvent: PointerEvent; point: THREE.Vector3; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    const st = store.getState();
    // (taken where the press is on it, whatever the pointer last moved over)
    if (ev.button !== 0 || drawingHas() || !shapeHit(s, { x: e.point.x, y: e.point.y }, slack, pointPx, filled, lined)) return;
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
    // a second click on it: its words written
    const twice = isBox(s.kind) && ev.timeStamp - clicked.current < DOUBLE_CLICK_MS;
    // selected: a drag moves the selection - a click alone, the second, writes in it
    if (st.selShapes.has(s.id) && !twice) {
      move();
      clicked.current = ev.timeStamp;
      return;
    }
    if (twice) {
      clicked.current = 0;
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      // (on the button coming up, as the caret is put)
      const up = () => {
        window.removeEventListener("pointerup", up, true);
        write();
      };
      window.addEventListener("pointerup", up, true);
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
      s2.selectShapes([s.id]);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
      clicked.current = u.timeStamp;
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
      {/* (the light along its line, under it) */}
      <mesh geometry={band} material={light} position={[0, 0, -Z_STEP / 4]} frustumCulled={false} raycast={() => {}} />
      <ShapeLook s={s} pointPx={pointPx} ink={ink} />
      {/* (what a press takes: the box round it, as far as a press on its line still takes it - whether it is taken, its own to say) */}
      <mesh position={[m.x, m.y, Z_STEP / 2]} scale={[b.x1 - b.x0 + 2 * slack, b.y1 - b.y0 + 2 * slack, 1]} onPointerMove={onMove} onPointerOut={out} onPointerDown={onDown}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {held && heldShows(held, now) && (
        <group position={[m.x, m.y, 0]}>
          <HeldLight b={{ x0: b.x0 - m.x, x1: b.x1 - m.x, y0: b.y0 - m.y, y1: b.y1 - m.y }} at={held} held={held} now={now} z={Z_STEP / 3} />
        </group>
      )}
      {selected && <Handles s={s} px={px} toWorld={toWorld} clicked={clicked} onWrite={isBox(s.kind) ? write : undefined} />}
    </group>
  );
}

/** The pointer each handle shows: a corner's, as it points on the screen; a side's, across or up and down; an end's or a tail's, the move. */
function cursorOf(h: ShapeHandle): CursorName {
  if (h === "x0" || h === "x1") return "sideways";
  if (h === "y0" || h === "y1") return "updown";
  if (h === "x0y0" || h === "x1y1") return "corner-up";
  if (h === "x1y0" || h === "x0y1") return "corner-down";
  return "move";
}

/**
 * A selected shape's handles, the same size on the screen at any zoom: a
 * box's at its corners and sides, a line's at its ends, a callout's at its
 * tail. Dragged, each takes what it is at along, as one step; clicked
 * twice, a box's writes in it, as its line does.
 */
function Handles({
  s,
  px,
  toWorld,
  clicked,
  onWrite,
}: {
  s: Shape;
  px: number;
  toWorld: (cx: number, cy: number) => Pt;
  /** The last click on the shape - on its line or a handle - for a second. */
  clicked: React.MutableRefObject<number>;
  onWrite?: () => void;
}) {
  const store = useEditorStore();
  const { gl } = useThree();
  const start = (h: ShapeHandle, ev: PointerEvent) => {
    if (onWrite && ev.timeStamp - clicked.current < DOUBLE_CLICK_MS) {
      clicked.current = 0;
      store.getState().suppressDoubleClick(DOUBLE_CLICK_MS);
      const up = () => {
        window.removeEventListener("pointerup", up, true);
        onWrite();
      };
      window.addEventListener("pointerup", up, true);
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY };
    const gesture = `reshape-${performance.now()}`;
    const st = store.getState();
    st.beginPanHold(ev.pointerId);
    const was = s;
    // (a box's corner or side: as wide or as tall as something near, where it comes near - its proportions, with Shift; docs/PRESENTING.md, *Guides*)
    const sides = isBox(was.kind) && h !== "tail" ? { x: h.includes("x0") ? ("x0" as const) : h.includes("x1") ? ("x1" as const) : undefined, y: h.includes("y0") ? ("y0" as const) : h.includes("y1") ? ("y1" as const) : undefined } : null;
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
      store.getState().updateShape(s.id, { x0: next.x0, y0: next.y0, x1: next.x1, y1: next.y1, ...(next.tail ? { tail: next.tail } : {}) }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      guide?.end();
      scale?.end();
      if (Math.hypot(u.clientX - from.x, u.clientY - from.y) < CLICK_PX) clicked.current = u.timeStamp;
      const st2 = store.getState();
      st2.endPanHold(u.pointerId);
      st2.suppressDoubleClick(DOUBLE_CLICK_MS);
      setCursor(gl.domElement, null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };
  return (
    <group>
      {handlesOf(s).map(({ handle, at }) => (
        <group
          key={handle}
          position={[at.x, at.y, 0.003]}
          scale={HANDLE_PX * px}
          onPointerOver={() => setCursor(gl.domElement, cursorOf(handle))}
          onPointerOut={() => setCursor(gl.domElement, null)}
          onPointerDown={(e) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            start(handle, e.nativeEvent);
          }}
        >
          <mesh>
            <circleGeometry args={[HANDLE_HIT, 20]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh renderOrder={46}>
            <circleGeometry args={[1, 20]} />
            <meshBasicMaterial color={handle === "tail" ? COLORS.highlight : "#ffffff"} depthTest={false} toneMapped={false} />
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
