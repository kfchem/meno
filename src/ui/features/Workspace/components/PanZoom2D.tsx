import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FRAME_ORDER, pageAt } from "../utils/page";
import { isPinch, wheelReader, zoomTaken } from "../../../../lib/input/wheel";
import { useEditor, useEditorStore } from "../store";
import { letViewGoalGo, viewDriven, viewGoalOf } from "./viewGoal";
import { TAU, follow } from "../../../theme/motion";
import { glideSpeed, recentMoves, type Move } from "../../../../lib/input/glide";
import { stillPointer, viewMoved, type View } from "../../../../lib/input/stillPointer";
import { useAppSettings } from "../../../../lib/settings/appSettings";

/** WebKit's pinch on a trackpad, which it gives as gestures, not wheels. */
type GestureLike = Event & { scale: number; clientX: number; clientY: number };

/** Zoom limits, and how far a pinch's Ctrl-wheel step zooms. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 300;
const PINCH_PER_PX = 0.01;
/** The least a wheel's step counts for when it zooms, in px: a plain wheel's line. */
const NOTCH_MIN_PX = 40;
/**
 * How far a wheel's step zooms, by ratio, per px of it - all of it, however
 * long the view had been still and however often frames come: a 100 px
 * notch zooms by 17 % - and the most a burst of steps has left to zoom at
 * once (by 2.2 times). It is gone over in a short glide, ZOOM_RATE of what
 * is left a second.
 */
const ZOOM_PER_PX = 0.0016;
const ZOOM_LEFT_MOST = 0.78;
const ZOOM_RATE = 10;
/**
 * A drag let go while still moving glides on: as fast as it went over the
 * last RECENT_MS, slowing by GLIDE_FRICTION a second - unless it was held
 * still for HELD_MS before the release, when it stays where it is.
 */
const RECENT_MS = 64;
const HELD_MS = 80;
const GLIDE_FRICTION = 4;
/**
 * A pinch let go while still zooming goes on zooming likewise, slowing by
 * ZOOM_FRICTION a second, at most ZOOM_GLIDE_MOST a second (by the log of
 * the ratio). Chromium's pinch, as the wheel with Ctrl, has no end of its
 * own: it ends once no step has come for PINCH_END_MS.
 */
const ZOOM_FRICTION = 5;
const ZOOM_GLIDE_MOST = 4;
const PINCH_END_MS = 80;

export function PanZoom2D() {
  const { camera, gl, invalidate, events } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  const { extend } = useEditor();
  const fitNonce = useEditor((s) => s.fitNonce);
  const store = useEditorStore();
  const extendRef = useRef(extend.active);
  // Keep pan-hold state in a ref to avoid stale closures during event sequence
  const panHoldRef = useRef(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const lastDownAt = useRef(0);
  const dblHold = useRef<{ active: boolean; id: number | null }>({
    active: false,
    id: null,
  });
  const maybe = useRef<{
    active: boolean;
    x: number;
    y: number;
    id: number | null;
  }>({ active: false, x: 0, y: 0, id: null });
  const pos = useRef(
    new THREE.Vector2((camera as any).position.x, (camera as any).position.y)
  );
  // how fast the view glides on after a drag, in world units a second; and the drag's latest moves
  const vel = useRef(new THREE.Vector2(0, 0));
  const recent = useRef<{ t: number; dx: number; dy: number }[]>([]);
  // how far the wheel has yet to zoom, by the log of the ratio
  const zoomLeft = useRef(0);
  // how fast a pinch let go goes on zooming, by the log of the ratio a second; and the pinch's latest steps
  const zoomGlide = useRef(0);
  const pinchSteps = useRef<Move[]>([]);
  const anchor = useRef({ cx: 0, cy: 0 });
  // where the pointer rests over the canvas; the view as last drawn; and
  // whether what is under the pointer is to be found again, the view having
  // moved under it
  const pointer = useRef(stillPointer());
  const seenView = useRef<View | null>(null);
  const findAgain = useRef(false);
  // (the camera's zoom: CSS pixels per world unit on the page, whether it is
  // orthographic - the canvas's - or in perspective, as PageCamera keeps it)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // (a talk given has the view: presenting/Presenter)
      if (viewDriven(camera)) return;
      // (the user takes the view: a fit on its way gives way, and a pinch's glide)
      letViewGoalGo(camera);
      zoomGlide.current = 0;
      // disable pan during bond extension or on a double-click down
      if (extendRef.current) return;
      const btn = (e as any).button;
      // Pressing on an atom with the main button starts a move, not a pan;
      // the other buttons move the view from anywhere. Atom hit-testing is
      // done by the canvas wrapper (hovered.atomId), which does not depend on
      // the 3D raycast, so this also holds if the raycast misses the atom.
      const st = store.getState();
      if (st.moveDrag.active) return;
      if (btn === 0 && st.hovered.atomId != null) return;
      // nor on a molecule in 3D: that turns it, or on its frame's edge moves it
      if (btn === 0 && st.hovered3d != null) return;
      // Block pan initiation while panHold is active (e.g., dblclick direction gesture)
      if (btn === 0 && panHoldRef.current) return;
      const now =
        e.timeStamp ||
        (typeof performance !== "undefined" ? performance.now() : Date.now());
      const within120 = now - (lastDownAt.current || 0) <= 120;
      lastDownAt.current = now;
      // Treat as double-click-hold only when two downs occur within 120ms
      if (btn === 0 && within120) {
        dblHold.current = { active: true, id: e.pointerId };
        return;
      }
      dragging.current = false;
      maybe.current = {
        active: true,
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
      };
      last.current.x = e.clientX;
      last.current.y = e.clientY;
      vel.current.set(0, 0);
      recent.current = [];
    };
    const onMove = (e: PointerEvent) => {
      if (extendRef.current) {
        // If we enter extend mode, cancel any pending drag
        maybe.current.active = false;
        dragging.current = false;
        return;
      }
      // Skip pan while panHold is active
      if (panHoldRef.current) return;
      if (dblHold.current.active) return;
      // An atom drag started after the press: abandon the pan instead of
      // moving the whole view along with the atom.
      if (store.getState().moveDrag.active) {
        maybe.current.active = false;
        dragging.current = false;
        return;
      }
      if (!dragging.current) {
        if (!maybe.current.active) return;
        const dx0 = e.clientX - maybe.current.x;
        const dy0 = e.clientY - maybe.current.y;
        const dist2 = dx0 * dx0 + dy0 * dy0;
        const THRESH2 = 3 * 3; // 3px threshold
        if (dist2 < THRESH2) return;
        // Engage dragging now
        dragging.current = true;
        try {
          dom.setPointerCapture(maybe.current.id ?? e.pointerId);
        } catch {}
      }
      const cz = (camera as any).zoom || 1;
      const dx = (e.clientX - last.current.x) / cz;
      const dy = (e.clientY - last.current.y) / cz;
      pos.current.x -= dx;
      pos.current.y += dy;
      recent.current = [...recent.current, { t: e.timeStamp, dx: -dx, dy }].filter((r) => e.timeStamp - r.t <= RECENT_MS);
      last.current.x = e.clientX;
      last.current.y = e.clientY;
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      if (dragging.current) {
        // let go while moving, it glides on as fast as it was going; held
        // still first, it stays
        const moves = recent.current;
        const latest = moves.length ? moves[moves.length - 1].t : -Infinity;
        if (e.timeStamp - latest > HELD_MS || moves.length < 2) vel.current.set(0, 0);
        else {
          const took = Math.max((latest - moves[0].t) / 1000, 1 / 60);
          const sum = moves.slice(1).reduce((a, r) => ({ x: a.x + r.dx, y: a.y + r.dy }), { x: 0, y: 0 });
          vel.current.set(sum.x / took, sum.y / took);
        }
        recent.current = [];
        // (what the drag brought under the pointer is found once it is let go)
        findAgain.current = true;
        invalidate();
      }
      dragging.current = false;
      maybe.current.active = false;
      if (
        dblHold.current.active &&
        (dblHold.current.id === null || dblHold.current.id === e.pointerId)
      ) {
        dblHold.current = { active: false, id: null };
      }
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {}
    };
    // The view zoomed at once by `factor`, keeping the point under the
    // pointer where it is - a pinch's step, kept to glide on from.
    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      const now = performance.now();
      pinchSteps.current = [...recentMoves(pinchSteps.current, now, RECENT_MS), { t: now, d: Math.log(factor) }];
      zoomGlide.current = 0;
      const cam = camera as THREE.OrthographicCamera;
      const rect = dom.getBoundingClientRect();
      const v = new THREE.Vector3(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
        0,
      );
      const before = pageAt(v.x, v.y, cam);
      cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
      cam.updateProjectionMatrix();
      const after = pageAt(v.x, v.y, cam);
      pos.current.x += before.x - after.x;
      pos.current.y += before.y - after.y;
      vel.current.set(0, 0);
      zoomLeft.current = 0;
      anchor.current.cx = v.x;
      anchor.current.cy = v.y;
      invalidate();
    };
    // A pinch let go: on it zooms, as fast as it was zooming, and slows.
    const pinchLetGo = () => {
      const speed = glideSpeed(pinchSteps.current, performance.now(), HELD_MS);
      zoomGlide.current = Math.max(-ZOOM_GLIDE_MOST, Math.min(ZOOM_GLIDE_MOST, speed));
      pinchSteps.current = [];
      invalidate();
    };
    let pinchEnd: number | null = null;
    // A pinch in WebKit: gestures, while they last, rather than wheels.
    let pinch: number | null = null;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      letViewGoalGo(camera);
      zoomGlide.current = 0;
      pinchSteps.current = [];
      pinch = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureLike;
      if (pinch === null || !(g.scale > 0)) return;
      zoomAt(g.scale / pinch, g.clientX, g.clientY);
      pinch = g.scale;
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      pinch = null;
      pinchLetGo();
    };
    const readWheel = wheelReader();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (viewDriven(camera)) return;
      letViewGoalGo(camera);
      if (pinch !== null) return; // the gesture has it
      const cz = (camera as any).zoom || 1;
      if (readWheel(e) === "pan") {
        // two fingers on a trackpad move the view, the way they scroll a page
        pos.current.x += e.deltaX / cz;
        pos.current.y -= e.deltaY / cz;
        vel.current.set(0, 0);
        zoomGlide.current = 0;
        invalidate();
        return;
      }
      if (isPinch(e)) {
        // a pinch in Chromium: small steps, followed as they come (Ctrl with
        // a mouse's notch goes on below, and zooms as the wheel does) - let
        // go once they stop coming
        zoomAt(Math.exp(-e.deltaY * PINCH_PER_PX), e.clientX, e.clientY);
        if (pinchEnd != null) window.clearTimeout(pinchEnd);
        pinchEnd = window.setTimeout(() => {
          pinchEnd = null;
          pinchLetGo();
        }, PINCH_END_MS);
        return;
      }
      zoomGlide.current = 0;
      // (a notch zooms at least as far as a plain wheel's line of 40 px
      // does: a smoothly scrolling mouse's notch is only 13 px)
      // (upwards, in - or out, where Settings says so)
      const way = useAppSettings.getState().pointer.wheelUp === "out" ? -1 : 1;
      const step = way * Math.sign(e.deltaY) * Math.max(Math.abs(e.deltaY), NOTCH_MIN_PX);
      zoomLeft.current = Math.max(-ZOOM_LEFT_MOST, Math.min(ZOOM_LEFT_MOST, zoomLeft.current - step * ZOOM_PER_PX));
      const rect = dom.getBoundingClientRect();
      anchor.current.cx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      anchor.current.cy = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      invalidate();
    };

    // (heard first, so the pointer is known to rest before a frame finds again)
    const heard = (e: PointerEvent) => {
      if (e.isTrusted) pointer.current.heard(e);
    };
    const HEARD = ["pointermove", "pointerdown", "pointerup", "pointerleave", "pointercancel"] as const;
    for (const name of HEARD) dom.addEventListener(name, heard);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    // (the wheel and a pinch over what is laid on the canvas - a molecule's
    // frames chip, its note - zoom as over the canvas: they are heard on
    // the box the canvas's events are, where drei's Html lays those)
    const box = events.connected instanceof HTMLElement ? events.connected : dom;
    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("gesturestart", onGestureStart);
    box.addEventListener("gesturechange", onGestureChange);
    box.addEventListener("gestureend", onGestureEnd);
    return () => {
      if (pinchEnd != null) window.clearTimeout(pinchEnd);
      for (const name of HEARD) dom.removeEventListener(name, heard);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("gesturestart", onGestureStart);
      box.removeEventListener("gesturechange", onGestureChange);
      box.removeEventListener("gestureend", onGestureEnd);
    };
  }, [camera, gl, invalidate, dom, extend.active, store, events.connected]);

  // When camera is updated externally (e.g., FitToContent2D), mirror it internally to avoid overrides
  useEffect(() => {
    const cam = camera as any;
    pos.current.set(cam.position.x, cam.position.y);
    vel.current.set(0, 0);
    zoomLeft.current = 0;
    // Force a render on the next frame
    try {
      invalidate();
    } catch {}
  }, [camera, fitNonce, invalidate]);

  // If extension starts while dragging, cancel panning immediately
  useEffect(() => {
    // Keep a synchronous ref via zustand subscribe to avoid event timing issues
    const unsub = store.subscribe((s) => {
      extendRef.current = s.extend.active;
      if (s.extend.active) dragging.current = false;
    });
    return () => unsub();
  }, [store]);

  // Subscribe to panHold changes to keep ref in sync (used by DOM listeners)
  useEffect(() => {
    const unsub = store.subscribe((s) => {
      panHoldRef.current = !!s.panHold.active;
    });
    return () => unsub();
  }, [store]);

  // (a talk given: the view is its own, taken up again from where it left it)
  const drivenBefore = useRef(false);
  useFrame((_, dt) => {
    const cam = camera as any;
    if (viewDriven(camera)) {
      drivenBefore.current = true;
      return;
    }
    if (drivenBefore.current) {
      drivenBefore.current = false;
      pos.current.set(cam.position.x, cam.position.y);
      vel.current.set(0, 0);
      zoomLeft.current = 0;
      zoomGlide.current = 0;
    }
    // The view moved last frame under a pointer resting on it: what is under
    // the pointer now is lit, and taken hold of by a press, as a move of no
    // distance finds it - drawn as it was moved to, so the hit areas are too.
    if (findAgain.current) {
      findAgain.current = false;
      const at = pointer.current.resting();
      if (at) dom.dispatchEvent(new PointerEvent("pointermove", { ...at, pointerType: "mouse", bubbles: true, cancelable: true }));
    }
    // a fit on its way: the view going there - its zoom by ratio, so a large
    // change takes no longer than a small one
    const goal = viewGoalOf(camera);
    if (goal && !dragging.current) {
      const d = Math.min(dt, 1 / 20);
      const zoom = Math.exp(follow(Math.log(cam.zoom || 1), Math.log(goal.zoom), d, TAU.move));
      const x = follow(pos.current.x, goal.x, d, TAU.move);
      const y = follow(pos.current.y, goal.y, d, TAU.move);
      const there = Math.abs(Math.log(zoom / goal.zoom)) < 1e-3 && Math.hypot(goal.x - x, goal.y - y) * zoom < 0.25;
      cam.zoom = there ? goal.zoom : zoom;
      cam.updateProjectionMatrix?.();
      pos.current.set(there ? goal.x : x, there ? goal.y : y);
      vel.current.set(0, 0);
      zoomLeft.current = 0;
      if (there) letViewGoalGo(camera);
      invalidate();
    }
    // inertial pan
    if (!dragging.current) {
      // (a frame long in coming moves it no further than a short one)
      const step = Math.min(dt, 1 / 30);
      vel.current.multiplyScalar(Math.exp(-GLIDE_FRICTION * step));
      if (vel.current.lengthSq() > 1e-4) pos.current.addScaledVector(vel.current, step);
      else vel.current.set(0, 0);
    }
    cam.position.x = pos.current.x;
    cam.position.y = pos.current.y;

    // the wheel's zoom, about where the pointer was: a share of what is left
    // each frame (a frame long in coming no more than a short one's worth)
    if (Math.abs(zoomLeft.current) > 1e-4) {
      const old = cam.zoom || 1;
      const take = zoomTaken(zoomLeft.current, dt, ZOOM_RATE);
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, old * Math.exp(take)));
      // Keep cursor-anchored world point stable using unproject
      const cx = anchor.current.cx;
      const cy = anchor.current.cy;
      const v = new THREE.Vector3(cx, cy, 0);
      const before = pageAt(v.x, v.y, cam);
      cam.zoom = next;
      cam.updateProjectionMatrix?.();
      const after = pageAt(v.x, v.y, cam);
      cam.position.x += before.x - after.x;
      cam.position.y += before.y - after.y;
      pos.current.set(cam.position.x, cam.position.y);
      // (at a limit, the rest goes)
      zoomLeft.current = next === old * Math.exp(take) ? zoomLeft.current - take : 0;
    }

    // a pinch let go, zooming on about where it was, slowing; at a limit, it stops
    if (zoomGlide.current !== 0) {
      const step = Math.min(dt, 1 / 30);
      zoomGlide.current *= Math.exp(-ZOOM_FRICTION * step);
      const take = zoomGlide.current * step;
      const old = cam.zoom || 1;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, old * Math.exp(take)));
      const v = new THREE.Vector3(anchor.current.cx, anchor.current.cy, 0);
      const before = pageAt(v.x, v.y, cam);
      cam.zoom = next;
      cam.updateProjectionMatrix?.();
      const after = pageAt(v.x, v.y, cam);
      cam.position.x += before.x - after.x;
      cam.position.y += before.y - after.y;
      pos.current.set(cam.position.x, cam.position.y);
      if (Math.abs(zoomGlide.current) < 0.02 || next !== old * Math.exp(take)) zoomGlide.current = 0;
    }

    const view = { x: cam.position.x, y: cam.position.y, zoom: cam.zoom || 1 };
    if (viewMoved(seenView.current, view)) {
      findAgain.current = true;
      invalidate();
    }
    seenView.current = view;

    // On-demand rendering: request the next frame while the camera is still
    // moving, otherwise dragging and inertia would stop after one frame.
    if (
      dragging.current ||
      vel.current.lengthSq() > 1e-8 ||
      Math.abs(zoomLeft.current) > 1e-4 ||
      zoomGlide.current !== 0
    ) {
      invalidate();
    }
  }, FRAME_ORDER.camera);
  return null;
}
