import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { pressMovedUnder } from "./viewGoal";
import { useEditor, useEditorStore } from "../store";
import { dragSelection } from "../utils/dragSelection";
import { onChord } from "../utils/press";
import { dragsSelection } from "../store/slices/selectionSlice";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { computeMoveSnap } from "../utils/moveSnap";
import { ATOM_PICK_RADIUS_RATIO, DOUBLE_CLICK_MS, FREE_MS, LONG_PRESS_MS, MOV_PX } from "../constants";
import { clickClock, clickEditHeldOff, clickStillEdits, pressNumber } from "../utils/clickCount";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { commitInstanceMatrices } from "./instances";
import { useDrawnLayout } from "./drawnLayoutContext";
import { labelReach } from "../workflow/selectionSet";
import { setLabelReach } from "../utils/labelHits";
import { bondLengthFrom } from "../utils/magnified";

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
   * another atom, it becomes that atom. Escape lets it go, where it was.
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
    let letGo = false;
    const onMove = (ev: PointerEvent) => {
      if (!cand.current.active || letGo) return;
      const p = toWorld(ev.clientX, ev.clientY);
      updateMovePointer(p.x, p.y);
      restartHold();
    };
    // (the button's release still ends the press: nothing is moved then)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      letGo = true;
      clearHold();
      window.removeEventListener("keydown", onKey, true);
      endMoveDrag();
    };
    const onUp = (ev: PointerEvent) => {
      clearHold();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      resetCand();
      endedByInteractive.current = true;
      suppressDoubleClick?.(480);
      if (letGo) {
        endPanHold(ev.pointerId ?? pid);
        return;
      }
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
          // (as long as the bonds of its structure are shown)
          const L = bondLengthFrom(model.atoms, thisAtom.id);
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
    window.addEventListener("keydown", onKey, true);
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
  // (an atom the same object as before is where it was: at every frame of a
  // drag, all but the few that moved)
  const placed = useRef<{ mesh: THREE.InstancedMesh | null; atoms: unknown[] }>({ mesh: null, atoms: [] });
  useEffect(() => {
    if (!inst.current) return;
    const atoms = model.atoms;
    inst.current.count = atoms.length;
    const rWorld = ATOM_PICK_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    if (placed.current.mesh !== inst.current) placed.current = { mesh: inst.current, atoms: [] };
    const was = placed.current.atoms;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      if (was[i] === a) continue;
      was[i] = a;
      // Nudge z slightly forward (z=+1e-3) to prioritize atom raycasting over bond hit areas
      tmpM.makeScale(rWorld, rWorld, 1).setPosition(a.x, a.y, 1e-3);
      inst.current.setMatrixAt(i, tmpM);
    }
    commitInstanceMatrices(inst.current);
  }, [model.atoms, model.bonds, tmpM]);

  // A label's other letters are its atom (utils/labelHits): each label's box
  // a hit area of its atom's, over the drawing's other hit areas as the
  // atoms' are - and where they reach, for the canvas's own hover
  const { layout, atoms: laid, opts } = useDrawnLayout();
  const reach = useMemo(() => labelReach(layout, laid, opts), [layout, laid, opts]);
  useEffect(() => setLabelReach(store, reach), [store, reach]);
  const labelled = useMemo(() => {
    const at = new Map(model.atoms.map((a, i) => [a.id, i]));
    return [...reach].flatMap(([id, f]) => (at.has(id) ? [{ idx: at.get(id)!, f }] : []));
  }, [reach, model.atoms]);
  const labels = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const m = labels.current;
    if (!m) return;
    m.count = labelled.length;
    labelled.forEach(({ f }, i) => {
      tmpM.makeScale(f.x1 - f.x0, f.y1 - f.y0, 1).setPosition((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, 1e-3);
      m.setMatrixAt(i, tmpM);
    });
    commitInstanceMatrices(m);
  }, [labelled, tmpM]);

  // (what a press, a move or a double-click on an atom does: on its disc, or on its
  // label's other letters - the H of HO is the O - `indexOf` taking what was hit to the atom's index)
  const atomEvents = (indexOf: (hit: number | undefined) => number | undefined) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      const idx = indexOf((e as any).instanceId as number | undefined);
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
      // (a third click is a click like the first: a double-click is two, and a press after it starts again)
      const count = pressNumber(lastDown.current, a.id, now, DBL_MS);
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
        // (nor where the view has moved under the press: viewGoal)
        if (!cand.current.active || cand.current.started || pressMovedUnder(camera)) return;
        held = true;
        cancelPendingEdit();
        forgetPresses();
        // (the structure alone: what else was selected let go, as a hold on words or a shape does)
        store.getState().clearSel();
        store.getState().selectStructure(a.id);
        store.getState().setPressHold(null);
      }, LONG_PRESS_MS);
      // (another button pressed with it: no press at all - utils/press#onChord)
      let chorded = false;
      const offChord = onChord(1, () => {
        chorded = true;
        letGo();
        cancelPendingEdit();
        forgetPresses();
      });
      const letGo = () => {
        window.clearTimeout(hold);
        offChord();
        store.getState().setPressHold(null);
      };
      const onFirstMove = (ev: PointerEvent) => {
        if (chorded || !cand.current.active || cand.current.started) return;
        if (Math.hypot(ev.clientX - cx, ev.clientY - cy) < MOV_PX) return;
        window.removeEventListener("pointermove", onFirstMove);
        window.removeEventListener("pointerup", onEarlyUp, true);
        letGo();
        cancelPendingEdit();
        // a drag is not the first click of a double-click
        forgetPresses();
        const st = store.getState();
        const withSelection = held || dragsSelection(st, a.id);
        if (withSelection) selectionMoveGesture(pid);
        else moveGesture(idx, ev, pid);
      };
      const onEarlyUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onFirstMove);
        window.removeEventListener("pointerup", onEarlyUp, true);
        letGo();
        resetCand();
        endPanHold(ev.pointerId ?? null);
        // (a long press: the structure is selected, and that is all - and a chord, nothing)
        if (held || chorded) {
          suppressDoubleClick?.(DOUBLE_CLICK_MS);
          return;
        }
        // (the view moved under the press: the atom is no longer under the pointer - no click)
        if (pressMovedUnder(camera)) {
          forgetPresses();
          return;
        }
        // A click: its label is edited, unless a second click follows -
        // then onPointerDown cancels this.
        cancelPendingEdit();
        pendingEdit.current.atomId = a.id;
        // (unless it turns out to be the second click of a double-click,
        // as the system reckons one, which draws a bond instead - or
        // something else is begun before then: a press elsewhere, to move
        // the view, say, or a label typed over another atom)
        const since = clickClock();
        pendingEdit.current.tid = window.setTimeout(() => {
          if (pendingEdit.current.atomId === a.id && clickStillEdits(since) && !clickEditHeldOff(store.getState())) beginLabelEdit(a.id);
          cancelPendingEdit();
        }, EDIT_DELAY_MS) as unknown as number;
      };
      window.addEventListener("pointermove", onFirstMove);
      window.addEventListener("pointerup", onEarlyUp, true);
    },
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => {
      // Suppress Canvas dblclick if we just did interactive commit
      if (endedByInteractive.current) {
        (e as any).stopPropagation?.();
        endedByInteractive.current = false;
      }
      // On double-click, cancel any pending single-click edit
      cancelPendingEdit();
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const idx = indexOf((e as any).instanceId as number | undefined);
      if (idx == null || idx < 0) return;
      const a = model.atoms[idx];
      if (a) {
        setHoveredFromId(a.id);
        // Stop propagation so atoms don’t override lower-layer (bond) hits
        (e as any).stopPropagation?.();
      }
    },
    onPointerOut: () => {
      // Only clear atom hover; keep bond hover if present
      clearAtomHover();
    },
    onClick: () => {
      // Do nothing here since beginLabelEdit is triggered immediately in onPointerUp
      // Avoid double execution via default browser click propagation
      return;
    },
  });

  return (
    <>
    <instancedMesh
      ref={inst}
      key={remountKey}
      args={[undefined as any, undefined as any, countCap]}
      {...atomEvents((hit) => hit)}
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
    <instancedMesh
      ref={labels}
      key={`labels-${labelled.length}`}
      args={[undefined as any, undefined as any, Math.max(labelled.length, 1)]}
      {...atomEvents((hit) => (hit == null ? undefined : labelled[hit]?.idx))}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial visible={false} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    </>
  );
}
