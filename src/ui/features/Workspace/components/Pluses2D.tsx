import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { plusMeasures, plusOutline } from "../../../../lib/chem/reactionScheme";
import { useEditor, useEditorStore } from "../store";
import { COLORS } from "../../../theme/colors";
import { DOUBLE_CLICK_MS, MOV_PX } from "../constants";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { dragSelection } from "../utils/dragSelection";
import { carriedWithMore } from "../utils/selectionScheme";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";

/**
 * The "+" signs of a reaction scheme, as the drawing style draws them, in
 * the bonds' colour: each dragged to move it - or, carried by a selection
 * with more, all of that - a click selecting it alone, Ctrl or ⌘ and a click
 * adding it to the selection or taking it out; the one under the pointer
 * the one a right-click's menu is for.
 */
export default function Pluses2D() {
  const pluses = useEditor((s) => s.pluses);
  const selPluses = useEditor((s) => s.selPluses);
  const store = useEditorStore();
  const movePlus = useEditor((s) => s.movePlus);
  const beginPanHold = useEditor((s) => s.beginPanHold);
  const endPanHold = useEditor((s) => s.endPanHold);
  const setHoveredPlus = useEditor((s) => s.setHoveredPlus);
  const style = useDrawingStyle();
  const { opts } = useDrawnLayout();
  const { camera, gl } = useThree();
  const canvas = gl.domElement as HTMLCanvasElement;
  const toWorld = (cx: number, cy: number) => {
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -(((cy - rect.top) / rect.height) * 2 - 1),
      0,
    );
    const p = pageAt(v.x, v.y, camera);
    return { x: p.x, y: p.y };
  };
  const dragRef = useRef<{ id: number; offx: number; offy: number; gesture: string } | null>(null);

  // one shape for every "+", about its middle
  const measures = useMemo(() => plusMeasures(style, NOMINAL_BOND_LENGTH), [style]);
  // no thinner on the screen than a bond is kept (ReactionArrow2D): a zoom
  // changes it only once the view is out far enough for that
  const thickness = useDrawnZoom((z) => Math.max(measures.thickness, Math.max(0.5, opts.minLinePx ?? 1) / Math.max(z, 1e-6)));
  const geometry = useMemo(() => {
    const outline = plusOutline({ x: 0, y: 0 }, { ...measures, thickness });
    return new THREE.ShapeGeometry(new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y))));
  }, [measures, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const fill = opts.bondColor ?? "black";

  return (
    <group>
      {pluses.map((p) => (
        <group
          key={p.id}
          position={[p.x, p.y, 0.02]}
          onPointerOver={() => setHoveredPlus(p.id)}
          onPointerOut={() => setHoveredPlus(null)}
          onPointerDown={(e) => {
            // a right press is the menu's, or the view's to move
            if (((e as any).button ?? (e as any).nativeEvent?.button ?? 0) !== 0) return;
            // (one press, one move: the "+" and the square round it are both
            // under the pointer, and each would hand the press here again)
            e.stopPropagation();
            const cx = (e as any).clientX ?? (e as any).nativeEvent?.clientX;
            const cy = (e as any).clientY ?? (e as any).nativeEvent?.clientY;
            const keys = { ctrlKey: !!e.nativeEvent?.ctrlKey, metaKey: !!e.nativeEvent?.metaKey };
            if (addsToSelection(keys)) {
              store.getState().togglePlusSel(p.id);
              store.getState().suppressDoubleClick(DOUBLE_CLICK_MS);
              return;
            }
            beginPanHold((e as any).pointerId ?? (e as any).nativeEvent?.pointerId ?? null);
            if (carriedWithMore(store, "plus", p.id)) {
              dragSelection(store, toWorld, { x: cx, y: cy }, (u) => {
                endPanHold(u.pointerId);
                store.getState().suppressDoubleClick(DOUBLE_CLICK_MS);
              });
              return;
            }
            const at = toWorld(cx, cy);
            dragRef.current = { id: p.id, offx: p.x - at.x, offy: p.y - at.y, gesture: `move-${performance.now()}` };
            let moved = false;
            const onMove = (ev: PointerEvent) => {
              if (!dragRef.current) return;
              if (!moved && Math.hypot(ev.clientX - cx, ev.clientY - cy) < MOV_PX) return;
              moved = true;
              const q = toWorld(ev.clientX, ev.clientY);
              const d = dragRef.current;
              movePlus(d.id, q.x + d.offx, q.y + d.offy, d.gesture);
            };
            const onUp = (ev: PointerEvent) => {
              dragRef.current = null;
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp, true);
              try {
                endPanHold(ev.pointerId);
              } catch {
                endPanHold(null);
              }
              // (a click: it alone selected)
              if (!moved) {
                const s = store.getState();
                s.clearSel();
                s.selectPluses([p.id]);
                s.suppressDoubleClick(DOUBLE_CLICK_MS);
              }
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, true);
          }}
        >
          <mesh geometry={geometry}>
            <meshBasicMaterial color={fill} toneMapped={false} depthTest={false} depthWrite={false} />
          </mesh>
          {/* (selected: lit round, as a shape is) */}
          {selPluses.has(p.id) && (
            <mesh position={[0, 0, -0.006]}>
              <circleGeometry args={[0.55, 32]} />
              <meshBasicMaterial color={COLORS.highlight} transparent opacity={0.38} depthTest={false} depthWrite={false} toneMapped={false} />
            </mesh>
          )}
          {/* an invisible square round it, easier to take hold of */}
          <mesh position={[0, 0, -0.005]}>
            <boxGeometry args={[0.8, 0.8, 0.001]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
