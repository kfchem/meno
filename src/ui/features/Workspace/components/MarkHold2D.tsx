/**
 * Marks a hand can move (docs/EDITOR-2D.md, *Charges, R and S put by
 * hand*): an atom's charge - with its radical's dots - its R or S, and a
 * bond's E or Z. Each is taken hold of on its own letters, and nowhere
 * else - next to it the atom is the atom's - lit as the pointer is on it,
 * and dragged it goes where the pointer takes it, to stay there: kept with
 * the drawing, as one step. Two clicks on one put it back where the drawing
 * puts it.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { isTail, labelSetOf, markExtent, placeLabel } from "../../../../lib/chem/layout2d";
import { COLORS } from "../../../theme/colors";
import { setCursor } from "../../../theme/cursors";
import { TAU, follow } from "../../../theme/motion";
import { DOUBLE_CLICK_MS, MOV_PX } from "../constants";
import type { MarkOf } from "../document";
import { useEditorStore, useEditor } from "../store";
import { pageAt } from "../utils/page";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";

type Pt = { x: number; y: number };

/** How strongly the light behind a mark under the pointer shows. */
const LIT = 0.22;

/** Whether two marks are the same one. */
const sameMark = (p: MarkOf | null, q: MarkOf | null) => JSON.stringify(p) === JSON.stringify(q);

/**
 * A mark taken hold of: where its middle is (`at`), how far its letters
 * reach from it either way, what it is of and the point it is measured
 * from (`from`: the atom, or the bond's middle), and how large an em of the
 * labels is - all on the page.
 */
export function MarkHold({ of, at, halfW, halfH, from, em }: { of: MarkOf; at: Pt; halfW: number; halfH: number; from: Pt; em: number }) {
  const store = useEditorStore();
  const hovered = useEditor((s) => sameMark(s.hoveredMark, of));
  const { camera, gl, invalidate } = useThree();
  const light = useRef<THREE.MeshBasicMaterial>(null);
  // (the place it is dragged from, as the drag began - and what it is measured from then)
  const now = useRef({ at, from, em });
  now.current = { at, from, em };
  useFrame((_, dt) => {
    const m = light.current;
    if (!m) return;
    const to = hovered ? LIT : 0;
    if (Math.abs(m.opacity - to) < 1e-3) {
      m.opacity = to;
      return;
    }
    m.opacity = follow(m.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  // gone from under the pointer without the pointer leaving it: no longer under it
  useEffect(
    () => () => {
      const s = store.getState();
      if (sameMark(s.hoveredMark, of)) {
        s.setHoveredMark(null);
        setCursor(gl.domElement, null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `of` by what it says
    [store, gl, JSON.stringify(of)],
  );
  const toWorld = (cx: number, cy: number): Pt => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  return (
    <group position={[at.x, at.y, 0.06]}>
      <mesh
        renderOrder={3}
        onPointerOver={(e) => {
          e.stopPropagation();
          store.getState().setHoveredMark(of);
          setCursor(gl.domElement, "move");
        }}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerOut={() => {
          const s = store.getState();
          if (sameMark(s.hoveredMark, of)) s.setHoveredMark(null);
          setCursor(gl.domElement, null);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          store.getState().putMark(of, null);
          store.getState().suppressDoubleClick(DOUBLE_CLICK_MS);
        }}
        onPointerDown={(e) => {
          const ev = e.nativeEvent;
          if (ev.button !== 0) return;
          // (its, not the atom's under it)
          e.stopPropagation();
          const st = store.getState();
          st.beginPanHold(ev.pointerId);
          const p0 = toWorld(ev.clientX, ev.clientY);
          const start = now.current;
          const gesture = `mark-${performance.now()}`;
          let moved = false;
          const onMove = (m: PointerEvent) => {
            if (!moved && Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY) < MOV_PX) return;
            moved = true;
            const q = toWorld(m.clientX, m.clientY);
            const mid = { x: start.at.x + q.x - p0.x, y: start.at.y + q.y - p0.y };
            // (where it is now, from what it is of: as it is measured as the drag goes on)
            const base = now.current.from;
            store.getState().putMark(of, { x: (mid.x - base.x) / start.em, y: (mid.y - base.y) / start.em }, gesture);
          };
          const onUp = (u: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp, true);
            const s = store.getState();
            s.endPanHold(u.pointerId);
            // (the button coming up here is no click on the atom, nor on empty space)
            s.suppressDoubleClick(DOUBLE_CLICK_MS);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp, true);
        }}
      >
        <planeGeometry args={[2 * halfW, 2 * halfH]} />
        <meshBasicMaterial ref={light} color={COLORS.highlight} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * The atoms' charges as the drawing sets them, each taken hold of on its
 * own ink (`MarkHold`): after a label, beside it or beside a bare vertex,
 * or where a hand put it.
 */
export function ChargeHolds2D() {
  const { atoms, layout, opts } = useDrawnLayout();
  // (the view's zoom only where labels are sized on the screen: in the drawing's own units, a zoom leaves them as they are)
  const labelZoom = useDrawnZoom((z) => (opts.units === "px" ? z : null));
  const holds = useMemo(() => {
    const set = labelSetOf(opts);
    const out: { id: number; at: Pt; halfW: number; halfH: number; from: Pt; em: number }[] = [];
    for (const t of layout.texts) {
      const index = t.beside ? t.markOf : t.atom;
      const a = index != null ? atoms[index] : undefined;
      if (!a) continue;
      const size = labelZoom != null ? t.fontPx / Math.max(labelZoom, 1e-6) : t.fontPx;
      const runs = t.runs ?? [{ text: t.text }];
      const anchor = t.anchorRun ?? 0;
      const placed = placeLabel(t, size, set);
      const tail = placed.filter((_, k) => (t.beside ? true : isTail(runs, k, anchor)));
      if (!tail.length) continue;
      const e = markExtent(tail, set);
      out.push({ id: a.id, at: { x: e.x, y: e.y }, halfW: e.halfW, halfH: e.halfH, from: { x: a.x, y: a.y }, em: size });
    }
    return out;
  }, [layout, atoms, opts, labelZoom]);
  return (
    <group>
      {holds.map((h) => (
        <MarkHold key={h.id} of={{ atom: h.id, kind: "charge" }} at={h.at} halfW={h.halfW} halfH={h.halfH} from={h.from} em={h.em} />
      ))}
    </group>
  );
}
