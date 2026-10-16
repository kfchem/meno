import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { bendThrough, endBase, pointAt, pushMeasures, pushOutlines, type PushShape } from "../../../../lib/chem/pushArrow";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { DOUBLE_CLICK_MS } from "../constants";
import { useEditor, useEditorStore } from "../store";
import { pageAt } from "../utils/page";
import { laidKey, pushShapes, pushTargetAt } from "../utils/pushes";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { polyTriangles } from "./polyTriangles";

type P = { x: number; y: number };

/** A handle's radius on the screen, in pixels. */
const HANDLE_PX = 6;
/** How far round its line an arrow is taken hold of, and lit as the pointer is on it, in bonds. */
const HOLD = 0.16;
/** How strongly the light behind an arrow under the pointer shows. */
const LIT = 0.18;

/** Outlines and dots as one geometry of triangles. */
function shapesGeometry(polys: readonly P[][], dots: readonly { c: P; r: number }[] = []): THREE.BufferGeometry {
  const positions: number[] = [];
  const add = (pts: readonly P[]) => {
    if (pts.length < 3) return;
    for (const i of polyTriangles(pts as P[])) positions.push(pts[i].x, pts[i].y, 0);
  };
  polys.forEach(add);
  for (const d of dots) add(Array.from({ length: 20 }, (_, k) => ({ x: d.c.x + d.r * Math.cos((k * Math.PI) / 10), y: d.c.y + d.r * Math.sin((k * Math.PI) / 10) })));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

/**
 * The electron-pushing arrows (docs/EDITOR-2D.md, *Electron-pushing
 * arrows*), each drawn from its ends where their atoms are drawn - so that
 * it goes with them as they move, are turned or cleaned up. The one under
 * the pointer is lit from behind, is the one a right-click's menu is for,
 * and shows a handle at its middle and one at each end: its line or its
 * middle dragged bends it through the pointer; an end dragged onto an atom,
 * a bond or the gap between two atoms takes it there; each one step. Two
 * clicks on it bend it as Meno does again.
 */
/** `value` as it was when `key` was last other than it is: the same object while what it is said to be stays the same. */
function useKept<T>(value: T, key: string): T {
  const kept = useRef({ key, value });
  if (kept.current.key !== key) kept.current = { key, value };
  return kept.current.value;
}

export default function PushArrows2D() {
  const pushes = useEditor((s) => s.pushes);
  const hoveredPush = useEditor((s) => s.hoveredPush);
  const bonds = useEditor((s) => s.model.bonds);
  const store = useEditorStore();
  const { atoms, layout, opts } = useDrawnLayout();
  const style = useDrawingStyle();
  const { camera, gl, invalidate } = useThree();
  const m = useMemo(() => pushMeasures(style, NOMINAL_BOND_LENGTH), [style]);
  // an end being drawn out: where the pointer is
  const [moving, setMoving] = useState<{ of: number; end: "from" | "to"; at: P } | null>(null);
  // (laid out again only as what they are laid by changes - not as the drawing is laid out again the same, at each frame of a zoom)
  const laidOn = useKept(layout, pushes.length ? laidKey(layout) : "");
  const shapes = useMemo(
    () => pushShapes(pushes, atoms, bonds, laidOn, opts, opts.fontPx, m, moving ?? undefined),
    [pushes, atoms, bonds, laidOn, opts, m, moving],
  );
  // (one mesh for each colour they are drawn in: the bonds' ink, unless an arrow is given its own)
  const ink = opts.bondColor ?? "black";
  const drawn = useMemo(() => {
    const byColour = new Map<string, typeof shapes>();
    for (const one of shapes) byColour.set(one.push.color ?? ink, [...(byColour.get(one.push.color ?? ink) ?? []), one]);
    return [...byColour].map(([color, these]) => ({
      color,
      geometry: shapesGeometry(
        these.flatMap(({ push, shape }) => pushOutlines(shape, !!push.half, m)),
        these.flatMap(({ shape }) => shape.dots),
      ),
    }));
  }, [shapes, m, ink]);
  useEffect(() => () => drawn.forEach((d) => d.geometry.dispose()), [drawn]);

  const toWorld = (cx: number, cy: number): P => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  /** A press on an arrow or its middle: it bends through the pointer as it goes, one step. */
  const startBend = (id: number, e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    const s = store.getState();
    // (over an atom or a bond, the press is theirs: an arrow's room runs up to them)
    if (s.hovered.atomId != null || s.hovered.bondId != null) return;
    e.stopPropagation();
    const now = shapes.find((x) => x.push.id === id);
    if (!now) return;
    // (two clicks: bent as Meno bends it again)
    const last = lastPress.current;
    lastPress.current = { id, t: performance.now() };
    if (last && last.id === id && performance.now() - last.t < DOUBLE_CLICK_MS) {
      s.updatePush(id, { bend: null });
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const a = endBase(now.from);
    const b = endBase(now.to);
    const gesture = `bend-${performance.now()}`;
    const start = { x: ev.clientX, y: ev.clientY };
    let went = false;
    s.beginPanHold(ev.pointerId);
    const onMove = (mv: PointerEvent) => {
      if (!went && Math.hypot(mv.clientX - start.x, mv.clientY - start.y) < 3) return;
      went = true;
      store.getState().updatePush(id, { bend: bendThrough(a, b, toWorld(mv.clientX, mv.clientY)) }, gesture);
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const st = store.getState();
      st.endPanHold(up.pointerId);
      // (the button coming up here is no click on empty space)
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };
  const lastPress = useRef<{ id: number; t: number } | null>(null);

  /** A press on an end's handle: that end follows the pointer, and goes where it is let go - onto an atom, a bond or a gap - one step. */
  const startEnd = (id: number, end: "from" | "to", e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    e.stopPropagation();
    const s = store.getState();
    s.beginPanHold(ev.pointerId);
    setMoving({ of: id, end, at: toWorld(ev.clientX, ev.clientY) });
    const onMove = (mv: PointerEvent) => setMoving({ of: id, end, at: toWorld(mv.clientX, mv.clientY) });
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const st = store.getState();
      st.endPanHold(up.pointerId);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      const target = pushTargetAt(toWorld(up.clientX, up.clientY), st.hovered, atoms, st.model.bonds, NOMINAL_BOND_LENGTH);
      if (target) st.updatePush(id, { [end]: target });
      setMoving(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  // how far each arrow's light and handles are in view, going over to it
  const level = useRef(new Map<number, number>());
  const [, setTick] = useState(0);
  useFrame((_, dt) => {
    let changed = false;
    for (const { push } of shapes) {
      const to = hoveredPush === push.id || moving?.of === push.id ? 1 : 0;
      const was = level.current.get(push.id) ?? 0;
      if (was === to) continue;
      const n = follow(was, to, Math.min(dt, 1 / 20), TAU.quick);
      level.current.set(push.id, Math.abs(n - to) < 0.01 ? to : n);
      changed = true;
    }
    if (changed) {
      setTick((t) => t + 1);
      invalidate();
    }
  });
  useEffect(() => invalidate(), [hoveredPush, invalidate]);

  // (the view's zoom as the drawing takes it up, for the handles' size on the screen: drawn again as it changes -
  // drawnLayoutContext `useDrawnZoom` - only while an arrow shows its handles; with none lit, a zoom draws nothing
  // here again: every frame of a zoom, all of it was drawn again for handles not shown, found on Windows, 2026-10-16)
  const lit = hoveredPush != null || moving != null || [...level.current.values()].some((v) => v > 0);
  const k = HANDLE_PX / Math.max(useDrawnZoom((z) => (lit ? z : 1)), 1e-6);
  return (
    <group>
      {drawn.map(({ color, geometry }) => (
        <mesh key={color} geometry={geometry} renderOrder={21} frustumCulled={false} raycast={() => {}}>
          <meshBasicMaterial color={color} toneMapped={false} depthTest={false} depthWrite={false} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
      {shapes.map(({ push, shape }) => (
        <PushHold
          key={push.id}
          id={push.id}
          shape={shape}
          level={level.current.get(push.id) ?? 0}
          handle={k}
          onEnter={() => store.getState().setHoveredPush(push.id)}
          onLeave={() => {
            if (store.getState().hoveredPush === push.id) store.getState().setHoveredPush(null);
          }}
          onBend={(e) => startBend(push.id, e)}
          onEnd={(end, e) => startEnd(push.id, end, e)}
        />
      ))}
    </group>
  );
}

/** Where an arrow is taken hold of: round its line, lit while the pointer is on it - and its handles, at its middle and its ends. */
function PushHold({
  id,
  shape,
  level,
  handle,
  onEnter,
  onLeave,
  onBend,
  onEnd,
}: {
  id: number;
  shape: PushShape;
  level: number;
  handle: number;
  onEnter: () => void;
  onLeave: () => void;
  onBend: (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => void;
  onEnd: (end: "from" | "to", e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => void;
}) {
  const band = useMemo(() => {
    const L = NOMINAL_BOND_LENGTH;
    const [line] = pushOutlines(shape, false, { thickness: 2 * HOLD * L, headLength: 0, headWidth: 0, headInset: 0, round: true, bondLength: L });
    return shapesGeometry([line]);
  }, [shape]);
  useEffect(() => () => band.dispose(), [band]);
  const middle = pointAt(shape, 0.5);
  const handles: [string, P, (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => void][] = [
    ["from", shape.start, (e) => onEnd("from", e)],
    ["middle", middle, onBend],
    ["to", shape.end, (e) => onEnd("to", e)],
  ];
  return (
    <group name={`push-${id}`} onPointerOver={onEnter} onPointerOut={onLeave}>
      {/* (taking the pointer always, drawn only while lit: unlit, it is nothing to see, and drawing it cost every frame) */}
      <mesh geometry={band} position={[0, 0, -0.01]} renderOrder={-1} frustumCulled={false} onPointerDown={onBend}>
        <meshBasicMaterial color={COLORS.highlight} transparent opacity={LIT * level} visible={level > 0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {level > 0 &&
        handles.map(([key, at, press]) => (
          <group key={key} position={[at.x, at.y, 0.03]} scale={handle * (0.6 + 0.4 * level)} onPointerDown={press}>
            <mesh>
              <circleGeometry args={[2, 20]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh renderOrder={41}>
              <circleGeometry args={[1, 24]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} transparent opacity={level} />
            </mesh>
            <mesh renderOrder={42}>
              <ringGeometry args={[0.68, 1, 24]} />
              <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} transparent opacity={level} />
            </mesh>
          </group>
        ))}
    </group>
  );
}
