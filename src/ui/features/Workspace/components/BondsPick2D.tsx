import { bondKeyOf, doubleClickPatch, singleClickPatch } from "../utils/bondKinds";
import { longPressMs } from "../longPress";
import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useThree } from "@react-three/fiber";
import { pressMovedUnder } from "./viewGoal";
import { useEditor, useEditorStore } from "../store";
import { DOUBLE_CLICK_MS, MOV_PX } from "../constants";
import { pressOnBond, type BondPress } from "../utils/clickCount";
import { dragSelection } from "../utils/dragSelection";
import { onChord } from "../utils/press";
import { commitInstanceMatrices } from "./instances";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { releaseClicksBond } from "../utils/press";
import { bondLengthFrom } from "../utils/magnified";

export default function BondsPick2D() {
  const { camera, gl } = useThree();
  const store = useEditorStore();
  // a bond key with the pointer on a bond (docs/EDITOR-2D.md, *Bond keys*): 1, 2, 3 - not while a label or any field is typed in
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = bondKeyOf(e);
      if (key == null) return;
      const s = store.getState();
      const id = s.hovered.bondId;
      if (id == null || s.labelEdit.active) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.dataset.textField != null)) return;
      e.preventDefault();
      s.bondKey(id, key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), 0);
    const p = pageAt(v.x, v.y, camera);
    return { x: p.x, y: p.y };
  };
  const {
    model,
    setHoveredFromId,
    clearBondHover,
    moveDrag,
    updateBond,
    setBondDoubleMode,
    beginPanHold,
    endPanHold,
    suppressDoubleClick,
    hovered,
    triggerHoverPulse,
    toggleBondSel,
    selectPathTo,
  } = useEditor();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const countCap = Math.max(model.bonds.length, 1);
  const remountKey = model.bonds.length;
  const PICK_THICKNESS_RATIO = 0.32;

  // (the last press on a bond: a second soon after on the same one is a double-click's)
  const lastBondPress = useRef<(BondPress & { count: number }) | null>(null);
  const clickState = useRef<{
    lastAt: number;
    count: number;
    bondId: number | null;
    timer: number | null;
    pointerId: number | null;
    downPos: { x: number; y: number } | null;
    graceUntil: number | null;
    graceTimer: number | null;
    armed: boolean; // whether this mesh accepted pointerDown
    downBondId: number | null; // bondId hit by the last pointerDown
  }>({
    lastAt: 0,
    count: 0,
    bondId: null,
    timer: null,
    pointerId: null,
    downPos: null,
    graceUntil: null,
    graceTimer: null,
    armed: false,
    downBondId: null,
  });
  const CLICK_MS = 350;
  const SINGLE_DELAY_MS = 200;
  const TRIPLE_GRACE_MS = 180;

  function applySingleCycle(b: (typeof model.bonds)[number]) {
    if (b.order === 3) {
      updateBond(b.id, { order: 2 as any, doubleMode: "auto" });
      return;
    }
    if (b.order === 2) {
      updateBond(b.id, {
        order: 1 as any,
        stereo: (b.stereo ?? "none") as any,
      });
      return;
    }
    updateBond(b.id, singleClickPatch(b));
  }
  function applyDoubleCycle(b: (typeof model.bonds)[number]) {
    // (a double one: its next side; any other, a double - utils/bondKinds, as the "2" key does)
    const patch = doubleClickPatch(b, model.atoms, model.bonds);
    if (b.order === 2) setBondDoubleMode(b.id, patch.doubleMode!);
    else updateBond(b.id, patch);
  }
  function applyTriple(b: (typeof model.bonds)[number]) {
    updateBond(b.id, { order: 3 as any, stereo: "none" });
  }

  const { atoms, bonds } = model;
  // (what each hit area was placed from: a bond whose bond and atoms are the
  // objects they were is where it was - at every frame of a drag, all but
  // the few that moved)
  const placed = useRef<{ mesh: THREE.InstancedMesh | null; from: unknown[] }>({ mesh: null, from: [] });
  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    m.count = bonds.length;
    const thickWorld = PICK_THICKNESS_RATIO * NOMINAL_BOND_LENGTH;
    // (each atom by its id, looked up once rather than searched for at each bond)
    const byId = new Map<number, (typeof atoms)[number]>();
    for (const a of atoms) if (!byId.has(a.id)) byId.set(a.id, a);
    if (placed.current.mesh !== m) placed.current = { mesh: m, from: [] };
    const from = placed.current.from;
    let moved = false;
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i];
      const a1 = byId.get(b.a);
      const a2 = byId.get(b.b);
      if (!a1 || !a2) continue;
      if (from[3 * i] === b && from[3 * i + 1] === a1 && from[3 * i + 2] === a2) continue;
      from[3 * i] = b;
      from[3 * i + 1] = a1;
      from[3 * i + 2] = a2;
      moved = true;
      const dx = a2.x - a1.x,
        dy = a2.y - a1.y;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      tmpM.compose(
        new THREE.Vector3((a1.x + a2.x) / 2, (a1.y + a2.y) / 2, -0.01),
        tmpQ,
        new THREE.Vector3(len, thickWorld, 1)
      );
      m.setMatrixAt(i, tmpM);
    }
    if (moved) commitInstanceMatrices(m);
  }, [atoms, bonds, tmpM, tmpQ]);

  return (
    <instancedMesh
      ref={inst}
      key={remountKey}
      args={[undefined as any, undefined as any, countCap]}
      frustumCulled={false}
      onDoubleClick={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return; // skip if not this mesh
        const b = model.bonds[idx];
        if (!b) return;
        try {
          const p = (e as any).point as { x: number; y: number } | undefined;
          if (p) {
            const a1 = model.atoms.find((a) => a.id === b.a);
            const a2 = model.atoms.find((a) => a.id === b.b);
            if (a1 && a2) {
              const L = bondLengthFrom(model.atoms, a1.id);
              const th = L * 0.3;
              const d1 = Math.hypot(p.x - a1.x, p.y - a1.y);
              const d2 = Math.hypot(p.x - a2.x, p.y - a2.y);
              if (Math.min(d1, d2) <= th) {
                return;
              }
            }
          }
        } catch {}
        (e as any).stopPropagation?.();
        try {
          suppressDoubleClick(320);
        } catch {}
      }}
      onPointerDown={(e) => {
        // Only the main button works a bond; the other opens its menu.
        if (((e as any).nativeEvent?.button ?? 0) !== 0) return;
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const b = model.bonds[idx];
        if (!b) return;
        try {
          const p = (e as any).point as { x: number; y: number } | undefined;
          if (p) {
            const a1 = model.atoms.find((a) => a.id === b.a);
            const a2 = model.atoms.find((a) => a.id === b.b);
            if (a1 && a2) {
              const L = bondLengthFrom(model.atoms, a1.id);
              const th = L * 0.3;
              const d1 = Math.hypot(p.x - a1.x, p.y - a1.y);
              const d2 = Math.hypot(p.x - a2.x, p.y - a2.y);
              if (Math.min(d1, d2) <= th) {
                clickState.current.armed = false;
                clickState.current.downBondId = null;
                return;
              }
            }
          }
        } catch {}
        try {
          setHoveredFromId(b.id);
        } catch {}
        // Ctrl (⌘) and a click adds the bond to the selection, with its
        // atoms, or takes it out; Shift and a click, everything along the
        // bonds to it.
        const native = (e as any).nativeEvent as PointerEvent | undefined;
        if (native && (addsToSelection(native) || native.shiftKey)) {
          clickState.current.armed = false;
          clickState.current.downBondId = null;
          (e as any).stopPropagation?.();
          if (native.shiftKey) {
            selectPathTo(b.a);
            selectPathTo(b.b);
          } else toggleBondSel(b.id);
          return;
        }
        clickState.current.armed = true;
        clickState.current.downBondId = b.id;
        const pid =
          (e as any).pointerId ?? (e as any).nativeEvent?.pointerId ?? null;
        if (pid != null) beginPanHold(pid);
        // Held still, the press selects the whole structure, the selection
        // spreading out from the bond as it is held (HoldProgress2D); a drag
        // from there moves it. A click or a drag before then is the bond's.
        // (Not the second press of a double-click, as on an atom.)
        const tPress = performance.now();
        const count = pressOnBond(lastBondPress.current, { id: b.id, t: tPress }, DOUBLE_CLICK_MS);
        lastBondPress.current = { id: b.id, t: tPress, count };
        if (count === 1) {
          const ev0 = (e as any).nativeEvent ?? e;
          const sx = ev0.clientX;
          const sy = ev0.clientY;
          store.getState().setPressHold({ atomId: b.a, start: performance.now() });
          const letGo = () => {
            window.clearTimeout(hold);
            offChord();
            store.getState().setPressHold(null);
            window.removeEventListener("pointermove", onEarlyMove);
            window.removeEventListener("pointerup", letGo, true);
          };
          const onEarlyMove = (ev: PointerEvent) => {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) >= MOV_PX) letGo();
          };
          const hold = window.setTimeout(() => {
            letGo();
            // (nor where the view has moved under the press: viewGoal)
            if (!clickState.current.armed || clickState.current.downBondId !== b.id || pressMovedUnder(camera)) return;
            // (no click of the bond's, now)
            clickState.current.armed = false;
            clickState.current.downBondId = null;
            // (the structure alone: what else was selected let go, as a hold on words or a shape does)
            store.getState().clearSel();
            store.getState().selectStructure(b.a);
            dragSelection(store, toWorld, { x: sx, y: sy }, (ev) => {
              store.getState().suppressDoubleClick(DOUBLE_CLICK_MS);
              endPanHold(ev.pointerId ?? pid);
            });
          }, longPressMs());
          // (another button pressed with it: no press at all, nor a click of the bond's - utils/press#onChord)
          const offChord = onChord(1, () => {
            letGo();
            clickState.current.armed = false;
            clickState.current.downBondId = null;
          });
          window.addEventListener("pointermove", onEarlyMove);
          window.addEventListener("pointerup", letGo, true);
        }
        try {
          const ev = (e as any).nativeEvent ?? e;
          clickState.current.downPos = { x: ev.clientX, y: ev.clientY };
        } catch {
          clickState.current.downPos = null;
        }
        (e as any).stopPropagation?.();
        try {
          if (hovered.bondId === b.id) triggerHoverPulse(b.id);
        } catch {}
      }}
      onPointerUp={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const b = model.bonds[idx];
        if (!b) return;
        const st = clickState.current;
        const ev = (e as any).nativeEvent ?? e;
        if (!releaseClicksBond(st, b.id, ev?.button ?? 0)) return;
        // (the press's arming used up: the next click arms again with its own)
        st.armed = false;
        st.downBondId = null;
        const down = st.downPos;
        const moved = (() => {
          if (!down || !ev) return false;
          const dx = (ev.clientX ?? 0) - down.x;
          const dy = (ev.clientY ?? 0) - down.y;
          return Math.hypot(dx, dy) > 6; // >6px is considered a drag
        })() || pressMovedUnder(camera); // (or the view moved under it: no click)
        if (moveDrag.active || moved) {
          // Drop click aggregation
          if (st.timer != null) {
            window.clearTimeout(st.timer);
            st.timer = null;
          }
          st.count = 0;
          st.bondId = null;
          st.pointerId = null;
          st.downPos = null;
          st.armed = false;
          st.downBondId = null;
          try {
            endPanHold(null);
          } catch {}
          (e as any).stopPropagation?.();
          return;
        }
        const now = performance.now();
        const pid =
          (e as any).pointerId ?? (e as any).nativeEvent?.pointerId ?? null;
        const sameTarget = st.bondId === b.id && now - st.lastAt <= CLICK_MS;
        if (!sameTarget) {
          if (st.timer != null) {
            window.clearTimeout(st.timer);
            st.timer = null;
          }
          if (st.graceTimer != null) {
            window.clearTimeout(st.graceTimer);
            st.graceTimer = null;
          }
          st.count = 0;
          st.graceUntil = null;
        }
        st.bondId = b.id;
        st.lastAt = now;
        st.pointerId = pid ?? null;
        st.count += 1;
        if (st.timer != null) {
          window.clearTimeout(st.timer);
          st.timer = null;
        }
        if (st.count === 1) {
          const delay1 = SINGLE_DELAY_MS;
          st.timer = window.setTimeout(() => {
            const bond = model.bonds.find((x) => x.id === st.bondId!);
            if (bond) applySingleCycle(bond);
            try {
              if (st.pointerId != null) endPanHold(st.pointerId);
              else endPanHold(null);
            } catch {
              endPanHold(null);
            }
            st.count = 0;
            st.timer = null;
            st.bondId = null;
            st.pointerId = null;
            st.downPos = null;
            st.graceUntil = null;
          }, delay1) as unknown as number;
        } else if (st.count === 2) {
          const bond = model.bonds.find((x) => x.id === st.bondId!);
          if (bond) applyDoubleCycle(bond);
          st.graceUntil = now + TRIPLE_GRACE_MS;
          if (st.graceTimer != null) {
            window.clearTimeout(st.graceTimer);
            st.graceTimer = null;
          }
          st.graceTimer = window.setTimeout(() => {
            try {
              if (st.pointerId != null) endPanHold(st.pointerId);
              else endPanHold(null);
            } catch {
              endPanHold(null);
            }
            st.count = 0;
            st.bondId = null;
            st.pointerId = null;
            st.downPos = null;
            st.graceUntil = null;
            st.graceTimer = null;
          }, TRIPLE_GRACE_MS) as unknown as number;
        } else if (st.count >= 3) {
          const bond = model.bonds.find((x) => x.id === st.bondId!);
          if (bond) applyTriple(bond);
          if (st.graceTimer != null) {
            window.clearTimeout(st.graceTimer);
            st.graceTimer = null;
          }
          try {
            if (st.pointerId != null) endPanHold(st.pointerId);
            else endPanHold(null);
          } catch {
            endPanHold(null);
          }
          st.count = 0;
          st.bondId = null;
          st.pointerId = null;
          st.downPos = null;
          st.graceUntil = null;
          st.armed = false;
          st.downBondId = null;
        }
        (e as any).stopPropagation?.();
      }}
      onPointerMove={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const b = model.bonds[idx];
        if (!b) return;
        const movingId = moveDrag.active ? moveDrag.atomId : null;
        if (movingId != null && (b.a === movingId || b.b === movingId)) return;
        setHoveredFromId((b as any).id);
      }}
      onPointerOut={() => clearBondHover()}
    >
      <planeGeometry args={[1, 1]} />
      {/* (a hit area only, never drawn - a pointer still finds it: picking
          does not ask whether a material is drawn - so that thousands of
          bonds are not painted over with as many unseen strips every frame) */}
      <meshBasicMaterial
        visible={false}
        color={"black"}
        transparent
        opacity={0.001}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
