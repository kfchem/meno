import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { arrowEnds, reshapedArrow } from "../../../../lib/chem/reactionScheme";
import { COLORS } from "../../../theme/colors";
import { FREE_MS } from "../constants";
import { useEditor, useEditorStore } from "../store";
import ReactionArrow2D from "./ReactionArrow2D";
import { useDrawnArrows } from "./drawnArrows";
import { TAU, follow } from "../../../theme/motion";

/** An end handle's radius on the screen, in pixels, and how far round it a press takes it. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
/** The steps an end's direction snaps to, in degrees: a bond's. */
const SNAP_STEP = 15;
/** The shortest an arrow is drawn out to, in bonds. */
const MIN_LENGTH = 0.5;

type Pointerish = { button?: number; clientX: number; clientY: number; pointerId?: number };
const native = (e: unknown): Pointerish => ((e as { nativeEvent?: Pointerish }).nativeEvent ?? (e as Pointerish));

/**
 * The reaction arrows: each dragged to move it, the one under the pointer
 * the one a right-click's menu is for. That one shows a handle at either
 * end: dragged, the end goes where the pointer goes, the other staying put -
 * its direction in steps of 15 degrees, as a bond's, until the pointer
 * pauses, and then freely. Each is drawn as long as the words over it and
 * under it need, if they need more than it was made (drawnArrows), growing
 * and shrinking to that about its middle as they are written.
 */
export default function Arrows2D() {
  const arrows = useDrawnArrows();
  const madeArrows = useEditor((s) => s.arrows);
  const hoveredArrow = useEditor((s) => s.hoveredArrow);
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

  /** A press on the arrow: it follows the pointer, as one step. */
  const startMove = (id: number, e: { stopPropagation: () => void }) => {
    const ev = native(e);
    // a right press is the menu's, or the view's to move
    if ((ev.button ?? 0) !== 0) return;
    // (one press, one move: the arrow and its wider hit area are both under
    // the pointer, and each would hand the press to this group again - two
    // moves at once, each its own undo step)
    e.stopPropagation();
    const a = store.getState().arrows.find((x) => x.id === id);
    if (!a) return;
    const p = toWorld(ev.clientX, ev.clientY);
    const off = { x: a.x - p.x, y: a.y - p.y };
    const gesture = `move-${performance.now()}`;
    store.getState().beginPanHold(ev.pointerId ?? null);
    const onMove = (m: PointerEvent) => {
      const q = toWorld(m.clientX, m.clientY);
      store.getState().updateArrow(id, { x: q.x + off.x, y: q.y + off.y }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
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
      {arrows.map((made) => {
        const a = { ...made, length: shownLength.current.get(made.id) ?? made.length };
        const { from, to } = arrowEnds(a);
        const level = handleLevel.current.get(a.id) ?? 0;
        const shown = level > 0;
        return (
          <group
            key={a.id}
            position={[0, 0, 0.02]}
            // (the arrow under the pointer is the one a right-click's menu is for)
            onPointerOver={() => store.getState().setHoveredArrow(a.id)}
            onPointerOut={() => store.getState().setHoveredArrow(null)}
            onPointerDown={(e) => startMove(a.id, e)}
          >
            <ReactionArrow2D x1={from.x} y1={from.y} x2={to.x} y2={to.y} look={a.look} />
            {/* invisible thicker hit area to ease dragging */}
            <mesh position={[a.x, a.y, 0.015]} rotation={[0, 0, a.angle]}>
              <boxGeometry args={[a.length + 0.8, 0.8, 0.001]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            {shown &&
              ([
                ["tail", from],
                ["head", to],
              ] as const).map(([end, at]) => (
                <group
                  key={end}
                  ref={(g) => {
                    if (g) handles.current.push(g);
                  }}
                  userData={{ level }}
                  position={[at.x, at.y, 0.006]}
                  onPointerDown={(e) => startReshape(a.id, end, e)}
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
              ))}
          </group>
        );
      })}
    </group>
  );
}
