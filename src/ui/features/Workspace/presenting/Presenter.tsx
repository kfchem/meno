/**
 * A talk given from the slides on the page (docs/PRESENTING.md) - the
 * canvas's part of it:
 *
 * - begun, the window gives itself over to the talk - the title bar makes
 *   way, the window fills the screen, the column of texts shuts - and the
 *   view goes to the first slide;
 * - from one slide to the next, the view zooms and moves at once along the
 *   way that asks least of the eye (zoomPath), out and in again the farther
 *   apart they are; come to a slide, the page about it is veiled in white,
 *   unless the slide shows the page about it;
 * - while it is given, a drag on a molecule in 3D turns it, coasting as on
 *   the page, and two clicks on one show it in its other look; a click on a
 *   film plays it or pauses it, and a film on a slide plays from its start
 *   as the slide comes; a click elsewhere goes on; a drag elsewhere and the
 *   wheel or a pinch move and zoom the view freely, for a question - the
 *   next key goes on from there;
 * - the keys: those slides software has, and a clicker sends (presentAct);
 * - ended, the view goes to the last slide shown, in the editing view, as
 *   slides software ends a talk; the molecules turn back as they were and
 *   the window is as it was: a talk changes nothing on the page.
 *
 * What it moves over the canvas - the veil, the black screen, the slide's
 * number - is PresentLayer's.
 */
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditorStore } from "../store";
import type { EditorState, Turn3D } from "../store/types";
import { boxOf, presentAct, slideFit, talkEnd, viewOf, zoomOf } from "./slides";
import { easeInOut, flightMs, zoomPath, type ZoomPath } from "./zoomPath";
import { bandsAbout, stageOf } from "./stage";
import { setViewDriven, setViewGoal } from "../components/viewGoal";
import { setPresentingWindow, windowFullScreen } from "../../../presenting";
import { filmPlaying, playFilm, restartFilm } from "../components/pictureTextures";
import { currentStyle3D } from "../style3d";
import { bondRadiusOf } from "../../../../lib/chem/style3d";
import { lookOf, onMolecule, poseOf, solidOf } from "../utils/molecule3d";
import { eyeOf, FRAME_ORDER, pageAt } from "../utils/page";
import { isPinch, wheelReader } from "../../../../lib/input/wheel";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { MOV_PX } from "../constants";
import { TAU, follow } from "../../../theme/motion";

type ViewNow = { x: number; y: number; zoom: number };

/** How long the veil takes to come over the page about a slide, and to go - its time constant, in seconds. */
const VEIL_TAU = 0.08;
/** How long a slide's number shows as it comes, in ms; and the pointer, still, before it hides. */
const COUNT_MS = 1600;
const POINTER_MS = 2000;
/** A turned molecule's coasting: as on the page (Molecules3D) - let go within HELD_MS of its last move, it turns on, slowing, until slower than STILL. */
const HELD_MS = 80;
const STILL = 0.02;
const RECENT_MS = 64;
/** How long the molecules take to turn back as they were, as a talk ends, in ms. */
const TURN_BACK_MS = 420;
/** The wheel's zoom, as the page's (PanZoom2D). */
const ZOOM_PER_PX = 0.0016;
const NOTCH_MIN_PX = 40;
const PINCH_PER_PX = 0.01;
const MIN_ZOOM = 1;
const MAX_ZOOM = 300;

type Run = {
  /** The view, the canvas's size, the molecules' turns and the column, as the talk found them. */
  before: ViewNow;
  canvas: { w: number; h: number };
  turns: EditorState["turns3d"];
  texts: { open: boolean; pdf: number | null; text: number | null; cover: number };
  /** Whether the talk made the window full screen (and so puts it back). */
  madeFull: boolean;
  /** The view on its way to a slide; or moved freely by the presenter (`free`, where it is going, eased there); or, neither, at the slide. */
  flight: { path: ZoomPath; start: number; ms: number } | null;
  free: ViewNow | null;
  veil: number;
  /** A press on the talk's surface: on a molecule in 3D (turning it), or not (a click going on, a drag moving the view). */
  press: { pointerId: number; sx: number; sy: number; x: number; y: number; t: number; moved: boolean; on: number | null; axis: THREE.Vector3; recent: { t: number; angle: number; dt: number }[] } | null;
  spins: Map<number, { axis: THREE.Vector3; speed: number }>;
  /** A slide's number typed, to go to with Enter. */
  typed: string;
  screen: "black" | "white" | null;
  countTimer: number | null;
  pointerTimer: number | null;
  detach: () => void;
};

export default function Presenter() {
  const store = useEditorStore();
  const { camera, gl, invalidate, size } = useThree();
  const run = useRef<Run | null>(null);
  // (the molecules turning back as they were, once a talk has ended)
  const turningBack = useRef<{ from: Map<number, THREE.Quaternion>; to: EditorState["turns3d"]; start: number } | null>(null);
  const sizeNow = useRef(size);
  sizeNow.current = size;

  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const stage = stageOf(store);
    const st = () => store.getState();
    const viewNow = (): ViewNow => ({ x: cam.position.x, y: cam.position.y, zoom: cam.zoom });

    const showCount = (r: Run) => {
      const s = st();
      if (!stage.count || !s.presenting) return;
      stage.count.textContent = `${s.presenting.at + 1} / ${s.slides.length}`;
      stage.count.style.opacity = "1";
      if (r.countTimer != null) window.clearTimeout(r.countTimer);
      r.countTimer = window.setTimeout(() => {
        if (stage.count) stage.count.style.opacity = "0";
      }, COUNT_MS);
    };
    const showPointer = (r: Run) => {
      if (!stage.layer) return;
      stage.layer.style.cursor = "";
      if (r.pointerTimer != null) window.clearTimeout(r.pointerTimer);
      r.pointerTimer = window.setTimeout(() => {
        if (stage.layer) stage.layer.style.cursor = "none";
      }, POINTER_MS);
    };

    // the view sent to a slide, from wherever it is, along the easy way; and its films played from their start
    const goTo = (r: Run, at: number) => {
      const s = st().slides[at];
      if (!s) return;
      const w = sizeNow.current.width;
      const h = sizeNow.current.height;
      const path = zoomPath(viewOf(viewNow(), w), viewOf(slideFit(s, w, h), w));
      const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      r.flight = { path, start: performance.now(), ms: reduced ? 1 : flightMs(path) };
      r.free = null;
      const b = boxOf(s);
      for (const p of st().pictures) if (p.media === "video/mp4" && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) restartFilm(p.sha256);
      showCount(r);
      invalidate();
    };

    // what the pointer is on: the page's point, the molecule in 3D there (the last placed, on top), a film there
    const pageOf = (e: { clientX: number; clientY: number }) => {
      const rect = gl.domElement.getBoundingClientRect();
      return pageAt(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1), cam);
    };
    const moleculeAt = (e: { clientX: number; clientY: number }): number | null => {
      const p = pageOf(e);
      const s = st();
      const style = currentStyle3D();
      for (let i = s.molecules3d.length - 1; i >= 0; i--) {
        const m = s.molecules3d[i];
        const pose = poseOf(m, solidOf(m, style), lookOf(m), s.turns3d[m.id], s.frames3d[m.id]);
        if (onMolecule(m, pose, eyeOf(cam), p.x, p.y, cam.zoom, bondRadiusOf(style[lookOf(m)]))) return m.id;
      }
      return null;
    };
    const filmAt = (e: { clientX: number; clientY: number }): string | null => {
      const p = pageOf(e);
      const pics = st().pictures;
      for (let i = pics.length - 1; i >= 0; i--) {
        const q = pics[i];
        if (q.media !== "video/mp4") continue;
        const c = Math.cos(-(q.turn ?? 0));
        const sn = Math.sin(-(q.turn ?? 0));
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        if (Math.abs(dx * c - dy * sn) <= q.w / 2 && Math.abs(dx * sn + dy * c) <= q.h / 2) return q.sha256;
      }
      return null;
    };
    const turnBy = (id: number, axis: THREE.Vector3, angle: number) => {
      const was = st().turns3d[id];
      const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
      st().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
    };
    // the view moved freely, for a question: the veil goes, and the next key goes on from here
    const freeOf = (r: Run): ViewNow => {
      if (!r.free) r.free = viewNow();
      r.flight = null;
      return r.free;
    };
    const zoomAbout = (r: Run, factor: number, clientX: number, clientY: number, eased: boolean) => {
      const f = freeOf(r);
      const rect = gl.domElement.getBoundingClientRect();
      const ox = clientX - rect.left - rect.width / 2;
      const oy = rect.top + rect.height / 2 - clientY;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, f.zoom * factor));
      // (the point under the pointer stays under it)
      const px = f.x + ox / f.zoom;
      const py = f.y + oy / f.zoom;
      r.free = { x: px - ox / zoom, y: py - oy / zoom, zoom };
      if (!eased) {
        cam.position.x = r.free.x;
        cam.position.y = r.free.y;
        cam.zoom = r.free.zoom;
        cam.updateProjectionMatrix();
      }
      invalidate();
    };

    const attach = (r: Run): (() => void) => {
      const layer = stage.layer;
      const readWheel = wheelReader();
      let pinch: number | null = null;
      const onDown = (e: PointerEvent) => {
        showPointer(r);
        if (e.button !== 0) return;
        e.preventDefault();
        try {
          layer?.setPointerCapture(e.pointerId);
        } catch {}
        const on = moleculeAt(e);
        if (on != null) r.spins.delete(on);
        r.press = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false, on, axis: new THREE.Vector3(0, 1, 0), recent: [] };
      };
      const onMove = (e: PointerEvent) => {
        showPointer(r);
        const g = r.press;
        if (!g || e.pointerId !== g.pointerId) return;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < MOV_PX) return;
        g.moved = true;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (g.on != null) {
          // a molecule turned, as a drag on it turns it on the page
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const angle = (currentStyle3D().turnPerHalfWidth * len) / Math.max(gl.domElement.clientWidth / 2, 1);
            g.axis = new THREE.Vector3(dy, dx, 0).normalize();
            turnBy(g.on, g.axis, angle);
            g.recent = [...g.recent, { t: e.timeStamp, angle, dt: e.timeStamp - g.t }].filter((x) => e.timeStamp - x.t <= RECENT_MS);
          }
        } else {
          // the view moved, as a drag on the page moves it
          const f = freeOf(r);
          f.x -= dx / f.zoom;
          f.y += dy / f.zoom;
          cam.position.x = f.x;
          cam.position.y = f.y;
        }
        g.x = e.clientX;
        g.y = e.clientY;
        g.t = e.timeStamp;
        invalidate();
      };
      const onUp = (e: PointerEvent) => {
        const g = r.press;
        if (!g || e.pointerId !== g.pointerId) return;
        r.press = null;
        try {
          layer?.releasePointerCapture(e.pointerId);
        } catch {}
        if (g.moved) {
          // let go while still turning, it turns on, slowing
          if (g.on != null) {
            const took = g.recent.reduce((a, x) => a + x.dt, 0);
            const speed = g.recent.reduce((a, x) => a + x.angle, 0) / (Math.max(took, 16) / 1000);
            if (e.timeStamp - g.t < HELD_MS && speed > STILL) r.spins.set(g.on, { axis: g.axis, speed });
            invalidate();
          }
          return;
        }
        // a click: on a molecule, nothing (two show its other look); on a film, it plays or pauses; elsewhere, on
        if (g.on != null) return;
        const film = filmAt(e);
        if (film) {
          playFilm(film, !(filmPlaying(film) ?? true));
          invalidate();
          return;
        }
        const s = st();
        if (r.screen) return;
        if (s.presenting && s.presenting.at < s.slides.length - 1) s.presentAt(s.presenting.at + 1);
      };
      const onDouble = (e: MouseEvent) => {
        const on = moleculeAt(e);
        if (on == null) return;
        st().switchLook3d(on);
        invalidate();
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        showPointer(r);
        if (pinch !== null) return;
        if (readWheel(e) === "pan") {
          const f = freeOf(r);
          f.x += e.deltaX / f.zoom;
          f.y -= e.deltaY / f.zoom;
          cam.position.x = f.x;
          cam.position.y = f.y;
          invalidate();
          return;
        }
        if (isPinch(e)) {
          zoomAbout(r, Math.exp(-e.deltaY * PINCH_PER_PX), e.clientX, e.clientY, false);
          return;
        }
        const way = useAppSettings.getState().pointer.wheelUp === "out" ? -1 : 1;
        const step = way * Math.sign(e.deltaY) * Math.max(Math.abs(e.deltaY), NOTCH_MIN_PX);
        zoomAbout(r, Math.exp(-step * ZOOM_PER_PX), e.clientX, e.clientY, true);
      };
      const onGestureStart = (e: Event) => {
        e.preventDefault();
        pinch = 1;
      };
      const onGestureChange = (e: Event) => {
        e.preventDefault();
        const g = e as Event & { scale: number; clientX: number; clientY: number };
        if (pinch === null || !(g.scale > 0)) return;
        zoomAbout(r, g.scale / pinch, g.clientX, g.clientY, false);
        pinch = g.scale;
      };
      const onGestureEnd = (e: Event) => {
        e.preventDefault();
        pinch = null;
      };
      // every key is the talk's while it is given: none edits the page
      const onKey = (e: KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const act = presentAct(e);
        const s = st();
        if (!act || !s.presenting) return;
        if ("end" in act) {
          s.endPresenting();
          return;
        }
        if ("screen" in act) {
          r.screen = r.screen === act.screen ? null : act.screen;
          if (stage.screen) {
            stage.screen.style.background = act.screen === "black" ? "#000000" : "#ffffff";
            stage.screen.style.opacity = r.screen ? "1" : "0";
          }
          return;
        }
        if ("digit" in act) {
          r.typed = (r.typed + String(act.digit)).slice(-4);
          return;
        }
        const typed = r.typed;
        r.typed = "";
        // (a black or white screen let go before going anywhere)
        if (r.screen) {
          r.screen = null;
          if (stage.screen) stage.screen.style.opacity = "0";
          if (!("enter" in act) || !typed) return;
        }
        const n = s.slides.length;
        const at = s.presenting.at;
        const to =
          "enter" in act
            ? typed
              ? Number(typed) - 1
              : at + 1
            : act.go === "next"
              ? at + 1
              : act.go === "previous"
                ? at - 1
                : act.go === "first"
                  ? 0
                  : n - 1;
        if (to < 0 || to >= n) return;
        // (the same slide, after the view was moved freely: back to it)
        if (to === at) goTo(r, at);
        else s.presentAt(to);
      };
      layer?.addEventListener("pointerdown", onDown);
      layer?.addEventListener("pointermove", onMove);
      layer?.addEventListener("pointerup", onUp);
      layer?.addEventListener("pointercancel", onUp);
      layer?.addEventListener("dblclick", onDouble);
      layer?.addEventListener("wheel", onWheel, { passive: false });
      layer?.addEventListener("gesturestart", onGestureStart);
      layer?.addEventListener("gesturechange", onGestureChange);
      layer?.addEventListener("gestureend", onGestureEnd);
      window.addEventListener("keydown", onKey, true);
      return () => {
        layer?.removeEventListener("pointerdown", onDown);
        layer?.removeEventListener("pointermove", onMove);
        layer?.removeEventListener("pointerup", onUp);
        layer?.removeEventListener("pointercancel", onUp);
        layer?.removeEventListener("dblclick", onDouble);
        layer?.removeEventListener("wheel", onWheel);
        layer?.removeEventListener("gesturestart", onGestureStart);
        layer?.removeEventListener("gesturechange", onGestureChange);
        layer?.removeEventListener("gestureend", onGestureEnd);
        window.removeEventListener("keydown", onKey, true);
      };
    };

    const begin = (at: number) => {
      const s = st();
      const r: Run = {
        before: viewNow(),
        canvas: { w: sizeNow.current.width, h: sizeNow.current.height },
        turns: s.turns3d,
        texts: { open: s.textsOpen, pdf: s.pdfShown, text: s.textShown, cover: s.textsOpen ? s.cover : 0 },
        madeFull: false,
        flight: null,
        free: null,
        veil: 0,
        press: null,
        spins: new Map(),
        typed: "",
        screen: null,
        countTimer: null,
        pointerTimer: null,
        detach: () => undefined,
      };
      run.current = r;
      turningBack.current = null;
      setViewDriven(cam, true);
      if (s.textsOpen) s.closeTexts();
      setPresentingWindow(true);
      void windowFullScreen(true).then((made) => {
        if (run.current === r) r.madeFull = made;
        else if (made) void windowFullScreen(false);
      });
      if (stage.veil) stage.veil.style.transition = "";
      r.detach = attach(r);
      showPointer(r);
      goTo(r, at);
    };

    // ended - at the slide `last`, if it is there still: the window as it was, the view going to that slide, the molecules turning back
    const finish = (r: Run, settle: boolean, last?: number) => {
      r.detach();
      if (r.countTimer != null) window.clearTimeout(r.countTimer);
      if (r.pointerTimer != null) window.clearTimeout(r.pointerTimer);
      run.current = null;
      if (stage.veil) {
        // (the veil going, not gone at once)
        stage.veil.style.transition = "opacity 220ms cubic-bezier(0.4, 0, 0.6, 1)";
        stage.veil.style.opacity = "0";
      }
      if (stage.count) stage.count.style.opacity = "0";
      if (stage.screen) stage.screen.style.opacity = "0";
      if (stage.layer) stage.layer.style.cursor = "";
      setViewDriven(cam, false);
      setPresentingWindow(false);
      if (r.madeFull) void windowFullScreen(false);
      if (!settle) return;
      // (at the last slide shown, as the editing view has it - or, gone, back where it was - less the half of the column the view goes as the column opens again: FollowCover)
      const s = st();
      const reopens = r.texts.open && ((r.texts.pdf != null && s.pdfs.some((p) => p.id === r.texts.pdf)) || (r.texts.text != null && s.texts.some((t) => t.id === r.texts.text)));
      const cover = reopens ? r.texts.cover : 0;
      const slide = last != null ? s.slides[last] : undefined;
      setViewGoal(cam, slide ? talkEnd(slide, r.canvas.w, r.canvas.h, cover) : { ...r.before, x: r.before.x - cover / 2 / r.before.zoom });
      const from = new Map<number, THREE.Quaternion>();
      for (const m of s.molecules3d) {
        const now = s.turns3d[m.id];
        const was = r.turns[m.id];
        if (now === was) continue;
        from.set(m.id, now ? new THREE.Quaternion(...now) : new THREE.Quaternion());
      }
      if (from.size) turningBack.current = { from, to: r.turns, start: performance.now() };
      // (the column as it was: what it read rising into it again)
      if (r.texts.open) {
        if (r.texts.pdf != null && s.pdfs.some((p) => p.id === r.texts.pdf)) s.readPdf(r.texts.pdf);
        else if (r.texts.text != null && s.texts.some((t) => t.id === r.texts.text)) s.showText(r.texts.text);
      }
      invalidate();
    };

    let was = store.getState().presenting;
    const unsubscribe = store.subscribe((s) => {
      const now = s.presenting;
      if (now === was) return;
      const before = was;
      was = now;
      if (now && !before) begin(now.at);
      else if (now && before && run.current) goTo(run.current, now.at);
      else if (!now && run.current) finish(run.current, true, before?.at);
    });
    if (was && !run.current) begin(was.at);
    return () => {
      unsubscribe();
      if (run.current) finish(run.current, false);
    };
  }, [store, camera, gl, invalidate]);

  useFrame((_, dt) => {
    const cam = camera as THREE.OrthographicCamera;
    const back = turningBack.current;
    if (back) {
      const t = Math.min(1, (performance.now() - back.start) / TURN_BACK_MS);
      const k = easeInOut(t);
      const st = store.getState();
      for (const [id, from] of back.from) {
        const to = back.to[id];
        const q = from.clone().slerp(to ? new THREE.Quaternion(...to) : new THREE.Quaternion(), k);
        if (t >= 1 && !to) st.resetTurn3d(id);
        else st.setTurn3d(id, (t >= 1 && to ? to : [q.x, q.y, q.z, q.w]) as Turn3D);
      }
      if (t >= 1) turningBack.current = null;
      invalidate();
    }
    const r = run.current;
    if (!r) return;
    const st = store.getState();
    const s = st.presenting ? st.slides[st.presenting.at] : undefined;
    const w = size.width;
    const h = size.height;
    let moving = false;
    // the view: on its way to a slide, moved freely, or at the slide - following it as the canvas grows to the screen
    if (r.flight) {
      const t = (performance.now() - r.flight.start) / r.flight.ms;
      const v = r.flight.path.at(easeInOut(t));
      cam.position.x = v.x;
      cam.position.y = v.y;
      cam.zoom = zoomOf(v, w);
      if (t >= 1) r.flight = null;
      moving = true;
    } else {
      const goal = r.free ?? (s ? slideFit(s, w, h) : null);
      if (goal) {
        const d = Math.min(dt, 1 / 20);
        const zoom = Math.exp(follow(Math.log(cam.zoom || 1), Math.log(goal.zoom), d, TAU.move));
        const x = follow(cam.position.x, goal.x, d, TAU.move);
        const y = follow(cam.position.y, goal.y, d, TAU.move);
        const there = Math.abs(Math.log(zoom / goal.zoom)) < 1e-4 && Math.hypot(goal.x - x, goal.y - y) * zoom < 0.05;
        cam.position.x = there ? goal.x : x;
        cam.position.y = there ? goal.y : y;
        cam.zoom = there ? goal.zoom : zoom;
        moving ||= !there;
      }
    }
    cam.updateProjectionMatrix();
    // molecules let go while turning, turning on and slowing
    if (r.spins.size) {
      const damping = currentStyle3D().turnDamping;
      for (const [id, sp] of r.spins) {
        const was = st.turns3d[id];
        const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(sp.axis, sp.speed * dt)).normalize();
        st.setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
        sp.speed *= Math.pow(1 - damping, dt * 60);
        if (sp.speed < STILL) r.spins.delete(id);
      }
      moving = true;
    }
    // the veil over the page about the slide: there once the view is at a slide that does not show the page about it
    const stage = stageOf(store);
    const veilTo = s && !r.flight && !r.free && !s.around ? 1 : 0;
    r.veil = Math.abs(r.veil - veilTo) < 0.002 ? veilTo : follow(r.veil, veilTo, Math.min(dt, 1 / 20), VEIL_TAU);
    if (r.veil !== veilTo) moving = true;
    if (stage.veil && s) {
      stage.veil.style.opacity = String(r.veil);
      const z = cam.zoom;
      const rect = { left: w / 2 + (s.x - s.w / 2 - cam.position.x) * z, top: h / 2 - (s.y + s.h / 2 - cam.position.y) * z, width: s.w * z, height: s.h * z };
      bandsAbout(rect, w, h).forEach(([x, y, bw, bh], i) => {
        const el = stage.bands[i];
        if (!el) return;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${bw}px`;
        el.style.height = `${bh}px`;
      });
    }
    if (moving) invalidate();
  }, FRAME_ORDER.camera);

  return null;
}
