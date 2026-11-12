import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { bondRadiusOf, type Style3D } from "../../../../lib/chem/style3d";
import { MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { Molecule3D, Turn3D } from "../store/types";
import { lookOf, onMolecule, poseOf, solidOf } from "../utils/molecule3d";
import { eyeOf, pageAt } from "../utils/page";
import { STACK_SWAP_MS } from "../utils/stacks";
import { stereoShownOf } from "../document";
import { HELD_CHIP_ROW, heldViewId, heldViews, viewShown } from "../workflow/heldView";
import Molecule3DView from "./Molecule3DView";
import StackChip3D from "./StackChip3D";

const NONE: number[] = [];

/** How a drag turns a view: as a molecule on the page turns, about the axis the pointer moves across. */
const turnQuaternion = (was: Turn3D | undefined, axis: THREE.Vector3, angle: number): Turn3D => {
  const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
  return [q.x, q.y, q.z, q.w] as Turn3D;
};

/**
 * The molecules of the large result sets that show them one at a time
 * (workflow/heldView), each drawn in its set's frame with its stack chip
 * under it: the molecule shown a view of the set's collection, turned by a
 * drag across it and pointed at - on no page, so not selected, moved or
 * deleted. The stack going over to the next is as a stack's on the page
 * (Molecules3D): the one let go of towards the viewer, the next up from
 * behind. Inside Molecules3D's group, in its lights.
 */
export default function HeldViews3D({
  style,
  hover,
  onHover,
  onTurning,
  stereoFont,
}: {
  style: Style3D;
  /** The view the pointer is on, by its molecule's id. */
  hover: number | null;
  onHover: (id: number | null) => void;
  /** A view being turned by a drag: the pointer says so. */
  onTurning: (turning: boolean) => void;
  stereoFont: React.ComponentProps<typeof Molecule3DView>["stereoFont"];
}) {
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  const sets = useEditor((s) => s.sets);
  const wires = useEditor((s) => s.wires);
  const steps = useEditor((s) => s.steps);
  const molecules3d = useEditor((s) => s.molecules3d);
  const model = useEditor((s) => s.model);
  const shown = useEditor((s) => s.heldShown);
  const turns = useEditor((s) => s.turns3d);
  const frames = useEditor((s) => s.frames3d);
  const views = useMemo(() => heldViews({ sets, wires, steps, molecules3d, model }, shown), [sets, wires, steps, molecules3d, model, shown]);
  const viewsNow = useRef(views);
  viewsNow.current = views;
  // a view going over to the next: the one let go of, as it was, drawn as it goes - and when the next came, to draw it coming
  const [receding, setReceding] = useState<{ m: Molecule3D; turn: Turn3D | undefined; frame: number; start: number }[]>([]);
  const arrived = useRef(new Map<number, number>());
  const showNow = (set: number, index: number) => {
    const v = viewsNow.current.find((x) => x.set.id === set);
    // (one that is shown, or that is not in the collection: nothing goes over)
    if (!v || v.index === index || !Number.isInteger(index) || index < 0 || index >= v.count) return;
    const st = store.getState();
    const now = performance.now();
    // (gone through quickly, the last two let go of are drawn as they go, no more)
    setReceding((r) => [...r.filter((x) => x.m.id !== v.molecule.id).slice(-1), { m: v.molecule, turn: st.turns3d[v.molecule.id], frame: st.frames3d[v.molecule.id] ?? 0, start: now }]);
    st.showHeld(set, index);
    for (const [id, at] of arrived.current) if (now - at > STACK_SWAP_MS) arrived.current.delete(id);
    arrived.current.set(heldViewId(set, index), now);
    invalidate();
  };

  // a drag across a view turns it; the pointer on it is Meno's turning pointer
  useEffect(() => {
    const pageOf = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      return pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), camera);
    };
    const hit = (e: PointerEvent): number | null => {
      const p = pageOf(e);
      const st = store.getState();
      for (const v of viewsNow.current) {
        const m = v.molecule;
        const pose = poseOf(m, solidOf(m, style), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]);
        if (onMolecule(m, pose, eyeOf(camera), p.x, p.y, camera.zoom, bondRadiusOf(style[lookOf(m)]))) return m.id;
      }
      return null;
    };
    let turning: { pointerId: number; id: number; x: number; y: number; moved: boolean; sx: number; sy: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (!turning) {
        if (e.buttons === 0) onHover(hit(e));
        return;
      }
      if (e.pointerId !== turning.pointerId) return;
      e.stopPropagation();
      if (!turning.moved && Math.hypot(e.clientX - turning.sx, e.clientY - turning.sy) < MOV_PX) return;
      if (!turning.moved) onTurning(true);
      turning.moved = true;
      const dx = e.clientX - turning.x;
      const dy = e.clientY - turning.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const angle = (style.turnPerHalfWidth * len) / Math.max(dom.clientWidth / 2, 1);
      const axis = new THREE.Vector3(dy, dx, 0).normalize();
      store.getState().setTurn3d(turning.id, turnQuaternion(store.getState().turns3d[turning.id], axis, angle));
      turning = { ...turning, x: e.clientX, y: e.clientY };
      invalidate();
    };
    const onDown = (e: PointerEvent) => {
      if (turning || e.button !== 0) return;
      const id = hit(e);
      if (id == null) return;
      e.stopPropagation();
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {}
      turning = { pointerId: e.pointerId, id, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    };
    const onUp = (e: PointerEvent) => {
      if (!turning || e.pointerId !== turning.pointerId) return;
      if (turning.moved) {
        // (a click that ends a drag is the drag's, not the page's)
        const swallow = (ev: Event) => ev.stopPropagation();
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      }
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {}
      turning = null;
      onTurning(false);
    };
    const onLeave = () => {
      if (!turning) onHover(null);
    };
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("pointerleave", onLeave);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("pointerleave", onLeave);
    };
  }, [dom, camera, store, style, invalidate, onHover, onTurning]);

  // a view that has gone (its set deleted, or held off the page) is no longer pointed at
  useEffect(() => {
    if (hover != null && !views.some((v) => v.molecule.id === hover)) onHover(null);
  }, [hover, views, onHover]);

  return (
    <>
      {views.map((v) => {
        const m = v.molecule;
        const came = arrived.current.get(m.id);
        const open = hover === m.id;
        const named = viewShown(v);
        return (
          <group key={`held-${v.set.id}`}>
            <Molecule3DView
              key={m.id}
              m={m}
              style={style}
              look={lookOf(m)}
              frame={frames[m.id] ?? 0}
              turn={turns[m.id]}
              lit={open ? 1 : 0}
              selected={false}
              chosen={NONE}
              chosenBonds={NONE}
              holding={null}
              following={false}
              framesOpen={open}
              onFrame={(f) => store.getState().setFrame3d(m.id, f)}
              hoveredMeasure={null}
              stereoShown={stereoShownOf(m)}
              atomNumbers={m.atomNumbers ?? null}
              stereoFont={stereoFont}
              chipDrop={HELD_CHIP_ROW}
              swap={came != null && performance.now() - came < STACK_SWAP_MS ? { dir: "in", start: came } : undefined}
            />
            <StackChip3D
              shown={named}
              turn={turns[m.id]}
              frame={frames[m.id] ?? 0}
              style={style}
              index={v.index}
              count={v.count}
              open={open}
              onShow={(k) => showNow(v.set.id, k)}
            />
          </group>
        );
      })}
      {receding.map(({ m, turn, frame, start }) => (
        <Molecule3DView
          key={`receding-${m.id}-${start}`}
          m={m}
          style={style}
          look={lookOf(m)}
          frame={frame}
          turn={turn}
          lit={0}
          selected={false}
          chosen={NONE}
          chosenBonds={NONE}
          holding={null}
          following={false}
          framesOpen={false}
          onFrame={() => {}}
          hoveredMeasure={null}
          stereoShown={null}
          stereoFont={stereoFont}
          swap={{ dir: "out", start }}
          onSwapped={() => setReceding((r) => r.filter((x) => x.start !== start || x.m !== m))}
        />
      ))}
    </>
  );
}
