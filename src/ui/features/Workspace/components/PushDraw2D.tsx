import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { pushMeasures, pushOutlines } from "../../../../lib/chem/pushArrow";
import { COLORS } from "../../../theme/colors";
import { DOUBLE_CLICK_MS } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { PushArrow } from "../store/types";
import { pageAt } from "../utils/page";
import { partAt, pushShapes, pushTargetAt } from "../utils/pushes";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout } from "./drawnLayoutContext";
import { polyTriangles } from "./polyTriangles";

/**
 * An electron-pushing arrow being drawn (docs/EDITOR-2D.md,
 * *Electron-pushing arrows*): begun from an atom's or a bond's menu - or
 * from Quick Add, when the first atom or bond pressed is where it starts -
 * it follows the pointer, button up, and comes to the atom or bond under
 * it, or to the gap between two atoms where a bond would form; a click
 * there puts it down, one step. A press that ends on one, from a drag that
 * began on the menu's icon, does the same. A click on nothing, Escape or a
 * right press lets it go.
 */
export default function PushDraw2D() {
  const draw = useEditor((s) => s.pushDraw);
  const bonds = useEditor((s) => s.model.bonds);
  const store = useEditorStore();
  const { atoms, layout, opts } = useDrawnLayout();
  const style = useDrawingStyle();
  const { camera, gl, invalidate } = useThree();
  const m = useMemo(() => pushMeasures(style, NOMINAL_BOND_LENGTH), [style]);

  useEffect(() => {
    if (!draw) return;
    const el = gl.domElement;
    const toWorld = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    };
    const over = (e: { target: EventTarget | null }) => e.target === el;
    const targetAt = (cx: number, cy: number) => {
      const s = store.getState();
      return pushTargetAt(toWorld(cx, cy), s.hovered, atoms, s.model.bonds, NOMINAL_BOND_LENGTH);
    };
    const onMove = (e: PointerEvent) => {
      const s = store.getState();
      const d = s.pushDraw;
      if (!d) return;
      const to = d.from && over(e) ? targetAt(e.clientX, e.clientY) : null;
      s.setPushDraw({ ...d, pointer: toWorld(e.clientX, e.clientY), to: to && JSON.stringify(to) !== JSON.stringify(d.from) ? to : null });
    };
    // (where it is begun or put down: the press is its, nothing else's)
    const onDown = (e: PointerEvent) => {
      const s = store.getState();
      const d = s.pushDraw;
      if (!d || !over(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return s.setPushDraw(null);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      if (!d.from) {
        // (from Quick Add: the atom or the bond pressed is where it starts)
        const h = s.hovered;
        const from = h.atomId != null ? { atom: h.atomId } : h.bondId != null ? { bond: h.bondId } : partAt(toWorld(e.clientX, e.clientY), atoms, s.model.bonds, NOMINAL_BOND_LENGTH);
        s.setPushDraw(from ? { ...d, from, pointer: toWorld(e.clientX, e.clientY) } : null);
        return;
      }
      const to = targetAt(e.clientX, e.clientY) ?? d.to;
      if (to && JSON.stringify(to) !== JSON.stringify(d.from)) s.addPush(d.from, to, d.half);
      s.setPushDraw(null);
    };
    // (a drag from the menu's icon, let go on an end: put down there)
    const onUp = (e: PointerEvent) => {
      const s = store.getState();
      const d = s.pushDraw;
      if (!d?.from || !over(e) || e.button !== 0) return;
      const to = targetAt(e.clientX, e.clientY);
      if (!to || JSON.stringify(to) === JSON.stringify(d.from)) return;
      s.addPush(d.from, to, d.half);
      s.setPushDraw(null);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      store.getState().setPushDraw(null);
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
    el.style.cursor = "crosshair";
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      el.style.cursor = "";
    };
    // (begun, or let go: the listeners are the drawing's while it lasts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!draw, store, gl, camera, atoms]);

  // the arrow as it would be put down: to the end under the pointer, or to the pointer
  const preview = useMemo(() => {
    if (!draw?.from || !draw.pointer) return null;
    const push: PushArrow = { id: -1, from: draw.from, to: draw.to ?? draw.from, ...(draw.half ? { half: true as const } : {}) };
    const [one] = pushShapes([push], atoms, bonds, layout.texts, opts, opts.fontPx, m, draw.to ? undefined : { of: -1, end: "to", at: draw.pointer });
    if (!one) return null;
    const positions: number[] = [];
    const polys = [...pushOutlines(one.shape, draw.half, m), ...one.shape.dots.map((d) => Array.from({ length: 20 }, (_, k) => ({ x: d.c.x + d.r * Math.cos((k * Math.PI) / 10), y: d.c.y + d.r * Math.sin((k * Math.PI) / 10) })))];
    for (const pts of polys) if (pts.length >= 3) for (const i of polyTriangles(pts)) positions.push(pts[i].x, pts[i].y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [draw, atoms, bonds, layout.texts, opts, m]);
  useEffect(() => {
    invalidate();
    return () => preview?.dispose();
  }, [preview, invalidate]);
  if (!preview) return null;
  return (
    <mesh geometry={preview} renderOrder={22} frustumCulled={false} raycast={() => {}}>
      {/* (in the highlight's colour until it is put down, its end found or not) */}
      <meshBasicMaterial color={draw?.to ? (opts.bondColor ?? "black") : COLORS.highlight} toneMapped={false} depthTest={false} depthWrite={false} transparent opacity={draw?.to ? 1 : 0.8} side={THREE.DoubleSide} />
    </mesh>
  );
}
