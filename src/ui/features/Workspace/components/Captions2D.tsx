import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { captionPlace, wordsFontPx, wordsSet, type CaptionSet } from "../../../../lib/chem/captions";
import { labelSetOf, type LabelSet } from "../../../../lib/chem/layout2d";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS, MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { Caption } from "../store/types";
import { dragSelection } from "../utils/dragSelection";
import { pageAt } from "../utils/page";
import { useDrawnLayout } from "./drawnLayoutContext";
import { arrowsBeside } from "./drawnArrows";
import { heldShows, type Held } from "./held";
import { HeldLight } from "./HeldLight";
import { WholeTexts2D } from "./Labels2D";
import { SELECTION_SHADE } from "./selectionShade";
import { setCursor } from "../../../theme/cursors";

type Pt = { x: number; y: number };

/** How far round its words a caption is taken hold of, and lit as the pointer is on it, in ems. */
const MARGIN = 0.3;
/** How strongly the light behind a caption under the pointer shows. */
const LIT = 0.16;
/** A caption's edges, taken hold of to make it wider or narrower: how wide each is seen and held, on the screen, in pixels, and how narrow it may be made, in ems. */
const EDGE_PX = 3;
const EDGE_HOLD_PX = 10;
const NARROWEST_EMS = 2;

/** The selection's shade, as a colour to go over to from the page's white. */
const SHADE_COLOR = new THREE.Color(SELECTION_SHADE);

/** A caption as it is set about its middle, and the room it takes. */
type Laid = { c: Caption; fs: number } & CaptionSet;

/**
 * The words on the page (lib/chem/captions), set as the drawing sets its
 * labels, each lit from behind while the pointer is on it - as what is
 * under the pointer is - and with the selection's shade while it is
 * selected. Pressed as words are anywhere: a click puts the caret there, a
 * drag selects letters from there, two clicks a word, three a line - each
 * written anew in place (CaptionTyping2D). Held still a moment, they are
 * taken hold of - lit from the pointer out, as a structure is - and
 * selected, as one thing; a drag then moves them, put down near an arrow to
 * go over it or under it - or, selected with more, moves the selection.
 * Their edges, shown as they are lit, are dragged to make them wider or
 * narrower: their words broken into lines as wide as they are made, the
 * other edge staying where it was. Those being written are not drawn once
 * what is written is drawn in their place; nor are words carried out of a
 * PDF until they have settled.
 */
export default function Captions2D() {
  const captions = useEditor((s) => s.captions);
  // (the words being written, once drawn in place of their own)
  const hidden = useEditor((s) => (s.captionEdit?.id != null && s.captionEdit.drawn ? s.captionEdit.id : null));
  // (words carried out of a PDF, settling where they were let go: these, once they have)
  const landing = useEditor((s) => s.pdfWords?.landing ?? null);
  const selCaptions = useEditor((s) => s.selCaptions);
  const { opts } = useDrawnLayout();
  const set = useMemo(() => labelSetOf(opts), [opts]);
  return (
    <group>
      {captions
        .filter((c) => c.id !== hidden && c.id !== landing)
        .map((c) => (
          <CaptionWords key={c.id} c={c} set={set} selected={selCaptions.has(c.id)} />
        ))}
    </group>
  );
}

/** One caption: its words - each set drawn whole, about its middle - and where it is taken hold of. */
function CaptionWords({ c, set, selected }: { c: Caption; set: LabelSet; selected: boolean }) {
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  // (at its own size, or the labels'; its letters as they were marked)
  const fs = wordsFontPx(c, opts);
  const laid = useMemo<Laid>(() => ({ c, fs, ...wordsSet(c, opts, set, { x: 0, y: 0 }) }), [c, fs, opts, set]);
  // (given back by what was written in their place: seen at once, as that was - else faded in, as they come)
  const [fadeIn] = useState(() => store.getState().captionLeft?.id !== c.id);
  return (
    <group position={[c.x, c.y, 0]}>
      <WholeTexts2D texts={laid.items} fadeIn={fadeIn} onDrawn={() => store.getState().captionShown(c.id)} />
      <CaptionHold laid={laid} selected={selected} />
    </group>
  );
}

/** Where a caption is taken hold of: the room round its words, lit while the pointer is on it, shaded while it is selected. */
function CaptionHold({ laid, selected }: { laid: Laid; selected: boolean }) {
  const { c, halfW, halfH, fs } = laid;
  const store = useEditorStore();
  const hovered = useEditor((s) => s.hoveredCaption === c.id);
  const { opts } = useDrawnLayout();
  const { camera, gl, invalidate } = useThree();
  const margin = MARGIN * fs;
  const light = useRef<THREE.MeshBasicMaterial>(null);
  const shade = useRef<THREE.MeshBasicMaterial>(null);
  // (shaded as a structure is, under the drawing: the page's white going over to the shade - opaque, so behind the bonds)
  const shaded = useRef(0);
  // (its edges stay shown while one is dragged, the pointer off it)
  const [resizing, setResizing] = useState(false);
  // taken hold of by a press held on it: where, from its middle, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => invalidate(), [held, invalidate]);
  // gone from under the pointer without the pointer leaving it - its words
  // written in its place: no longer under it
  useEffect(
    () => () => {
      const s = store.getState();
      if (s.hoveredCaption === c.id) s.setHoveredCaption(null);
      setCursor(gl.domElement, null);
      gl.domElement.style.cursor = "";
    },
    [store, c.id, gl],
  );
  useFrame((_, dt) => {
    if (held && heldShows(held, performance.now())) {
      setTick((t) => t + 1);
      invalidate();
    }
    const step = (m: THREE.MeshBasicMaterial | null, to: number) => {
      if (!m) return;
      if (Math.abs(m.opacity - to) < 1e-3) {
        m.opacity = to;
        return;
      }
      m.opacity = follow(m.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
      invalidate();
    };
    step(light.current, hovered ? LIT : 0);
    const m = shade.current;
    if (!m) return;
    const to = selected ? 1 : 0;
    if (Math.abs(shaded.current - to) < 1e-3) shaded.current = to;
    else {
      shaded.current = follow(shaded.current, to, Math.min(dt, 1 / 20), TAU.quick);
      invalidate();
    }
    m.color.set("#ffffff").lerp(SHADE_COLOR, shaded.current);
    m.visible = shaded.current > 1e-3;
  });
  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  /** Taken hold of, held still: moved as the pointer goes - put down near an arrow, over it or under it - as one step. */
  const moveFrom = (sx: number, sy: number) => {
    const at = toWorld(sx, sy);
    const off = { x: c.x - at.x, y: c.y - at.y };
    const gesture = `move-${performance.now()}`;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      moved = true;
      const q = toWorld(ev.clientX, ev.clientY);
      // (taken from an arrow as it is moved: put down near one, it goes over it again)
      store.getState().updateCaption(c.id, { x: q.x + off.x, y: q.y + off.y, arrow: null }, gesture);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(ev.pointerId);
      setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      // (the button coming up here is no click on empty space)
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      if (!moved) return;
      const q = toWorld(ev.clientX, ev.clientY);
      const others = s.captions
        .filter((o) => o.id !== c.id)
        .map((o) => {
          const r = wordsSet(o, opts, labelSetOf(opts));
          return { ...o, halfW: r.halfW, halfH: r.halfH };
        });
      const placed = captionPlace({ x: q.x + off.x, y: q.y + off.y }, { w: halfW, h: halfH }, arrowsBeside(s, opts, labelSetOf(opts), c.id), opts.fontPx, others);
      s.updateCaption(c.id, { x: placed.x, y: placed.y, arrow: placed.arrow ?? null }, gesture);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  const onDown = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    // a right press is the menu's, or the view's to move
    if (ev.button !== 0) return;
    // (one press, one thing: not the arrow under the words as well)
    e.stopPropagation();
    const st = store.getState();
    // (Ctrl, or ⌘: added to the selection, or taken out of it)
    if (addsToSelection(ev)) {
      const now = new Set(st.selCaptions);
      if (now.has(c.id)) now.delete(c.id);
      else now.add(c.id);
      st.selectCaptions(now);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY };
    const at = toWorld(from.x, from.y);
    const t = performance.now();
    // (the view held still from here until the button comes up, whatever the press turns out to be)
    st.beginPanHold(ev.pointerId);
    setHeld({ x: at.x - c.x, y: at.y - c.y, start: t });
    invalidate();
    let was: "press" | "letters" | "held" = "press";
    const stop = () => {
      window.clearTimeout(hold);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };
    const letGo = () => setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
    // held still: taken hold of - selected as one thing - and a drag from here moves it, or the selection it is in
    const hold = window.setTimeout(() => {
      if (was !== "press") return;
      was = "held";
      stop();
      const s = store.getState();
      setHeld((h) => (h ? { ...h, done: true } : h));
      if (s.selCaptions.has(c.id) && (s.selCaptions.size > 1 || s.sel.atoms.size || s.sel3d.size || s.selPictures.size || s.selTexts.size || s.selPdfs.size || s.selSlides.size || s.selFlow.sets.size || s.selFlow.steps.size)) {
        dragSelection(store, toWorld, from, (u) => {
          const s2 = store.getState();
          s2.endPanHold(u.pointerId);
          s2.suppressDoubleClick(DOUBLE_CLICK_MS);
          letGo();
        });
        return;
      }
      s.clearSel();
      s.selectCaptions([c.id]);
      moveFrom(from.x, from.y);
    }, LONG_PRESS_MS);
    // (a drag before then selects letters, from where it pressed - the words written anew in place)
    const onMove = (m: PointerEvent) => {
      if (was !== "press" || Math.hypot(m.clientX - from.x, m.clientY - from.y) < MOV_PX) return;
      was = "letters";
      window.clearTimeout(hold);
      window.removeEventListener("pointermove", onMove);
      letGo();
      const s = store.getState();
      s.clearSel();
      s.setCaptionEdit({ id: c.id, at: { x: c.x, y: c.y }, press: { at, client: from, t, drag: true } });
    };
    // (let go before then: the caret where it was pressed)
    const onUp = (u: PointerEvent) => {
      stop();
      letGo();
      const s = store.getState();
      s.endPanHold(u.pointerId);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      if (was !== "press") return;
      s.clearSel();
      s.setCaptionEdit({ id: c.id, at: { x: c.x, y: c.y }, press: { at, client: from, t, drag: false } });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  const now = performance.now();
  const box = { x0: -(halfW + margin), x1: halfW + margin, y0: -(halfH + margin), y1: halfH + margin };
  return (
    <group
      // (over an arrow's hit area, where they meet: a press there is the words')
      position={[0, 0, 0.04]}
      onPointerOver={() => {
        store.getState().setHoveredCaption(c.id);
        // (words: the system's text pointer, as over words anywhere)
        gl.domElement.style.cursor = "text";
      }}
      onPointerOut={() => {
        store.getState().setHoveredCaption(null);
        gl.domElement.style.cursor = "";
      }}
      onPointerDown={onDown}
    >
      {/* (the selection's shade, under the words and the drawing) */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[box.x1 - box.x0, box.y1 - box.y0]} />
        <meshBasicMaterial ref={shade} color="#ffffff" visible={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={5}>
        <planeGeometry args={[box.x1 - box.x0, box.y1 - box.y0]} />
        <meshBasicMaterial ref={light} color={COLORS.highlight} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {held && heldShows(held, now) && <HeldLight b={box} at={held} held={held} now={now} z={0.005} />}
      {(hovered || resizing) && (
        <>
          <CaptionEdge side={-1} laid={laid} margin={margin} onResizing={setResizing} />
          <CaptionEdge side={1} laid={laid} margin={margin} onResizing={setResizing} />
        </>
      )}
    </group>
  );
}

/**
 * A caption's edge, lit with it: dragged sideways - Meno's own pointer for
 * it - the caption made as wide as from its other edge to the pointer, its
 * words broken into lines at it, as one step.
 */
function CaptionEdge({ side, laid, margin, onResizing }: { side: -1 | 1; laid: Laid; margin: number; onResizing: (on: boolean) => void }) {
  const { c, halfW, halfH } = laid;
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  const { camera, gl } = useThree();
  const px = 1 / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-6);
  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  const tall = 2 * (halfH + margin);
  return (
    <group
      position={[side * (halfW + margin), 0, 0.001]}
      onPointerOver={() => setCursor(gl.domElement, "sideways")}
      onPointerOut={() => setCursor(gl.domElement, null)}
      onPointerDown={(e) => {
        if (e.nativeEvent.button !== 0) return;
        e.stopPropagation();
        // (the other edge stays where it is; this one follows the pointer)
        const fixed = c.x - side * halfW;
        const narrowest = NARROWEST_EMS * laid.fs;
        // (a box keeps its top as its lines are broken again; words over an arrow, their middle)
        const top = c.arrow == null ? c.y + halfH : null;
        const set = labelSetOf(opts);
        const gesture = `resize-${performance.now()}`;
        const st = store.getState();
        st.beginPanHold(e.nativeEvent.pointerId);
        onResizing(true);
        const onMove = (ev: PointerEvent) => {
          const q = toWorld(ev.clientX, ev.clientY);
          const edge = side > 0 ? Math.max(fixed + narrowest, q.x) : Math.min(fixed - narrowest, q.x);
          const width = Math.abs(edge - fixed);
          const y = top != null ? top - wordsSet({ ...c, width }, opts, set).halfH : c.y;
          store.getState().updateCaption(c.id, { width, x: (edge + fixed) / 2, y }, gesture);
        };
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp, true);
          const s = store.getState();
          s.endPanHold(ev.pointerId);
          s.suppressDoubleClick(200);
          onResizing(false);
          setCursor(gl.domElement, null);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, true);
      }}
    >
      {/* (held a little wider than it is seen) */}
      <mesh renderOrder={6} scale={[EDGE_HOLD_PX * px, tall, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={6} scale={[EDGE_PX * px, tall * 0.6, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={COLORS.highlight} transparent opacity={0.7} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
