import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useThree } from "@react-three/fiber";
import { pressMovedUnder } from "./viewGoal";
import { useEditor, useEditorStore } from "../store";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS, MOV_PX } from "../constants";
import { pressOnBond, type BondPress } from "../utils/clickCount";
import { dragSelection } from "../utils/dragSelection";
import { commitInstanceMatrices } from "./instances";
import { addsToSelection } from "../../../../lib/doc/shortcuts";

export default function BondsPick2D() {
  const { camera, gl } = useThree();
  const store = useEditorStore();
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
    const curS = (b.stereo ?? "none") as "none" | "up" | "down";
    const curO = ((b as any).stereoOrient ?? "principle") as
      | "principle"
      | "reverse";
    let nextS: typeof curS = curS;
    let nextO: typeof curO = curO;
    if (curS === "none") {
      nextS = "up";
    } else if (curS === "up") {
      nextS = "down";
    } else if (curS === "down") {
      nextS = "none";
      nextO = curO === "principle" ? "reverse" : "principle";
    }
    // Apply state
    updateBond(b.id, { stereo: nextS as any, stereoOrient: nextO as any });
  }
  function applyDoubleCycle(b: (typeof model.bonds)[number]) {
    if (b.order !== 2) {
      updateBond(b.id, {
        order: 2 as any,
        doubleMode: "auto",
        stereo: "none" as any,
      });
      return;
    }
    type DM = "auto" | "left" | "center" | "right";
    const dm = ((b as any).doubleMode ?? "auto") as DM;
    const effAuto = (() => {
      const a1 = model.atoms.find((a) => a.id === b.a);
      const a2 = model.atoms.find((a) => a.id === b.b);
      if (!a1 || !a2) return "center" as const;
      const dx = a2.x - a1.x,
        dy = a2.y - a1.y;
      const L0 = Math.hypot(dx, dy);
      const dirx = L0 > 1e-9 ? dx / L0 : 1;
      const diry = L0 > 1e-9 ? dy / L0 : 0;
      const nx = -diry,
        ny = dirx;
      const EPS = Math.max(1e-4, L0 * 0.06);
      let plus = 0,
        minus = 0;
      for (const bb of model.bonds) {
        if (bb.id === b.id) continue;
        if (bb.a === a1.id || bb.b === a1.id) {
          const other = bb.a === a1.id ? bb.b : bb.a;
          if (other === a2.id) continue;
          const pa = model.atoms.find((x) => x.id === other);
          if (!pa) continue;
          const sx = pa.x - a1.x,
            sy = pa.y - a1.y;
          const s = sx * nx + sy * ny;
          if (s > EPS) plus++;
          else if (s < -EPS) minus++;
        }
        if (bb.a === a2.id || bb.b === a2.id) {
          const other = bb.a === a2.id ? bb.b : bb.a;
          if (other === a1.id) continue;
          const pb = model.atoms.find((x) => x.id === other);
          if (!pb) continue;
          const sx = pb.x - a2.x,
            sy = pb.y - a2.y;
          const s = sx * nx + sy * ny;
          if (s > EPS) plus++;
          else if (s < -EPS) minus++;
        }
      }
      if (plus === minus) return "center" as const;
      return plus > minus ? ("left" as const) : ("right" as const);
    })();

    const currentEff = dm === "auto" ? effAuto : dm;
    let cands: DM[] = [];
    if (effAuto === "left") {
      if (dm === "auto")
        cands = ["center", "right", "left"]; // auto->center->right->...
      else if (dm === "left")
        cands = ["center", "right", "auto"]; // left->center
      else if (dm === "center")
        cands = ["right", "auto", "left"]; // center->right
      else if (dm === "right") cands = ["auto", "left", "center"]; // right->auto
    } else if (effAuto === "right") {
      if (dm === "auto")
        cands = ["center", "left", "right"]; // auto->center->left->...
      else if (dm === "right")
        cands = ["center", "left", "auto"]; // right->center
      else if (dm === "center")
        cands = ["left", "auto", "right"]; // center->left
      else if (dm === "left") cands = ["auto", "right", "center"]; // left->auto
    } else {
      // effAuto === "center"
      if (dm === "auto")
        cands = ["left", "right", "center"]; // auto->left(or right)
      else if (dm === "center")
        cands = ["right", "left", "auto"]; // prefer center->right
      else if (dm === "left")
        cands = ["right", "auto", "center"]; // left->right
      else if (dm === "right") cands = ["left", "auto", "center"]; // right->left
    }
    for (const cand of cands) {
      const candEff = cand === "auto" ? effAuto : cand;
      if (candEff !== currentEff) {
        setBondDoubleMode(b.id, cand as any);
        return;
      }
    }
    setBondDoubleMode(
      b.id,
      dm === "right" ? ("left" as any) : ("right" as any)
    );
  }
  function applyTriple(b: (typeof model.bonds)[number]) {
    updateBond(b.id, { order: 3 as any, stereo: "none" });
  }

  const { atoms, bonds } = model;
  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    m.count = bonds.length;
    const thickWorld = PICK_THICKNESS_RATIO * NOMINAL_BOND_LENGTH;
    // (each atom by its id, looked up once rather than searched for at each bond)
    const byId = new Map<number, (typeof atoms)[number]>();
    for (const a of atoms) if (!byId.has(a.id)) byId.set(a.id, a);
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i];
      const a1 = byId.get(b.a);
      const a2 = byId.get(b.b);
      if (!a1 || !a2) continue;
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
    commitInstanceMatrices(m);
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
              const L = NOMINAL_BOND_LENGTH;
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
              const L = NOMINAL_BOND_LENGTH;
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
          }, LONG_PRESS_MS);
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
        if (!st.armed || st.downBondId !== b.id) return;
        const ev = (e as any).nativeEvent ?? e;
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
