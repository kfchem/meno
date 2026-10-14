/**
 * Words on the page written in place (lib/chem/captions; docs/EDITOR-2D.md,
 * *Text*; docs/PDF.md, step 5): drawn by Meno as they will be kept - set
 * as the drawing sets its labels, in its typeface at its size, broken into
 * lines as wide as they are made where they are given a width - with the
 * caret, what is selected and what the IME composes drawn over them, lit
 * round as words under the pointer are. Typed through the field the
 * column's texts are typed through (TextEditor/typingField), kept out of
 * sight and laid at the caret, so that the IME's candidates show there.
 *
 * Where they stand - or, new, where Quick Add or the menu was opened. A
 * click among them puts the caret, two select a word, three a line, a drag
 * selects on - the click or the drag that opened them counted among those.
 * Enter keeps them, Shift+Enter starts another line - in a list, its next
 * item - Escape lets them go, and a press elsewhere keeps them too.
 * Ctrl/Cmd+B and +I set what is selected bold or in italics, Ctrl/Cmd and +
 * raised and Ctrl/Cmd and = lowered (wherever a keyboard has + and =);
 * Ctrl/Cmd+Shift+> and < make the words a
 * size larger or smaller; Tab and Shift+Tab take a list's items in and out
 * a level (docs/EDITOR-2D.md, *Text*). A box given a width keeps its
 * top as it grows. What is typed is written as it is
 * meant, unless Settings say not (lib/text/smartWords): 60dc as 60 °C. New
 * words put down near an arrow go over it or under it; words written anew
 * over an arrow stay clear of it as they grow. Words written away are gone.
 *
 * What is drawn is drawn whole (Labels2D `WholeTexts2D`): the caret and
 * what is selected go with the words as they are drawn, not ahead of them;
 * and the words written are drawn in place of the caption's own only once
 * they are, and the caption's own again in place of them, once kept or let
 * go, only once those are (`captionLeft`) - never a letter gone, or one
 * too many, for a frame.
 */
import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CAPTION_LINE, captionPlace, captionPlaces, captionSet, marksOf, WORDS_STEPS, wordsFontPx, wordsSet } from "../../../../lib/chem/captions";
import { IS_MAC, plusOrEquals } from "../../../../lib/doc/shortcuts";
import { fontStack, labelSetOf, sameTexts, type TextItem } from "../../../../lib/chem/layout2d";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { useEditor, useEditorStore } from "../store";
import type { Caption, EditorState } from "../store/types";
import { pageAt } from "../utils/page";
import { stylesThrough, WordsEditor } from "../utils/wordsEditor";
import { wordsRoom } from "../../../../lib/chem/shapes";
import { SHAPE_PAD } from "../document";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { arrowsBeside, useWordsWriting } from "./drawnArrows";
import { WholeTexts2D } from "./Labels2D";
import { usePressAmong, useWriting, writingMarks, measured, type WritingDrawn } from "./writing";
import type { TypingField } from "../../TextEditor/typingField";
import { pageField } from "./pageField";

/** How far round the words they are lit, and taken as theirs by a press, in ems; how strongly the light shows. */
const MARGIN = 0.3;
const LIT = 0.16;
/** How long words kept or let go are drawn at most, waiting for their caption's own to be drawn, in ms. */
const LEFT_MS = 500;

type Edit = NonNullable<EditorState["captionEdit"]>;
type Pt = { x: number; y: number };

export default function CaptionTyping2D() {
  const edit = useEditor((s) => s.captionEdit);
  const left = useEditor((s) => s.captionLeft);
  const captions = useEditor((s) => s.captions);
  // (each writing its own, given its words as it opens - and the one kept or let go drawn on, as it was, until its caption's own are)
  const out: ReactNode[] = [];
  if (left) out.push(<Writing key={left.n} edit={{ id: left.id, at: left.at, n: left.n }} caption={captions.find((c) => c.id === left.id)} left />);
  if (edit?.n != null) out.push(<Writing key={edit.n} edit={edit} caption={edit.id != null ? captions.find((c) => c.id === edit.id) : undefined} />);
  return <>{out}</>;
}

/**
 * Words being written - or, `left`, kept or let go: then drawn alone, as
 * their caption now is, until its own are drawn in their place.
 */
function Writing({ edit, caption, left = false }: { edit: Edit; caption?: Caption; left?: boolean }) {
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  const { camera, gl, size, invalidate } = useThree();
  const [, setTick] = useState(0);
  // (its words as they were, or none: written in their own editor until they are kept)
  const [ed] = useState(() => {
    const e = new WordsEditor(caption?.text ?? "", caption?.marks);
    e.smart = () => useAppSettings.getState().words.smart;
    return e;
  });
  const field = useRef<TypingField | null>(null);
  const done = useRef(false);
  const n = edit.n ?? 0;

  // (as it opened: where the caption stood - or, new, where it was asked for)
  const [opened] = useState(() => (caption ? { x: caption.x, y: caption.y } : edit.at));
  // (their size: their own, as it is changed while they are written, or the labels')
  const [own, setOwn] = useState<number | undefined>(caption?.size);
  const fs = wordsFontPx({ size: own }, opts);
  const set = useMemo(() => labelSetOf(opts), [opts]);
  // (a box given a width, not over an arrow nor in a shape, keeps its top as it grows: where its top was as it opened)
  const [top] = useState(() => (caption?.width && caption.arrow == null && caption.shape == null ? caption.y + wordsSet(caption, opts, labelSetOf(opts)).halfH : null));
  // (in a shape - or, new, written in one: about its middle, as wide as it is inside)
  const inShape = caption ? caption.shape : edit.shape;
  const shapes = useEditor((s) => s.shapes);
  const room = useMemo(() => {
    const sh = inShape != null ? shapes.find((x) => x.id === inShape) : undefined;
    return sh ? wordsRoom(sh, SHAPE_PAD) : null;
  }, [inShape, shapes]);
  const cam = camera as THREE.OrthographicCamera;
  // (the view's zoom as the drawing takes it up: drawn again as it changes - drawnLayoutContext `useDrawnZoom`)
  const zoom = useDrawnZoom();
  const px = 1 / zoom;
  const margin = MARGIN * fs;

  // the words as they are drawn: what the IME has so far in place of what it replaces - kept or let go, as their caption now has them
  const c = left ? null : ed.composing;
  const text = left ? (caption?.text ?? "") : ed.text;
  const shownText = c ? text.slice(0, c.from) + c.text + text.slice(c.to) : text;
  const width = room?.width ?? caption?.width;
  const align = caption?.align;
  // (their letters as they are set - what the IME composes as what it is typed into)
  const marks = left ? caption?.marks : marksOf(ed.styles);
  const shownMarks = c ? marksOf(stylesThrough(ed.styles, { from: c.from, to: c.to, insert: c.text }, ed.pending)) : marks;
  // (set about their middle, drawn there: moved, nothing of them set again)
  const laid = captionSet(shownText, 0, 0, fs, set, width, align, shownMarks);
  const halfW = Math.max(laid.halfW, fs / 2);
  const halfH = Math.max(laid.halfH, fs / 2);
  const at = left && caption ? { x: caption.x, y: caption.y } : room ? { x: room.x, y: room.y } : top != null ? { x: opened.x, y: top - laid.halfH } : opened;
  const places = captionPlaces(text, at.x, at.y, fs, set, width, align, marks);
  const shown = c ? captionPlaces(shownText, at.x, at.y, fs, set, width, align, shownMarks) : places;
  // (over an arrow, or going over one as they are kept: the arrow as long as they need, as they are written)
  const arrows = useEditor((s) => s.arrows);
  const captions = useEditor((s) => s.captions);
  const beside = useMemo(() => arrowsBeside({ arrows, captions }, opts, set, edit.id), [arrows, captions, opts, set, edit.id]);
  const goes = left || !text.trim() || room ? null : caption ? (caption.arrow != null ? { arrow: caption.arrow, ...at } : null) : captionPlace(edit.at, { w: laid.halfW, h: laid.halfH }, beside, fs);
  useWordsWriting(goes?.arrow != null ? { arrow: goes.arrow, x: goes.x, y: goes.y, halfW: laid.halfW, halfH: laid.halfH } : null, n);
  // what is drawn: the caret, what is selected and the light round them as the words drawn have them - those last given, until they are drawn
  const latest = useRef<WritingDrawn | null>(null);
  const drawnNow = useRef<WritingDrawn | null>(null);
  const now: WritingDrawn = { items: laid.items, places, shown, sel: ed.sel, c, halfW, halfH };
  latest.current = now;
  if (drawnNow.current && sameTexts(drawnNow.current.items, now.items)) drawnNow.current = now;
  const onDrawn = (items: readonly TextItem[]) => {
    const l = latest.current;
    if (l && sameTexts(items, l.items)) drawnNow.current = l;
    setTick((t) => t + 1);
    // (drawn: the caption's own no longer - until they are kept or let go, when its own are drawn again: Captions2D)
    if (!left) store.getState().markCaptionDrawn(n);
  };
  const font = `${fs * zoom}px ${fontStack(opts.fontFamily ?? "Arial")}`;
  ed.layout = {
    places,
    shown,
    toScreen: (p: Pt) => ({ x: size.width / 2 + (p.x - cam.position.x) * zoom, y: size.height / 2 - (p.y - cam.position.y) * zoom }),
    linePx: fs * CAPTION_LINE * zoom,
    font,
    measure: (t: string) => measured(font, t),
  };

  /** Kept, or let go - once: drawn on as their caption now is, until its own are drawn. */
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const s = store.getState();
    // (the word last typed ended as they are kept)
    if (keep) ed.kept();
    const text = ed.text.replace(/\s+$/, "").replace(/^\s*\n/, "");
    // (the letters' marks within what is kept: what was cut off its end goes with it)
    const lead = ed.text.length - ed.text.replace(/^\s*\n/, "").length;
    const kept = marksOf(ed.styles.slice(lead, lead + text.length));
    // (the caption they are now - none, new ones let go or any written away)
    let still: number | null = edit.id;
    if (keep) {
      const half = (t: string) => {
        const r = captionSet(t, 0, 0, fs, set, caption?.width, caption?.align, kept);
        return { w: r.halfW, h: r.halfH };
      };
      const others = s.captions
        .filter((o) => o.id !== edit.id)
        .map((o) => {
          const r = wordsSet(o, opts, set);
          return { ...o, halfW: r.halfW, halfH: r.halfH };
        });
      const sameMarks = JSON.stringify(kept) === JSON.stringify(caption?.marks ?? []);
      if (edit.id == null && room && edit.shape != null) {
        // (new words in a shape: in it)
        if (text.trim()) still = s.addCaption(text, room.x, room.y, undefined, undefined, room.width, undefined, { size: own, marks: kept, shape: edit.shape });
      } else if (edit.id == null) {
        if (text.trim()) {
          const placed = captionPlace(edit.at, half(text), arrowsBeside(s, opts, set, edit.id), opts.fontPx, others);
          still = s.addCaption(text, placed.x, placed.y, placed.arrow, undefined, undefined, undefined, { size: own, marks: kept });
        }
      } else if (!text.trim()) {
        s.removeCaption(edit.id);
        still = null;
      } else if (caption && (text !== caption.text || !sameMarks || own !== caption.size)) {
        // (over an arrow: kept clear of it as it grows or shrinks; a box, its top where it was)
        const arrow = caption.arrow != null ? arrowsBeside(s, opts, set, edit.id).find((a) => a.id === caption.arrow) : undefined;
        const placed = arrow ? captionPlace({ x: caption.x, y: caption.y }, half(text), [arrow], opts.fontPx, others) : null;
        const y = top != null ? { y: top - half(text).h } : {};
        s.updateCaption(edit.id, { text, marks: kept, size: own ?? null, ...(placed ? { x: placed.x, y: placed.y, arrow: placed.arrow ?? null } : y) });
      }
    }
    s.leaveCaptionEdit(n, still);
  };
  const finishing = useRef(finish);
  finishing.current = finish;
  // a size larger or smaller, through the steps a size goes up and down by - from the labels' where it has none of its own
  const resize = (dir: 1 | -1) => {
    const label = opts.pointPx ? opts.fontPx / opts.pointPx : 10;
    const now = own ?? label;
    const to = dir > 0 ? WORDS_STEPS.find((p) => p > now + 1e-6) : [...WORDS_STEPS].reverse().find((p) => p < now - 1e-6);
    if (to == null) return;
    setOwn(Math.abs(to - label) < 1e-6 ? undefined : to);
    invalidate();
  };
  /** A key the words take besides an editor's: how their letters are set, their size, and their list. */
  const keyed = useRef<(e: KeyboardEvent) => boolean>(() => false);
  keyed.current = (e: KeyboardEvent): boolean => {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const k = e.key;
    // (+ and =, wherever a keyboard has them: lib/doc/shortcuts plusOrEquals)
    const plus = plusOrEquals(e) === "+";
    const equals = plusOrEquals(e) === "=";
    if (mod && !e.altKey && k.toLowerCase() === "b") ed.toggle("bold");
    else if (mod && !e.altKey && k.toLowerCase() === "i") ed.toggle("italic");
    else if (mod && !e.altKey && plus) ed.toggle("sup");
    else if (mod && !e.altKey && equals) ed.toggle("sub");
    else if (mod && e.shiftKey && (k === ">" || k === ".")) resize(1);
    else if (mod && e.shiftKey && (k === "<" || k === ",")) resize(-1);
    // (Tab: a list's items in or out a level - and elsewhere nothing, the keys kept by the words rather than gone to the window, which would keep them)
    else if (k === "Tab" && !mod && !e.altKey) ed.indent(e.shiftKey ? -1 : 1);
    else if (k === "Enter" && e.shiftKey && !mod && !e.altKey) ed.newLine();
    else return false;
    return true;
  };
  /** Where on the page a point of the screen is; and whether a point of the page is among the words, theirs to take. */
  const among = useRef((q: Pt) => Math.abs(q.x - at.x) <= halfW + margin && Math.abs(q.y - at.y) <= halfH + margin);
  among.current = (q: Pt) => Math.abs(q.x - at.x) <= halfW + margin && Math.abs(q.y - at.y) <= halfH + margin;
  const world = useRef((cx: number, cy: number): Pt => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  });
  /** The drag that opened them, selecting on: stopped as they go. */
  const dragging = useRef<(() => void) | null>(null);

  // the field: made as the words are written, given the keys, laid at the caret - gone with them
  useLayoutEffect(() => {
    if (left) return;
    const { field: f, dispose } = pageField(gl.domElement, ed, { label: "Text", lines: true, keep: () => finishing.current(true), letGo: () => finishing.current(false), key: (e) => keyed.current(e) });
    field.current = f;
    // (opened by a press among the words: the caret there - or, the press dragged on, what it selects)
    const press = edit.press;
    if (press) {
      const from = ed.pressAt(press.at, 1, false);
      if (press.drag) {
        const onMove = (m: PointerEvent) => ed.dragTo(world.current(m.clientX, m.clientY), from, 1);
        const onUp = () => {
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", onUp, true);
          field.current?.sync();
        };
        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onUp, true);
        dragging.current = () => {
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", onUp, true);
        };
      }
    }
    f.sync();
    return () => {
      dragging.current?.();
      dragging.current = null;
      dispose();
      field.current = null;
    };
    // (the press that opened them, once - as they open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed, gl, left]);

  // kept or let go: drawn no longer than a moment, whether or not their caption's own come
  useEffect(() => {
    if (!left) return;
    const t = window.setTimeout(() => {
      const s = store.getState();
      if (s.captionLeft?.n === n) s.captionShown(s.captionLeft.id);
    }, LEFT_MS);
    return () => window.clearTimeout(t);
  }, [left, n, store]);

  // drawn again as the words change and the view moves; a press among them theirs
  const caretRef = useWriting(ed, field, () => setTick((t) => t + 1));
  usePressAmong({ ed, field, among, world, seed: edit.press, off: left });

  // (lit as they open, and no longer as they are kept or let go)
  const light = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    const m = light.current;
    if (!m) return;
    const goal = left ? 0 : LIT;
    if (Math.abs(m.opacity - goal) < 1e-3) {
      m.opacity = goal;
      return;
    }
    m.opacity = follow(m.opacity, goal, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });

  // the caret, what is selected and what the IME has so far, as the words drawn have them
  const d = drawnNow.current;
  const out = d && !left ? writingMarks(d, { fs, lineH: fs * CAPTION_LINE, px, ink: opts.labelColor ?? "#000000", caretRef }) : [];
  const lit = d ?? now;
  return (
    <group>
      {/* lit round, as words under the pointer are */}
      <mesh position={[at.x, at.y, 0.04]} renderOrder={5}>
        <planeGeometry args={[2 * (lit.halfW + margin), 2 * (lit.halfH + margin)]} />
        <meshBasicMaterial ref={light} color={COLORS.highlight} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* (the type, made as it is first needed, waited for by what draws it: not by the field, which would be taken away meanwhile, and the keys with it) */}
      <group position={[at.x, at.y, 0]}>
        <WholeTexts2D texts={laid.items} onDrawn={onDrawn} />
      </group>
      {out}
    </group>
  );
}
