import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import { dragSelection } from "../utils/dragSelection";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { computeMoveSnap } from "../utils/moveSnap";
import { ATOM_PICK_RADIUS_RATIO, DOUBLE_CLICK_MS, FREE_MS, LONG_PRESS_MS, MOV_PX } from "../constants";
import { clickClock, doubleClickedSince } from "../utils/clickCount";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { commitInstanceMatrices } from "./instances";

/** A click edits a label this long after it, unless a second click follows. */
const EDIT_DELAY_MS = DOUBLE_CLICK_MS;

// The hit area is world-fixed, the size of the hover ring
// (ATOM_PICK_RADIUS_RATIO), so what lights up is what can be picked.
export function Atoms2D() {
  const {
    model,
    moveAtom,
    connectAtoms,
    replaceDraggedAtomWith,
    findAtomNear,
    beginLabelEdit,
    setHoveredFromId,
    clearAtomHover,
    startExtend,
    updateExtend,
    holdExtend,
    commitExtend,
    beginPanHold,
    endPanHold,
    setMoveMode,
    beginMoveDrag,
    updateMovePointer,
    endMoveDrag,
    suppressDoubleClick,
    toggleAtomSel,
    selectPathTo,
  } = useEditor();
  const store = useEditorStore();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const { camera, gl } = useThree();
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
  // the last press on an atom, and how many clicks it is of
  const lastDown = useRef<{
    t: number;
    id: number | null;
    x: number;
    y: number;
    count: number;
  }>({ t: 0, id: null, x: 0, y: 0, count: 0 });
  const forgetPresses = () => {
    lastDown.current = { t: 0, id: null, x: 0, y: 0, count: 0 };
  };
  const cand = useRef<{
    active: boolean;
    atomId: number | null;
    started: boolean;
    sx: number;
    sy: number;
    lastx: number;
    lasty: number;
  }>({
    active: false,
    atomId: null,
    started: false,
    sx: 0,
    sy: 0,
    lastx: 0,
    lasty: 0,
  });
  const endedByInteractive = useRef(false);
  const pendingEdit = useRef<{ tid: number | null; atomId: number | null }>({
    tid: null,
    atomId: null,
  });
  const cancelPendingEdit = () => {
    if (pendingEdit.current.tid != null) {
      try {
        window.clearTimeout(pendingEdit.current.tid as any);
      } catch {}
      pendingEdit.current.tid = null;
      pendingEdit.current.atomId = null;
    }
  };
  const holdTimer = useRef<number | null>(null);
  const clearHold = () => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const resetCand = () => {
    cand.current = {
      active: false,
      atomId: null,
      started: false,
      sx: 0,
      sy: 0,
      lastx: 0,
      lasty: 0,
    };
  };

  /**
   * A stroke out of an atom, from the press to the release: a bond, or a
   * chain (see utils/stroke). A pause of FREE_MS in it lets a bond go where
   * the pointer is, or lays down the bond a chain is on.
   */
  const strokeGesture = (
    atomId: number,
    kind: "bond" | "chain",
    pid: number | null,
    onTap: (ev: PointerEvent) => void,
  ) => {
    const restartHold = () => {
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        if (cand.current.started) holdExtend();
      }, FREE_MS) as unknown as number;
    };
    const onMove = (ev: PointerEvent) => {
      if (!cand.current.active || cand.current.atomId == null) return;
      cand.current.lastx = ev.clientX;
      cand.current.lasty = ev.clientY;
      if (!cand.current.started) {
        const moved = Math.hypot(
          ev.clientX - cand.current.sx,
          ev.clientY - cand.current.sy,
        );
        if (moved < MOV_PX) return;
        cand.current.started = true;
        startExtend(atomId, kind);
      }
      const p = toWorld(ev.clientX, ev.clientY);
      updateExtend(p.x, p.y);
      restartHold();
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      clearHold();
      if (cand.current.active) {
        if (cand.current.started) {
          commitExtend();
          endedByInteractive.current = true;
        } else {
          onTap(ev);
        }
      }
      resetCand();
      endPanHold(ev.pointerId ?? pid);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /**
   * Moving an atom, from its first move to the release. It snaps as it goes;
   * after a pause of FREE_MS it follows the pointer freely. Dropped on
   * another atom, it becomes that atom.
   */
  const moveGesture = (idx: number, first: PointerEvent, pid: number | null) => {
    const thisAtom = model.atoms[idx];
    if (!thisAtom) return;
    cand.current.started = true;
    // During and just after the drag, a click is not a label edit.
    suppressDoubleClick?.(600);
    const startWorld = toWorld(cand.current.sx, cand.current.sy);
    const offset = {
      dx: thisAtom.x - startWorld.x,
      dy: thisAtom.y - startWorld.y,
    };
    let moveFree = false;
    const restartHold = () => {
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        moveFree = true;
        setMoveMode("free");
      }, FREE_MS) as unknown as number;
    };
    // The atom is not moved until it is dropped: MovePreview2D works out
    // where it snaps to while it is dragged, and the drawing lays it out
    // there.
    const p0 = toWorld(first.clientX, first.clientY);
    beginMoveDrag(thisAtom.id, { x: p0.x, y: p0.y });
    updateMovePointer(p0.x, p0.y);
    restartHold();
    const onMove = (ev: PointerEvent) => {
      if (!cand.current.active) return;
      const p = toWorld(ev.clientX, ev.clientY);
      updateMovePointer(p.x, p.y);
      restartHold();
    };
    const onUp = (ev: PointerEvent) => {
      clearHold();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      resetCand();
      endedByInteractive.current = true;
      suppressDoubleClick?.(480);
      try {
        const pEnd = toWorld(ev.clientX, ev.clientY);
        // Dropped straight onto another atom: it becomes that atom.
        const onto = findAtomNear(
          pEnd.x,
          pEnd.y,
          NOMINAL_BOND_LENGTH * 0.4,
          thisAtom.id,
        );
        if (onto != null) {
          replaceDraggedAtomWith(thisAtom.id, onto);
        } else {
          const nbrs: number[] = [];
          for (const b of model.bonds) {
            if (b.a === thisAtom.id) nbrs.push(b.b);
            else if (b.b === thisAtom.id) nbrs.push(b.a);
          }
          const L = NOMINAL_BOND_LENGTH;
          const step = Math.PI / 6;
          const only =
            nbrs.length === 1
              ? model.atoms.find((aa) => aa.id === nbrs[0]) || null
              : null;
          let finalX = pEnd.x + offset.dx;
          let finalY = pEnd.y + offset.dy;
          if (moveFree) {
            // Free: exactly at the pointer, as the preview shows it
            finalX = pEnd.x;
            finalY = pEnd.y;
          } else if (only) {
            const ang = Math.atan2(pEnd.y - only.y, pEnd.x - only.x);
            const snap = Math.round(ang / step) * step;
            finalX = only.x + L * Math.cos(snap);
            finalY = only.y + L * Math.sin(snap);
          } else if (nbrs.length >= 2) {
            const snap = computeMoveSnap(model as any, thisAtom.id, {
              x: pEnd.x,
              y: pEnd.y,
            });
            if (snap && Number.isFinite(snap.px) && Number.isFinite(snap.py)) {
              finalX = snap.px;
              finalY = snap.py;
            }
          }
          const hitId = findAtomNear(
            finalX,
            finalY,
            NOMINAL_BOND_LENGTH * 0.4,
            thisAtom.id,
          );
          if (hitId != null) replaceDraggedAtomWith(thisAtom.id, hitId);
          else moveAtom(thisAtom.id, finalX, finalY);
        }
      } catch {}
      endMoveDrag();
      endPanHold(ev.pointerId ?? pid);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /**
   * The selection moved together, dragged by one of its atoms: by as much as
   * the pointer goes, off the grid, as one undo step.
   */
  const selectionMoveGesture = (pid: number | null) => {
    cand.current.started = true;
    suppressDoubleClick?.(600);
    dragSelection(store, toWorld, { x: cand.current.sx, y: cand.current.sy }, (ev) => {
      resetCand();
      endedByInteractive.current = true;
      suppressDoubleClick?.(480);
      endPanHold(ev.pointerId ?? pid);
    });
  };

  const countCap = Math.max(model.atoms.length, 1);
  const remountKey = model.atoms.length;

  // Initial placement and when model changes
  useEffect(() => {
    if (!inst.current) return;
    const atoms = model.atoms;
    inst.current.count = atoms.length;
    const rWorld = ATOM_PICK_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      // Nudge z slightly forward (z=+1e-3) to prioritize atom raycasting over bond hit areas
      tmpM.makeScale(rWorld, rWorld, 1).setPosition(a.x, a.y, 1e-3);
      inst.current.setMatrixAt(i, tmpM);
    }
    commitInstanceMatrices(inst.current);
  }, [model.atoms, model.bonds, tmpM]);

  return (
    <instancedMesh
      ref={inst}
      key={remountKey}
      args={[undefined as any, undefined as any, countCap]}
      onPointerDown={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const a = model.atoms[idx];
        if (!a) return;
        setHoveredFromId(a.id);
        const now = performance.now();
        const btn = (e as any).nativeEvent?.button;
        // Only the main button works an atom; the other opens its menu.
        if (btn != null && btn !== 0) return;
        const cx = (e as any).nativeEvent?.clientX ?? (e as any).clientX;
        const cy = (e as any).nativeEvent?.clientY ?? (e as any).clientY;
        const pid =
          (e as any).nativeEvent?.pointerId ?? (e as any).pointerId ?? null;
        // Ctrl (⌘) and a click adds the atom to the selection or takes it
        // out; Shift and a click, everything along the bonds to it.
        const native = (e as any).nativeEvent as PointerEvent | undefined;
        if (native && (addsToSelection(native) || native.shiftKey)) {
          (e as any).stopPropagation?.();
          cancelPendingEdit();
          forgetPresses();
          if (native.shiftKey) selectPathTo(a.id);
          else toggleAtomSel(a.id);
          return;
        }
        const DBL_MS = DOUBLE_CLICK_MS;
        const again = lastDown.current.id === a.id && now - lastDown.current.t <= DBL_MS;
        const count = again ? lastDown.current.count + 1 : 1;
        const second = count === 2;
        cand.current = {
          active: true,
          atomId: a.id,
          started: false,
          sx: cx,
          sy: cy,
          lastx: cx,
          lasty: cy,
        };
        endedByInteractive.current = false;
        // the drag is the atom's, not the view's
        beginPanHold(pid);
        if (count >= 3) {
          // Three clicks draw a chain out of the atom, on its honeycomb
          // (utils/chain): led by a drag, or - the third click let go where
          // it was - traced with the button up, until a click ends it. The
          // bond the double-click drew is taken back for it.
          cancelPendingEdit();
          forgetPresses();
          store.getState().takeBackDoubleClickBond(a.id);
          strokeGesture(a.id, "chain", pid, () => {
            startExtend(a.id, "chain", true);
            endedByInteractive.current = true;
          });
          return;
        }
        if (second) {
          // A double-click that drags draws a bond out of the atom, where it
          // is led; a pause lets it go where the pointer is. One that does
          // not drag draws one bond where there is room (the canvas's
          // double-click does that). (Chains, a bond laid down for every
          // bond length the pointer goes, are not drawn this way for now:
          // utils/stroke still knows them.)
          cancelPendingEdit();
          // (a third click may follow)
          lastDown.current = { t: now, id: a.id, x: cx, y: cy, count: 2 };
          strokeGesture(a.id, "bond", pid, (ev) => {
            // Tap-connect: released without a drag beside another atom
            const p = toWorld(ev.clientX, ev.clientY);
            const near = findAtomNear(
              p.x,
              p.y,
              NOMINAL_BOND_LENGTH * 0.4,
              a.id,
            );
            if (near != null) {
              connectAtoms(a.id, near, 1);
              endedByInteractive.current = true;
              suppressDoubleClick?.(160);
            }
          });
          return;
        }
        lastDown.current = { t: now, id: a.id, x: cx, y: cy, count: 1 };
        // A drag moves the atom - or, the atom selected with others, the
        // selection; a click edits its label. Held still, the press selects
        // the whole structure, the selection spreading out from the atom as
        // it is held (HoldProgress2D); a drag from there moves it.
        let held = false;
        store.getState().setPressHold({ atomId: a.id, start: now });
        const hold = window.setTimeout(() => {
          if (!cand.current.active || cand.current.started) return;
          held = true;
          cancelPendingEdit();
          forgetPresses();
          // (the structure alone: what else was selected let go, as a hold on words or a shape does)
          store.getState().clearSel();
          store.getState().selectStructure(a.id);
          store.getState().setPressHold(null);
        }, LONG_PRESS_MS);
        const letGo = () => {
          window.clearTimeout(hold);
          store.getState().setPressHold(null);
        };
        const onFirstMove = (ev: PointerEvent) => {
          if (!cand.current.active || cand.current.started) return;
          if (Math.hypot(ev.clientX - cx, ev.clientY - cy) < MOV_PX) return;
          window.removeEventListener("pointermove", onFirstMove);
          window.removeEventListener("pointerup", onEarlyUp, true);
          letGo();
          cancelPendingEdit();
          // a drag is not the first click of a double-click
          forgetPresses();
          const st = store.getState();
          const withSelection = held || (st.sel.atoms.has(a.id) && st.sel.atoms.size > 1);
          if (withSelection) selectionMoveGesture(pid);
          else moveGesture(idx, ev, pid);
        };
        const onEarlyUp = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", onFirstMove);
          window.removeEventListener("pointerup", onEarlyUp, true);
          letGo();
          resetCand();
          endPanHold(ev.pointerId ?? null);
          // (a long press: the structure is selected, and that is all)
          if (held) {
            suppressDoubleClick?.(DOUBLE_CLICK_MS);
            return;
          }
          // A click: its label is edited, unless a second click follows -
          // then onPointerDown cancels this.
          cancelPendingEdit();
          pendingEdit.current.atomId = a.id;
          // (unless it turns out to be the second click of a double-click,
          // as the system reckons one, which draws a bond instead)
          const since = clickClock();
          pendingEdit.current.tid = window.setTimeout(() => {
            if (pendingEdit.current.atomId === a.id && !doubleClickedSince(since)) beginLabelEdit(a.id);
            cancelPendingEdit();
          }, EDIT_DELAY_MS) as unknown as number;
        };
        window.addEventListener("pointermove", onFirstMove);
        window.addEventListener("pointerup", onEarlyUp, true);
      }}
      onDoubleClick={(e) => {
        // Suppress Canvas dblclick if we just did interactive commit
        if (endedByInteractive.current) {
          (e as any).stopPropagation?.();
          endedByInteractive.current = false;
        }
        // On double-click, cancel any pending single-click edit
        cancelPendingEdit();
      }}
      onPointerMove={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const a = model.atoms[idx];
        if (a) {
          setHoveredFromId(a.id);
          // Stop propagation so atoms don’t override lower-layer (bond) hits
          (e as any).stopPropagation?.();
        }
      }}
      onPointerOut={() => {
        // Only clear atom hover; keep bond hover if present
        clearAtomHover();
      }}
      onClick={() => {
        // Do nothing here since beginLabelEdit is triggered immediately in onPointerUp
        // Avoid double execution via default browser click propagation
        return;
      }}
    >
      <circleGeometry args={[1, 48]} />
      {/* In 2D we don’t fill atoms (keep them transparent). Only keep the hit area for events. */}
      {/* (not drawn at all, then - a pointer still finds it: picking does not
          ask whether a material is drawn - so that a drawing of thousands
          of atoms is not painted over with as many unseen discs every frame) */}
      <meshBasicMaterial
        visible={false}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        color={"white"}
      />
    </instancedMesh>
  );
}
