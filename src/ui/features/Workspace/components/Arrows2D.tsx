import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { arrowEnds, arrowPoints, reshapedArrow } from "../../../../lib/chem/reactionScheme";
import { arrowPath, cornerAt, type ArrowCorner } from "../../../../lib/chem/reactionArrow";
import { COLORS } from "../../../theme/colors";
import { DOUBLE_CLICK_MS, FREE_MS, MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { strokeTriangles } from "../../../../lib/chem/shapes";
import { dragSelection } from "../utils/dragSelection";
import { carriedWithMore } from "../utils/selectionScheme";
import ReactionArrow2D from "./ReactionArrow2D";
import { useDrawnArrows } from "./drawnArrows";
import { TAU, follow } from "../../../theme/motion";
import { useDrawnZoom } from "./drawnLayoutContext";

/** An end handle's radius on the screen, in pixels, and how far round it a press takes it. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
/** The steps an end's direction snaps to, in degrees: a bond's. */
const SNAP_STEP = 15;
/** The shortest an arrow is drawn out to, in bonds. */
const MIN_LENGTH = 0.5;
/** How near the line between its neighbours a corner let go is taken away, in bonds: the line straight again. */
const STRAIGHT = 0.08;
/** A handle in the middle of a stretch, to turn the line there: as large as an end's, by this share. */
const MID_SHARE = 0.7;
/** The light round an arrow selected: how far it reaches either side of its line on the screen, in pixels, and how strong it is - as a shape's (Shapes2D). */
const LIT_PX = 4;
const CHOSEN = 0.38;

type Pointerish = { button?: number; clientX: number; clientY: number; pointerId?: number; ctrlKey?: boolean; metaKey?: boolean };
const native = (e: unknown): Pointerish => ((e as { nativeEvent?: Pointerish }).nativeEvent ?? (e as Pointerish));

/**
 * The arrows: each dragged to move it, the one under the pointer the one a
 * right-click's menu is for. That one shows a handle at either end:
 * dragged, the end goes where the pointer goes, the other staying put - its
 * direction in steps of 15 degrees, as a bond's, until the pointer pauses,
 * and then freely. It shows a handle at each corner its line turns at, and
 * a smaller one in the middle of each stretch: one dragged moves its
 * corner, or makes one there; a corner let go in line with the corners or
 * ends beside it is taken away, the line straight there again. Each is
 * drawn as long as the words over it and under it need, if they need more
 * than it was made (drawnArrows), growing and shrinking to that about its
 * middle as they are written.
 */
export default function Arrows2D() {
  const arrows = useDrawnArrows();
  const madeArrows = useEditor((s) => s.arrows);
  const hoveredArrow = useEditor((s) => s.hoveredArrow);
  const selArrows = useEditor((s) => s.selArrows);
  // (one being drawn from Quick Add, as it will be made)
  const draft = useEditor((s) => s.arrowDraft);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const canvas = gl.domElement as HTMLCanvasElement;
  const toWorld = (cx: number, cy: number) => {
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -(((cy - rect.top) / rect.height) * 2 - 1),
      0
    );
    const p = pageAt(v.x, v.y, camera);
    return { x: p.x, y: p.y };
  };
  // the arrow whose end is being drawn out: its handles stay while it is
  const [reshaping, setReshaping] = useState<number | null>(null);
  const handles = useRef<THREE.Group[]>([]);
  // how far each arrow's handles are in view: they grow in as it is hovered
  // and shrink out as it is left, rather than appear and vanish
  const handleLevel = useRef(new Map<number, number>());
  // how long each arrow is drawn, going over to how long it is to be - and
  // the arrow as it was made, when it was last drawn
  const shownLength = useRef(new Map<number, number>());
  const lastMade = useRef(new Map<number, (typeof madeArrows)[number]>());
  const [, setFrame] = useState(0);
  // (a length to go over to: frames, for it to go there)
  useEffect(() => invalidate(), [arrows, invalidate]);
  // the handles the same size on the screen at any zoom
  useFrame((_, dt) => {
    let moving = false;
    const d = Math.min(dt, 1 / 20);
    for (const a of arrows) {
      const was = shownLength.current.get(a.id);
      if (was != null && was !== a.length) {
        const n = follow(was, a.length, d, TAU.quick);
        shownLength.current.set(a.id, Math.abs(n - a.length) < 1e-4 * NOMINAL_BOND_LENGTH ? a.length : n);
        moving = true;
      }
    }
    for (const a of arrows) {
      const to = hoveredArrow === a.id || reshaping === a.id ? 1 : 0;
      const was = handleLevel.current.get(a.id) ?? 0;
      if (was === to) continue;
      const n = follow(was, to, d, TAU.quick);
      const next = Math.abs(n - to) < 0.01 ? to : n;
      if (next === 0) handleLevel.current.delete(a.id);
      else handleLevel.current.set(a.id, next);
      moving = true;
    }
    const k = HANDLE_PX / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-6);
    for (const h of handles.current) {
      if (!h) continue;
      const level = (h.userData.level as number) ?? 1;
      h.scale.setScalar(k * (0.6 + 0.4 * level));
      h.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && m.userData.seen) m.opacity = level;
      });
    }
    if (moving) {
      setFrame((f) => f + 1);
      invalidate();
    }
  });

  /**
   * A press on the arrow: dragged, it follows the pointer, as one step - or,
   * carried by a selection with more, all of that goes; a click selects it
   * alone; Ctrl, or ⌘, and a click adds it to the selection or takes it out.
   */
  const startMove = (id: number, e: { stopPropagation: () => void }) => {
    const ev = native(e);
    // a right press is the menu's, or the view's to move
    if ((ev.button ?? 0) !== 0) return;
    // (one press, one move: the arrow and its wider hit area are both under
    // the pointer, and each would hand the press to this group again - two
    // moves at once, each its own undo step)
    e.stopPropagation();
    const st = store.getState();
    if (addsToSelection({ ctrlKey: !!ev.ctrlKey, metaKey: !!ev.metaKey })) {
      st.toggleArrowSel(id);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const a = st.arrows.find((x) => x.id === id);
    if (!a) return;
    st.beginPanHold(ev.pointerId ?? null);
    if (carriedWithMore(store, "arrow", id)) {
      dragSelection(store, toWorld, { x: ev.clientX, y: ev.clientY }, (u) => {
        const s = store.getState();
        s.endPanHold(u.pointerId);
        s.suppressDoubleClick(DOUBLE_CLICK_MS);
      });
      return;
    }
    const p = toWorld(ev.clientX, ev.clientY);
    const off = { x: a.x - p.x, y: a.y - p.y };
    const gesture = `move-${performance.now()}`;
    let moved = false;
    const onMove = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY) < MOV_PX) return;
      moved = true;
      const q = toWorld(m.clientX, m.clientY);
      store.getState().updateArrow(id, { x: q.x + off.x, y: q.y + off.y }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(u.pointerId);
      // (a click: it alone selected)
      if (!moved) {
        s.clearSel();
        s.selectArrows([id]);
        s.suppressDoubleClick(DOUBLE_CLICK_MS);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /** A press on an end's handle: that end follows the pointer, the other stays. */
  const startReshape = (id: number, end: "head" | "tail", e: { stopPropagation: () => void }) => {
    const ev = native(e);
    if ((ev.button ?? 0) !== 0) return;
    e.stopPropagation();
    const made = store.getState().arrows.find((x) => x.id === id);
    const a = arrows.find((x) => x.id === id);
    if (!made || !a) return;
    const { from, to } = arrowEnds(a);
    const fixed = end === "head" ? from : to;
    // (no shorter than its words need: the end held stays where it is)
    const least = Math.max(MIN_LENGTH * NOMINAL_BOND_LENGTH, a.length > made.length ? a.length : 0);
    const gesture = `reshape-${performance.now()}`;
    let free = false;
    let pause: number | null = null;
    let last = toWorld(ev.clientX, ev.clientY);
    setReshaping(id);
    store.getState().beginPanHold(ev.pointerId ?? null);
    const apply = () => {
      const shape = reshapedArrow(end, fixed, last, {
        step: free ? undefined : (SNAP_STEP * Math.PI) / 180,
        minLength: least,
      });
      store.getState().updateArrow(id, shape, gesture);
    };
    const onMove = (m: PointerEvent) => {
      last = toWorld(m.clientX, m.clientY);
      apply();
      // (a pause lets go of the steps, as a bond's does)
      if (pause != null) window.clearTimeout(pause);
      pause = window.setTimeout(() => {
        free = true;
        apply();
      }, FREE_MS);
    };
    const onUp = (u: PointerEvent) => {
      if (pause != null) window.clearTimeout(pause);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
      setReshaping(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /** A press on a corner's handle, or on a stretch's middle (`insert`): that corner follows the pointer, as one step - taken away, let go in line with its neighbours. */
  const startCorner = (id: number, index: number, insert: boolean, e: { stopPropagation: () => void }) => {
    const ev = native(e);
    if ((ev.button ?? 0) !== 0) return;
    e.stopPropagation();
    const a = arrows.find((x) => x.id === id);
    if (!a) return;
    // (the arrow as it is drawn: its corners are shares of how far its point is from its tail)
    const { from, to } = arrowEnds(a);
    let corners: ArrowCorner[] = [...(a.corners ?? [])];
    const gesture = `corner-${performance.now()}`;
    if (insert) {
      corners.splice(index, 0, cornerAt(from, to, toWorld(ev.clientX, ev.clientY)));
      store.getState().updateArrow(id, { corners }, gesture);
    }
    setReshaping(id);
    store.getState().beginPanHold(ev.pointerId ?? null);
    const onMove = (m: PointerEvent) => {
      const p = toWorld(m.clientX, m.clientY);
      corners = corners.map((c, i) => (i === index ? cornerAt(from, to, p) : c));
      store.getState().updateArrow(id, { corners }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
      setReshaping(null);
      // (in line with what is either side of it: no corner)
      const pts = arrowPath(from, to, corners);
      const [p, c, q] = [pts[index], pts[index + 1], pts[index + 2]];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const off = len > 0 ? Math.abs((c.x - p.x) * (q.y - p.y) - (c.y - p.y) * (q.x - p.x)) / len : Math.hypot(c.x - p.x, c.y - p.y);
      if (off < STRAIGHT * NOMINAL_BOND_LENGTH) {
        corners = corners.filter((_, i) => i !== index);
        store.getState().updateArrow(id, { corners: corners.length ? corners : undefined }, gesture);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  handles.current = [];
  // (each drawn as long as it has got to: one first seen, or itself moved or
  // drawn out - its middle gone where it goes - as long as it is now; only
  // what its words need goes over gently, the arrow staying where it is)
  const seen = new Set(arrows.map((a) => a.id));
  for (const id of [...shownLength.current.keys()]) if (!seen.has(id)) shownLength.current.delete(id);
  for (const id of [...lastMade.current.keys()]) if (!seen.has(id)) lastMade.current.delete(id);
  for (const made of madeArrows) {
    const was = lastMade.current.get(made.id);
    const moved = !was || was.x !== made.x || was.y !== made.y || was.angle !== made.angle || was.length !== made.length;
    lastMade.current.set(made.id, made);
    const drawn = arrows.find((a) => a.id === made.id);
    if (drawn && (moved || !shownLength.current.has(made.id))) shownLength.current.set(made.id, drawn.length);
  }
  return (
    <group>
      {draft && <ReactionArrow2D x1={draft.from.x} y1={draft.from.y} x2={draft.to.x} y2={draft.to.y} z={0.02} />}
      {arrows.map((made) => {
        const a = { ...made, length: shownLength.current.get(made.id) ?? made.length };
        const { from, to } = arrowEnds(a);
        const pts = arrowPoints(a);
        const level = handleLevel.current.get(a.id) ?? 0;
        const shown = level > 0;
        const handle = (key: string, at: { x: number; y: number }, press: (e: { stopPropagation: () => void }) => void, share = 1) => (
          <group
            key={key}
            ref={(g) => {
              if (g) handles.current.push(g);
            }}
            userData={{ level: level * share }}
            // (over the stretches' wider hit areas: a press on a handle is the handle's)
            position={[at.x, at.y, 0.03]}
            onPointerDown={press}
          >
            {/* (what a press takes, wider than what is seen) */}
            <mesh>
              <circleGeometry args={[HANDLE_HIT, 24]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh renderOrder={41}>
              <circleGeometry args={[1, 24]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} transparent opacity={level} userData={{ seen: true }} />
            </mesh>
            <mesh renderOrder={42}>
              <ringGeometry args={[0.68, 1, 24]} />
              <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} transparent opacity={level} userData={{ seen: true }} />
            </mesh>
          </group>
        );
        return (
          <group
            key={a.id}
            position={[0, 0, 0.02]}
            // (the arrow under the pointer is the one a right-click's menu is for)
            onPointerOver={() => store.getState().setHoveredArrow(a.id)}
            onPointerOut={() => store.getState().setHoveredArrow(null)}
            onPointerDown={(e) => startMove(a.id, e)}
          >
            <ReactionArrow2D x1={from.x} y1={from.y} x2={to.x} y2={to.y} look={a.look} form={a} color={a.color} />
            {selArrows.has(a.id) && <ArrowLight points={pts} />}
            {/* invisible thicker hit area to ease dragging: a stretch at a time, where it turns */}
            {pts.slice(1).map((q, i) => {
              const p = pts[i];
              const len = Math.hypot(q.x - p.x, q.y - p.y);
              return (
                <mesh key={i} position={[(p.x + q.x) / 2, (p.y + q.y) / 2, 0.015]} rotation={[0, 0, Math.atan2(q.y - p.y, q.x - p.x)]}>
                  <boxGeometry args={[len + 0.8, 0.8, 0.001]} />
                  <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
                </mesh>
              );
            })}
            {shown && [
              handle("tail", from, (e) => startReshape(a.id, "tail", e)),
              handle("head", to, (e) => startReshape(a.id, "head", e)),
              ...pts.slice(1, -1).map((c, i) => handle(`corner-${i}`, c, (e) => startCorner(a.id, i, false, e))),
              ...pts.slice(1).map((q, i) => handle(`mid-${i}`, { x: (pts[i].x + q.x) / 2, y: (pts[i].y + q.y) / 2 }, (e) => startCorner(a.id, i, true, e), MID_SHARE)),
            ]}
          </group>
        );
      })}
    </group>
  );
}

/** The light round an arrow selected, along its line and its corners, as wide on the screen at any zoom. */
function ArrowLight({ points }: { points: readonly { x: number; y: number }[] }) {
  // (the view's zoom as the drawing takes it up: drawn again as it changes - drawnLayoutContext `useDrawnZoom`)
  const zoom = useDrawnZoom();
  const key = JSON.stringify(points);
  const geometry = useMemo(() => {
    const t = strokeTriangles(points, false, (2 * LIT_PX) / Math.max(zoom, 1e-6));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(t.positions.flatMap((v, i) => (i % 2 ? [v, 0] : [v])), 3));
    g.setIndex(t.indices);
    return g;
    // (made again as it moves or the view zooms)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zoom]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[0, 0, -0.005]} frustumCulled={false} raycast={() => {}}>
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={CHOSEN} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
