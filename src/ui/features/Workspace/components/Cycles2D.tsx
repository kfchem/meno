import * as THREE from "three";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { styleOf } from "../../../../lib/chem/style";
import { cycleArrows, endKey, GAP_MOST, inkDistance, type Cycle } from "../../../../lib/chem/cycle";
import { useEditor, useEditorStore } from "../store";
import { pageAt } from "../utils/page";
import { dragSelection } from "../utils/dragSelection";
import { carriedByCycle, CycleChange, CycleEase, cyclePointed, cycleThings, membersOn, thingKey } from "../utils/cycles";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { COLORS } from "../../../theme/colors";
import ReactionArrow2D from "./ReactionArrow2D";
import { useDrawnZoom } from "./drawnLayoutContext";

type Pt = { x: number; y: number };

/** Where cycles lie: with the arrows (0), under the drawing's labels. */
const Z = 0.004;
/** On the screen, in pixels: how far off its line a press still takes a cycle; its handle's radius. */
const EDGE_PX = 6;
const HANDLE_PX = 5;
/** How far a press may move and still be a click, in pixels. */
const CLICK_PX = 4;
/** Where a cycle's handle is, round it: its lower right. */
const HANDLE_AT = -Math.PI / 4;

/**
 * The catalytic cycles on the page (lib/chem/cycle; docs/EDITOR-2D.md,
 * *Catalytic cycles*): each drawn as its arrows - the stretches between what
 * lies on it, and its arrows coming in and going out - in the drawing
 * style's reaction arrows' look. A click on its line selects it; held still
 * a moment there, it is taken hold of; selected, a drag moves it with all
 * that lies on it, and its handle sizes it, what lies on it kept on its line;
 * a handle at each end of its arrows sets how far that end stops short of
 * what it points at - a double-click gives it back the cycle's own.
 */
export default function Cycles2D() {
  const cycles = useEditor((s) => s.cycles);
  const model = useEditor((s) => s.model);
  const captions = useEditor((s) => s.captions);
  const docStyle = useEditor((s) => s.docStyle);
  const sel = useEditor((s) => s.selCycles);
  const hovered = useEditor((s) => s.hoveredCycle);
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const zoom = useDrawnZoom((z) => z);
  const things = useMemo(() => cycleThings(model, captions, styleOf(docStyle), cycles), [model, captions, docStyle, cycles]);
  const toWorld = useCallback(
    (cx: number, cy: number): Pt => {
      const rect = gl.domElement.getBoundingClientRect();
      const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    },
    [gl, camera],
  );
  return (
    <group>
      {cycles.map((c) => (
        <CycleItem key={c.id} c={c} things={things} selected={sel.has(c.id)} hovered={hovered === c.id} zoom={zoom} toWorld={toWorld} />
      ))}
    </group>
  );
}

function CycleItem({ c, things, selected, hovered, zoom, toWorld }: { c: Cycle; things: ReturnType<typeof cycleThings>; selected: boolean; hovered: boolean; zoom: number; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  const invalidate = useThree((st) => st.invalidate);
  // (what is on it, eased: the circle opens round what comes on and closes after what goes off)
  const now = useMemo(() => membersOn(c, things).map((m) => ({ ...m, key: thingKey(things[m.index]) })), [c, things]);
  const ease = useRef(new CycleEase());
  ease.current.take(now);
  // (and the cycle's own changes: turned round, an arrow coming in or going out put there or taken away)
  const change = useRef(new CycleChange());
  change.current.take(c);
  const [, setStep] = useState(0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30);
    const moving = ease.current.step(d);
    if (!change.current.step(d) && !moving) return;
    setStep((n) => n + 1);
    invalidate();
  });
  const arrows = cycleArrows(c, [], NOMINAL_BOND_LENGTH, ease.current.members(), change.current.motion());
  const slack = EDGE_PX / Math.max(zoom, 1e-6);
  const handle = HANDLE_PX / Math.max(zoom, 1e-6);
  const hp = { x: c.x + c.r * Math.cos(HANDLE_AT), y: c.y + c.r * Math.sin(HANDLE_AT) };
  // (what is drawn on the page over it is pressed, not it)
  const drawingHas = () => {
    const st = store.getState();
    return st.hovered.atomId != null || st.hovered.bondId != null || st.hoveredArrow != null || st.hoveredCaption != null || st.hoveredShape != null;
  };
  const onLine = (p: Pt) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r) <= slack;
  const onMove = (e: { point: THREE.Vector3; stopPropagation: () => void }) => {
    const st = store.getState();
    const p = { x: e.point.x, y: e.point.y };
    if (!drawingHas() && onLine(p)) {
      e.stopPropagation();
      cyclePointed.id = c.id;
      cyclePointed.angle = Math.atan2(p.y - c.y, p.x - c.x);
      st.setHoveredCycle(c.id);
    } else if (st.hoveredCycle === c.id) st.setHoveredCycle(null);
  };
  const out = () => {
    if (store.getState().hoveredCycle === c.id) store.getState().setHoveredCycle(null);
  };
  const move = (ev: PointerEvent) => {
    store.getState().beginPanHold(ev.pointerId);
    dragSelection(store, toWorld, { x: ev.clientX, y: ev.clientY }, (u) => {
      const s2 = store.getState();
      s2.endPanHold(u.pointerId);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
    });
  };
  const onDown = (e: { nativeEvent: PointerEvent; point: THREE.Vector3; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0 || drawingHas() || !onLine({ x: e.point.x, y: e.point.y })) return;
    e.stopPropagation();
    const st = store.getState();
    // selected: a drag moves it, with what lies on it
    if (st.selCycles.has(c.id)) return move(ev);
    // else a click selects it; held still a moment, it is taken hold of; a drag moves the view
    const from = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const hold = window.setTimeout(() => {
      stop();
      const s2 = store.getState();
      s2.clearSel();
      s2.selectCycles([c.id]);
      move(ev);
    }, LONG_PRESS_MS);
    const onMoveDrag = (mv: PointerEvent) => {
      if (moved || Math.hypot(mv.clientX - from.x, mv.clientY - from.y) < CLICK_PX) return;
      moved = true;
      window.clearTimeout(hold);
    };
    const onUp = (u: PointerEvent) => {
      stop();
      window.clearTimeout(hold);
      if (moved) return;
      const s2 = store.getState();
      s2.clearSel();
      s2.selectCycles([c.id]);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
      void u;
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMoveDrag);
      window.removeEventListener("pointerup", onUp, true);
    };
    window.addEventListener("pointermove", onMoveDrag);
    window.addEventListener("pointerup", onUp, true);
  };
  /** Its handle dragged: its radius where the pointer is, what lies on it moved out or in with the line, as one step. */
  const onHandle = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    e.stopPropagation();
    const st = store.getState();
    st.beginPanHold(ev.pointerId);
    const here = cycleThings(st.model, st.captions, styleOf(st.docStyle), [c]);
    const carried = carriedByCycle(c, here);
    const atoms = st.model.atoms.filter((a) => carried.atoms.includes(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y }));
    const words = st.captions.filter((w) => carried.captions.includes(w.id)).map((w) => ({ id: w.id, x: w.x, y: w.y }));
    // (each structure, or words, moved as its middle is - out along the line from the cycle's middle)
    const groups = here.filter((t) => (t.atoms ? t.atoms.some((id) => carried.atoms.includes(id)) : carried.captions.includes(t.caption!)));
    const gesture = `cycle-size-${performance.now()}`;
    const onMoveDrag = (mv: PointerEvent) => {
      const p = toWorld(mv.clientX, mv.clientY);
      const r = Math.max(NOMINAL_BOND_LENGTH, Math.hypot(p.x - c.x, p.y - c.y));
      const k = r / c.r;
      const shift = new Map<string, Pt>();
      for (const g of groups) {
        const m = { x: (g.box.x0 + g.box.x1) / 2, y: (g.box.y0 + g.box.y1) / 2 };
        const d = { x: (m.x - c.x) * (k - 1), y: (m.y - c.y) * (k - 1) };
        if (g.atoms) for (const id of g.atoms) shift.set(`a${id}`, d);
        else shift.set(`c${g.caption}`, d);
      }
      store.getState().moveAtoms(
        atoms.map((a) => ({ id: a.id, x: a.x + (shift.get(`a${a.id}`)?.x ?? 0), y: a.y + (shift.get(`a${a.id}`)?.y ?? 0) })),
        gesture,
        {
          captions: words.map((w) => ({ id: w.id, x: w.x + (shift.get(`c${w.id}`)?.x ?? 0), y: w.y + (shift.get(`c${w.id}`)?.y ?? 0) })),
          cycles: [{ id: c.id, x: c.x, y: c.y, r }],
        },
      );
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMoveDrag);
      window.removeEventListener("pointerup", onUp, true);
      const s2 = store.getState();
      s2.endPanHold(u.pointerId);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    window.addEventListener("pointermove", onMoveDrag);
    window.addEventListener("pointerup", onUp, true);
  };
  // (each end of its arrows, while it is selected: where it is, and what it stops short of)
  const ends = selected
    ? ease.current.members().flatMap((m) => {
        const t = things[m.index];
        if (m.passing || !t?.ink) return [];
        return (["lo", "hi"] as const).map((side) => ({ key: endKey(thingKey(t), side), side, angle: m.angle, ink: t.ink!, at: m.angle + (side === "hi" ? m.hi : -m.lo) }));
      })
    : [];
  const clicked = useRef<{ key: string; t: number } | null>(null);
  /** An end's handle pressed: dragged, that end's gap where the pointer has taken it - back from what it points at, or nearer - as one step; pressed twice, the cycle's own gap again. */
  const onEnd = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }, end: (typeof ends)[number]) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    e.stopPropagation();
    const st = store.getState();
    const at = performance.now();
    if (clicked.current && clicked.current.key === end.key && at - clicked.current.t < DOUBLE_CLICK_MS) {
      clicked.current = null;
      st.updateCycle(c.id, { ends: { [end.key]: null } });
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    clicked.current = { key: end.key, t: at };
    st.beginPanHold(ev.pointerId);
    const from = { x: ev.clientX, y: ev.clientY };
    const gesture = `cycle-end-${at}`;
    const s = end.side === "hi" ? 1 : -1;
    const onMoveDrag = (mv: PointerEvent) => {
      if (Math.hypot(mv.clientX - from.x, mv.clientY - from.y) < CLICK_PX) return;
      const p = toWorld(mv.clientX, mv.clientY);
      const a = Math.atan2(p.y - c.y, p.x - c.x);
      // (how far round from the middle of what it stops short of, on its own side: none, past the middle)
      const off = Math.atan2(Math.sin(a - end.angle), Math.cos(a - end.angle)) * s;
      const q = { x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) };
      const gap = off <= 0 ? 0 : Math.min(GAP_MOST, inkDistance(q, end.ink) / NOMINAL_BOND_LENGTH);
      store.getState().updateCycle(c.id, { ends: { [end.key]: gap } }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMoveDrag);
      window.removeEventListener("pointerup", onUp, true);
      const s2 = store.getState();
      s2.endPanHold(u.pointerId);
      s2.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    window.addEventListener("pointermove", onMoveDrag);
    window.addEventListener("pointerup", onUp, true);
  };
  const lit = selected ? 0.35 : hovered ? 0.18 : 0;
  return (
    <group position={[0, 0, Z]}>
      {arrows.map((a, i) => {
        const dx = (Math.cos(a.angle) * a.length) / 2;
        const dy = (Math.sin(a.angle) * a.length) / 2;
        return <ReactionArrow2D key={i} x1={a.x - dx} y1={a.y - dy} x2={a.x + dx} y2={a.y + dy} form={a} color={a.color} headScale={a.headScale} />;
      })}
      {/* (lit along its line under the pointer, and more while it is selected) */}
      {lit > 0 && (
        <mesh position={[c.x, c.y, -0.001]}>
          <ringGeometry args={[Math.max(0, c.r - slack * 0.7), c.r + slack * 0.7, 128]} />
          <meshBasicMaterial color={COLORS.highlight} transparent opacity={lit} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {/* (what takes a press on its line: unseen) */}
      <mesh position={[c.x, c.y, 0.001]} onPointerMove={onMove} onPointerOut={out} onPointerDown={onDown}>
        <ringGeometry args={[Math.max(0, c.r - slack), c.r + slack, 128]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
      {ends.map((end) => (
        <mesh key={end.key} position={[c.x + c.r * Math.cos(end.at), c.y + c.r * Math.sin(end.at), 0.002]} onPointerDown={(e) => onEnd(e, end)}>
          <circleGeometry args={[handle * 0.8, 20]} />
          <meshBasicMaterial color={COLORS.highlight} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {selected && (
        <mesh position={[hp.x, hp.y, 0.002]} onPointerDown={onHandle}>
          <circleGeometry args={[handle, 24]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} toneMapped={false} />
          <mesh position={[0, 0, 0.0005]}>
            <ringGeometry args={[handle * 0.75, handle, 24]} />
            <meshBasicMaterial color={COLORS.highlight} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
        </mesh>
      )}
    </group>
  );
}
