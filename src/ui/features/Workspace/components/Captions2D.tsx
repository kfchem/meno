import * as THREE from "three";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { captionPlace, wordsFontPx, wordsSet, type CaptionSet } from "../../../../lib/chem/captions";
import { labelSetOf, type LabelSet } from "../../../../lib/chem/layout2d";
import { selectedOf } from "../store/slices/selectionSlice";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS, MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { Caption } from "../store/types";
import { guideMove, guideWidth } from "../utils/guiding";
import { dragSelection } from "../utils/dragSelection";
import { pageAt } from "../utils/page";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { arrowsBeside } from "./drawnArrows";
import { type Held } from "./held";
import { HeldGlow } from "./HeldLight";
import { WholeTexts2D } from "./Labels2D";
import { SELECTION_SHADE } from "./selectionShade";
import { holdCursor, setCursor, type CursorName } from "../../../theme/cursors";
import { captionPointer } from "./captionPointer";
import { NO_RAYCAST, PartFramesProvider, SQUARE, UNSEEN, usePartFrame, usePartFrames } from "./partFrames";

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
/** A caption's edges, as they are held and as they are seen: the same for all. */
const EDGE_HELD = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
const EDGE_SEEN = new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false, toneMapped: false });

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
  // (the one under the pointer, asked here once rather than by each)
  const hovered = useEditor((s) => s.hoveredCaption);
  const { opts } = useDrawnLayout();
  const set = useMemo(() => labelSetOf(opts), [opts]);
  // (each caption's work at each frame done from this one callback: partFrames)
  const parts = usePartFrames();
  return (
    <PartFramesProvider value={parts}>
      <group>
        {captions
          .filter((c) => c.id !== hidden && c.id !== landing)
          .map((c) => (
            <CaptionWords key={c.id} c={c} set={set} selected={selCaptions.has(c.id)} hovered={hovered === c.id} />
          ))}
      </group>
    </PartFramesProvider>
  );
}

/** One caption: its words - each set drawn whole, about its middle - and where it is taken hold of. */
// (drawn again only as it changes: a pointer coming onto one caption leaves the others as they were)
const CaptionWords = memo(function CaptionWords({ c, set, selected, hovered }: { c: Caption; set: LabelSet; selected: boolean; hovered: boolean }) {
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
      <CaptionHold laid={laid} selected={selected} hovered={hovered} />
    </group>
  );
});

/** Where a caption is taken hold of: the room round its words, lit while the pointer is on it, shaded while it is selected. */
function CaptionHold({ laid, selected, hovered }: { laid: Laid; selected: boolean; hovered: boolean }) {
  const { c, halfW, halfH, fs } = laid;
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  // (the canvas's state taken a part at a time: the whole of it would draw every caption again as any of it changed)
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  const invalidate = useThree((st) => st.invalidate);
  const margin = MARGIN * fs;
  // its light and its shade - there only as long as either is
  const [glowing, setGlowing] = useState(false);
  if ((hovered || selected) && !glowing) setGlowing(true);
  // (its edges stay shown while one is dragged, the pointer off it)
  const [resizing, setResizing] = useState(false);
  // taken hold of by a press held on it: where, from its middle, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  useEffect(() => invalidate(), [held, invalidate]);
  // the pointer over its words, its edge or both, and the pointer for that (captionPointer)
  const over = useRef({ words: false, edge: false });
  // (the canvas's pointer changed only where it is to be: others ask for theirs on it and write theirs too)
  const pointerOn = useCallback(
    (part: "words" | "edge" | "both", on: boolean) => {
      if (part === "both") over.current = { words: on, edge: on };
      else over.current[part] = on;
      const el = gl.domElement;
      const { asked, own } = captionPointer(over.current, { asked: el.dataset.cursor, own: el.style.cursor });
      if (asked !== el.dataset.cursor) setCursor(el, (asked ?? null) as CursorName | null);
      if (own !== el.style.cursor) el.style.cursor = own;
    },
    [gl],
  );
  const onEdge = useCallback((on: boolean) => pointerOn("edge", on), [pointerOn]);
  // gone from under the pointer without the pointer leaving it - its words
  // written in its place: no longer under it
  useEffect(
    () => () => {
      const s = store.getState();
      if (s.hoveredCaption === c.id) s.setHoveredCaption(null);
      pointerOn("both", false);
    },
    [store, c.id, pointerOn],
  );
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
    // (lined up with what is near as they go: docs/PRESENTING.md, *Guides*)
    const guide = guideMove(store, toWorld, { x: sx, y: sy });
    const goes = (ev: PointerEvent) => {
      const q = toWorld(ev.clientX, ev.clientY);
      const d = guide.step(q.x - at.x, q.y - at.y, ev);
      return { x: at.x + d.x + off.x, y: at.y + d.y + off.y };
    };
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      moved = true;
      // (taken from an arrow as it is moved: put down near one, it goes over it again)
      store.getState().updateCaption(c.id, { ...goes(ev), arrow: null }, gesture);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(ev.pointerId);
      setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      // (the button coming up here is no click on empty space)
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      if (!moved) {
        guide.end();
        return;
      }
      const q = goes(ev);
      guide.end();
      const others = s.captions
        .filter((o) => o.id !== c.id)
        .map((o) => {
          const r = wordsSet(o, opts, labelSetOf(opts));
          return { ...o, halfW: r.halfW, halfH: r.halfH };
        });
      const placed = captionPlace(q, { w: halfW, h: halfH }, arrowsBeside(s, opts, labelSetOf(opts), c.id), opts.fontPx, others);
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
      if (s.selCaptions.has(c.id) && (s.selCaptions.size > 1 || selectedOf({ ...s, selCaptions: new Set() }).any)) {
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

  const box = { x0: -(halfW + margin), x1: halfW + margin, y0: -(halfH + margin), y1: halfH + margin };
  return (
    <group
      // (over an arrow's hit area, where they meet: a press there is the words')
      position={[0, 0, 0.04]}
      onPointerOver={() => {
        store.getState().setHoveredCaption(c.id);
        pointerOn("words", true);
      }}
      onPointerOut={() => {
        store.getState().setHoveredCaption(null);
        pointerOn("words", false);
      }}
      onPointerDown={onDown}
    >
      {/* (what a press takes: the room round its words, never drawn) */}
      <mesh args={[SQUARE, UNSEEN]} scale={[box.x1 - box.x0, box.y1 - box.y0, 1]} />
      {glowing && <LitAndShaded w={box.x1 - box.x0} h={box.y1 - box.y0} lit={hovered} shaded={selected} gone={() => setGlowing(false)} />}
      {held && <HeldGlow held={held} b={box} at={held} z={0.005} gone={() => setHeld(null)} />}
      {(hovered || resizing) && (
        <>
          <CaptionEdge side={-1} laid={laid} margin={margin} onResizing={setResizing} onPointer={onEdge} />
          <CaptionEdge side={1} laid={laid} margin={margin} onResizing={setResizing} onPointer={onEdge} />
        </>
      )}
    </group>
  );
}

/**
 * The light behind a caption under the pointer (`lit`) and the selection's
 * shade under it while it is selected (`shaded`): each coming and going,
 * `gone` told once neither shows.
 */
function LitAndShaded({ w, h, lit, shaded, gone }: { w: number; h: number; lit: boolean; shaded: boolean; gone: () => void }) {
  const invalidate = useThree((st) => st.invalidate);
  const light = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }), []);
  // (shaded as a structure is, under the drawing: the page's white going over to the shade - opaque, so behind the bonds)
  const shade = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", visible: false, toneMapped: false }), []);
  useEffect(
    () => () => {
      light.dispose();
      shade.dispose();
    },
    [light, shade],
  );
  const shadedBy = useRef(0);
  usePartFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    const to = lit ? LIT : 0;
    let moving = false;
    if (Math.abs(light.opacity - to) < 1e-3) light.opacity = to;
    else {
      light.opacity = follow(light.opacity, to, d, TAU.quick);
      moving = true;
    }
    const k = shaded ? 1 : 0;
    if (Math.abs(shadedBy.current - k) < 1e-3) shadedBy.current = k;
    else {
      shadedBy.current = follow(shadedBy.current, k, d, TAU.quick);
      moving = true;
    }
    shade.color.set("#ffffff").lerp(SHADE_COLOR, shadedBy.current);
    shade.visible = shadedBy.current > 1e-3;
    if (moving) invalidate();
    else if (!lit && !shaded) gone();
  });
  return (
    <>
      {/* (the selection's shade, under the words and the drawing) */}
      <mesh args={[SQUARE, shade]} position={[0, 0, -0.05]} scale={[w, h, 1]} raycast={NO_RAYCAST} />
      <mesh args={[SQUARE, light]} renderOrder={5} scale={[w, h, 1]} raycast={NO_RAYCAST} />
    </>
  );
}

/**
 * A caption's edge, lit with it: dragged sideways - Meno's own pointer for
 * it, held through the drag over whatever the pointer goes, its words' text
 * cursor too - the caption made as wide as from its other edge to the
 * pointer, its words broken into lines at it, as one step.
 */
function CaptionEdge({
  side,
  laid,
  margin,
  onResizing,
  onPointer,
}: {
  side: -1 | 1;
  laid: Laid;
  margin: number;
  onResizing: (on: boolean) => void;
  /** The pointer come onto the edge, or gone from it: its caption gives the canvas the pointer for both. */
  onPointer: (on: boolean) => void;
}) {
  const { c, halfW, halfH } = laid;
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  const camera = useThree((st) => st.camera);
  const gl = useThree((st) => st.gl);
  // (the view's zoom as the drawing takes it up: drawn again as it changes - drawnLayoutContext `useDrawnZoom`)
  const px = 1 / Math.max(useDrawnZoom(), 1e-6);
  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  const tall = 2 * (halfH + margin);
  // (gone - the pointer off the caption, the edges with it: no longer under it)
  useEffect(() => () => onPointer(false), [onPointer]);
  return (
    <group
      position={[side * (halfW + margin), 0, 0.001]}
      onPointerOver={() => onPointer(true)}
      onPointerOut={() => onPointer(false)}
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
        // (as wide as something near, where it comes near: docs/PRESENTING.md, *Guides*)
        const guide = guideWidth(store, toWorld, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }, c.id);
        st.beginPanHold(e.nativeEvent.pointerId);
        onResizing(true);
        const letCursorGo = holdCursor("sideways");
        const onMove = (ev: PointerEvent) => {
          const q = toWorld(ev.clientX, ev.clientY);
          let edge = side > 0 ? Math.max(fixed + narrowest, q.x) : Math.min(fixed - narrowest, q.x);
          const like = guide.step({ x0: Math.min(edge, fixed), x1: Math.max(edge, fixed), y0: c.y - halfH, y1: c.y + halfH }, ev);
          if (like != null && like >= narrowest) edge = fixed + side * like;
          const width = Math.abs(edge - fixed);
          const y = top != null ? top - wordsSet({ ...c, width }, opts, set).halfH : c.y;
          store.getState().updateCaption(c.id, { width, x: (edge + fixed) / 2, y }, gesture);
        };
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp, true);
          letCursorGo();
          guide.end();
          const s = store.getState();
          s.endPanHold(ev.pointerId);
          s.suppressDoubleClick(200);
          onResizing(false);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, true);
      }}
    >
      {/* (held a little wider than it is seen) */}
      <mesh args={[SQUARE, EDGE_HELD]} renderOrder={6} scale={[EDGE_HOLD_PX * px, tall, 1]} />
      <mesh args={[SQUARE, EDGE_SEEN]} renderOrder={6} scale={[EDGE_PX * px, tall * 0.6, 1]} />
    </group>
  );
}
