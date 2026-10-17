import { useContext, useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FRAME_ORDER, pageAt } from "../utils/page";
import { isPinch, scrollsAlong, wheelReader, zoomTaken } from "../../../../lib/input/wheel";
import { useEditor, useEditorStore } from "../store";
import { setViewPanning, letViewGoalGo, pressMovedUnder, setPressMovedUnder, tookMovedUnderPointer, tookViewRelaid, viewDriven, viewGoalOf } from "./viewGoal";
import { PageHtmlLayer } from "./coverLayer";
import { TAU, follow } from "../../../theme/motion";
import { glideSpeed, recentMoves, type Move } from "../../../../lib/input/glide";
import { fingersStep, makesPinch, pinchedView, type Pt } from "../../../../lib/input/pinch";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { gestureUnderWay } from "../store/gesture";
import { movedUnderPress, stillPointer, viewMoved, type View } from "../../../../lib/input/stillPointer";
import { MOV_PX } from "../constants";
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
  // (the layer what is on the page in HTML is laid in: coverLayer)
  const layer = useContext(PageHtmlLayer);
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
  // where the pointer rests over the canvas, and whether something has moved
  // under it; and the view as last drawn
  const pointer = useRef(stillPointer());
  // (a timer for a finding under the still pointer put off: stillPointer `wait`)
  const findLater = useRef(0);
  useEffect(() => () => window.clearTimeout(findLater.current), []);
  const seenView = useRef<View | null>(null);
  // the page point a press held now began on, to tell whether the view has moved under it
  const pressPage = useRef<{ x: number; y: number } | null>(null);
  // (the camera's zoom: CSS pixels per world unit on the page, whether it is
  // orthographic - the canvas's - or in perspective, as PageCamera keeps it)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // (a talk given has the view: presenting/Presenter)
      if (viewDriven(camera)) return;
      // (the user takes the view: a fit on its way gives way, and a pinch's
      // glide, and a drag's - whatever the press is on: an atom or a
      // molecule pressed stays under the pointer)
      letViewGoalGo(camera);
      zoomGlide.current = 0;
      vel.current.set(0, 0);
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
        setViewPanning(false);
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
        setViewPanning(false);
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
        setViewPanning(false);
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
        setViewPanning(true);
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
        pointer.current.moved();
        invalidate();
      }
      dragging.current = false;
        setViewPanning(false);
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
    // Two fingers on a touch screen: a pinch, as a trackpad's - zoomed about
    // the point between them, and moved as it moves (lib/input/pinch). A
    // second finger come down soon after the first, or before the first has
    // gone a bond's length, or while it moves the view, makes a pinch of it,
    // whatever the first came down on: what the first began is taken back
    // as if it had never been - no bond, no move, no selection - and both
    // are the pinch's alone. Otherwise the first goes on, and the second is
    // no press at all. (On a Mac a trackpad's pinch comes as gestures, above.)
    const touches = new Map<number, Pt>();
    let first: { id: number; at: Pt; t: number } | null = null;
    let fingers: { a: number; b: number } | null = null;
    const unheard = new Set<number>();
    const keep = (e: PointerEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const at = { x: e.clientX, y: e.clientY };
      if (touches.size === 0) {
        touches.set(e.pointerId, at);
        first = { id: e.pointerId, at, t: e.timeStamp };
        // (heard before the page hears the press: what it does can be taken back)
        store.getState().notePress();
        return;
      }
      keep(e);
      const st = store.getState();
      const panning = (maybe.current.active && maybe.current.id === first?.id) || dragging.current;
      const cam = camera as THREE.OrthographicCamera;
      const now = first ? touches.get(first.id) : undefined;
      const pinches =
        !fingers && touches.size === 1 && first && now && !st.inkMode && !viewDriven(camera) && makesPinch({ ...first, now }, e.timeStamp, NOMINAL_BOND_LENGTH * cam.zoom, panning);
      if (!pinches || !first) {
        unheard.add(e.pointerId);
        return;
      }
      // (what the first finger began let go of by its own Escape, as a gesture lost is, then taken back whole)
      if (gestureUnderWay(st)) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
      store.getState().takeBackPress();
      // (the first finger's pan given way to the pinch: no glide, no pan as well)
      maybe.current.active = false;
      dragging.current = false;
      vel.current.set(0, 0);
      recent.current = [];
      try {
        dom.releasePointerCapture(first.id);
      } catch {}
      letViewGoalGo(camera);
      zoomGlide.current = 0;
      pinchSteps.current = [];
      setViewPanning(true);
      setPressMovedUnder(camera, true);
      touches.set(e.pointerId, at);
      fingers = { a: first.id, b: e.pointerId };
      invalidate();
    };
    const onTouchMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (unheard.has(e.pointerId)) return keep(e);
      const was = touches.get(e.pointerId);
      if (!was) return;
      const at = { x: e.clientX, y: e.clientY };
      touches.set(e.pointerId, at);
      if (!fingers || (e.pointerId !== fingers.a && e.pointerId !== fingers.b)) return;
      keep(e);
      const other = touches.get(e.pointerId === fingers.a ? fingers.b : fingers.a)!;
      if (viewDriven(camera)) return;
      const cam = camera as THREE.OrthographicCamera;
      const r = dom.getBoundingClientRect();
      const next = pinchedView({ x: pos.current.x, y: pos.current.y, zoom: cam.zoom }, r, fingersStep(was, other, at, other), MIN_ZOOM, MAX_ZOOM);
      const t = performance.now();
      pinchSteps.current = [...recentMoves(pinchSteps.current, t, RECENT_MS), { t, d: Math.log(next.zoom / cam.zoom) }];
      cam.zoom = next.zoom;
      cam.updateProjectionMatrix();
      pos.current.set(next.x, next.y);
      zoomLeft.current = 0;
      invalidate();
    };
    const onTouchUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (unheard.delete(e.pointerId)) return keep(e);
      touches.delete(e.pointerId);
      if (first?.id === e.pointerId) first = null;
      if (!fingers || (e.pointerId !== fingers.a && e.pointerId !== fingers.b)) return;
      // (both fingers the pinch's to their end: the one left is no press either)
      keep(e);
      const left = e.pointerId === fingers.a ? fingers.b : fingers.a;
      touches.delete(left);
      unheard.add(left);
      first = null;
      fingers = null;
      setViewPanning(false);
      pointer.current.moved();
      pinchLetGo();
    };
    window.addEventListener("pointerdown", onTouchDown, true);
    window.addEventListener("pointermove", onTouchMove, true);
    window.addEventListener("pointerup", onTouchUp, true);
    window.addEventListener("pointercancel", onTouchUp, true);
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
    const pageUnder = (clientX: number, clientY: number) => {
      const r = dom.getBoundingClientRect();
      return pageAt(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1), camera);
    };
    // (a press the view moved under is no click: the click it ends in goes nowhere)
    const swallowClick = () => {
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
    const heard = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      if (pointer.current.heard(e)) invalidate();
      if (e.type === "pointerdown") {
        pressPage.current = pageUnder(e.clientX, e.clientY);
        setPressMovedUnder(camera, false);
      } else if (e.type === "pointerup" || e.type === "pointercancel") {
        pressPage.current = null;
        if (e.type === "pointerup" && pressMovedUnder(camera)) swallowClick();
      }
    };
    const HEARD = ["pointermove", "pointerdown", "pointerup", "pointerleave", "pointercancel"] as const;
    for (const name of HEARD) dom.addEventListener(name, heard);
    // (a pan lost - the pointer taken, its capture lost, the window left, the view gone: no pan any more, or undo would be taken for it)
    const lostPan = () => setViewPanning(false);
    dom.addEventListener("pointercancel", lostPan);
    dom.addEventListener("lostpointercapture", lostPan);
    window.addEventListener("blur", lostPan);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    // (the wheel and a pinch over what is laid on the canvas zoom as over
    // the canvas: they are heard on the box the canvas's events are, where
    // drei's Html lays what has no layer of its own)
    const box = events.connected instanceof HTMLElement ? events.connected : dom;
    // (no pan or zoom of the system's own from a touch or a pen over the page - which would take the pointers back as they go: the pinch
    // is the view's; what is laid on the page in its own layer keeps its own, so that a list there still scrolls under a finger)
    dom.style.touchAction = "none";
    box.style.touchAction = "none";
    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("gesturestart", onGestureStart);
    box.addEventListener("gesturechange", onGestureChange);
    box.addEventListener("gestureend", onGestureEnd);
    // ...and over what is laid on the page in its own layer (coverLayer): a
    // molecule's frames chip, its list, a step's card - save where a list
    // scrolls on that way, which takes the wheel for itself
    const onLayerWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && layer) {
        for (let el = e.target instanceof Element ? e.target : null; el && el !== layer; el = el.parentElement) {
          const css = getComputedStyle(el);
          const b = { overflowX: css.overflowX, overflowY: css.overflowY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight };
          if (scrollsAlong(b, e.deltaX, e.deltaY)) return;
        }
      }
      onWheel(e);
    };
    layer?.addEventListener("wheel", onLayerWheel, { passive: false });
    layer?.addEventListener("gesturestart", onGestureStart);
    layer?.addEventListener("gesturechange", onGestureChange);
    layer?.addEventListener("gestureend", onGestureEnd);
    return () => {
      if (pinchEnd != null) window.clearTimeout(pinchEnd);
      window.removeEventListener("pointerdown", onTouchDown, true);
      window.removeEventListener("pointermove", onTouchMove, true);
      window.removeEventListener("pointerup", onTouchUp, true);
      window.removeEventListener("pointercancel", onTouchUp, true);
      dom.removeEventListener("pointercancel", lostPan);
      dom.removeEventListener("lostpointercapture", lostPan);
      window.removeEventListener("blur", lostPan);
      setViewPanning(false);
      for (const name of HEARD) dom.removeEventListener(name, heard);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("gesturestart", onGestureStart);
      box.removeEventListener("gesturechange", onGestureChange);
      box.removeEventListener("gestureend", onGestureEnd);
      layer?.removeEventListener("wheel", onLayerWheel);
      layer?.removeEventListener("gesturestart", onGestureStart);
      layer?.removeEventListener("gesturechange", onGestureChange);
      layer?.removeEventListener("gestureend", onGestureEnd);
    };
  }, [camera, gl, invalidate, dom, extend.active, store, events.connected, layer]);

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
      if (s.extend.active) {
        dragging.current = false;
        setViewPanning(false);
      }
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
  useFrame(({ size }, dt) => {
    const cam = camera as any;
    if (viewDriven(camera)) {
      drivenBefore.current = true;
      return;
    }
    // (likewise once the page is laid again at another scale, the view moved with it: FollowStyle)
    if (drivenBefore.current || tookViewRelaid(camera)) {
      drivenBefore.current = false;
      pos.current.set(cam.position.x, cam.position.y);
      vel.current.set(0, 0);
      zoomLeft.current = 0;
      zoomGlide.current = 0;
    }
    // The view moved last frame under a pointer held still on it, or
    // something did on it (viewGoal): what is under the pointer now is lit,
    // and taken hold of by a press - or what a press drags follows it - as a
    // move of no distance finds it, drawn as it was moved to, so the hit
    // areas are too. (A drag of the view keeps the page under the pointer:
    // nothing to find till it is let go.)
    if (tookMovedUnderPointer(camera)) pointer.current.moved();
    const now = performance.now();
    const at = dragging.current ? null : pointer.current.findAgain(now);
    // (a finding put off - found a moment ago - comes in a frame of its own once due, the view still or not)
    const wait = at || dragging.current ? null : pointer.current.wait(now);
    if (wait != null && !findLater.current) {
      findLater.current = window.setTimeout(() => {
        findLater.current = 0;
        invalidate();
      }, wait + 1);
    }
    // (and a press held still that the view has moved under is neither a
    // click nor a long press: said before the press's handlers hear the move)
    const was = pressPage.current;
    if (at && at.buttons !== 0 && was && !pressMovedUnder(camera)) {
      const r = dom.getBoundingClientRect();
      const now = pageAt(((at.clientX - r.left) / r.width) * 2 - 1, -(((at.clientY - r.top) / r.height) * 2 - 1), camera);
      if (movedUnderPress(was, now, cam.zoom || 1, MOV_PX)) setPressMovedUnder(camera, true);
    }
    if (at) dom.dispatchEvent(new PointerEvent("pointermove", { ...at, button: -1, pointerType: "mouse", bubbles: true, cancelable: true }));
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

    const view = { x: cam.position.x, y: cam.position.y, zoom: cam.zoom || 1, width: size.width, height: size.height };
    if (viewMoved(seenView.current, view)) {
      pointer.current.moved();
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
