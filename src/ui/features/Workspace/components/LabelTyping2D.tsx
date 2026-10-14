/**
 * An atom's label written in place (docs/EDITOR-2D.md, *Labels typed in
 * place*), drawn by Meno as words on the page are (CaptionTyping2D): set as
 * a label is set, in the drawing's typeface at its size, its first letter on
 * the atom - a two-letter symbol's middle - over a light of its own that
 * hides the label it had; with the caret, what is selected and what the IME
 * composes drawn over it. Typed through the field words on the page are
 * typed through (pageField), laid at the caret, so that the IME's
 * candidates show there.
 *
 * Begun by a click on an atom, or by typing a letter over one (the letter
 * it begins with). Enter keeps it, Escape lets it go, and a press elsewhere
 * keeps it too; a click in it puts the caret, two select a word, a drag
 * selects on. Kept, it is drawn as written until the drawing's own label is
 * drawn in its place (`labelLeft`), then goes - as one let go goes - in a
 * moment, the label under it coming through.
 */
import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CAPTION_LINE, captionPlaces, captionRuns, captionSet } from "../../../../lib/chem/captions";
import { fontStack, labelBox, labelSetOf, runsWidth, sameTexts, type TextItem } from "../../../../lib/chem/layout2d";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import type { TypingField } from "../../TextEditor/typingField";
import { useEditor, useEditorStore } from "../store";
import { keptLabel, liveLabel } from "../../../../lib/chem/smartLabel";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { labelKey, labelReading } from "../utils/labelTyping";
import { LabelWords } from "../utils/labelWords";
import { pageAt } from "../utils/page";
import { useDrawnLayout, useDrawnZoom } from "./drawnLayoutContext";
import { WholeTexts2D } from "./Labels2D";
import { pageField } from "./pageField";
import { overWhite } from "./selectionShade";
import { measured, usePressAmong, useWriting, writingMarks, type WritingDrawn } from "./writing";

type Pt = { x: number; y: number };

/** The light it is written on, as words being written are lit, laid over the white page: it hides the label it had. */
const LIGHT = overWhite(COLORS.highlight, 0.16);
/** How far round the letters - the new and the old - the light reaches, in ems; how round its corners are. */
const PAD = 0.18;
const ROUND = 0.25;
/** Over the drawing's labels (Labels2D, 30): its light, then its letters. */
const LIGHT_ORDER = 34;
const TEXT_ORDER = 35;
/** How long it is drawn at most, kept, waiting for the drawing's own label; and how long it takes to go. */
const LEFT_MS = 500;
const GO_MS = 160;

/** A label being written (`typing`), kept and waiting for the drawing's own (`left`), or going (`gone`, since when). */
type Session = { n: number; atomId: number; phase: "typing" | "left" | "gone"; since?: number };

export default function LabelTyping2D() {
  const store = useEditorStore();
  const edit = useEditor((s) => s.labelEdit);
  const left = useEditor((s) => s.labelLeft);
  const hoveredAtom = useEditor((s) => s.hovered.atomId);
  const [, setTick] = useState(0);

  // a letter typed over an atom begins its label with it
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (edit.active || hoveredAtom == null) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // (typing into a box elsewhere - a setting beside the canvas - is not typing a label)
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.dataset.textField != null)) return;
      const ch = labelKey(e);
      if (!ch) return;
      // (the letter as typed: what it is read as, the label's to say)
      store.getState().beginLabelEdit(hoveredAtom, ch);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hoveredAtom, edit.active, store]);

  // those written, each kept on - the same, written, kept and going - until gone
  const sessions = useRef(new Map<number, Session>());
  const live = new Map<number, Session>();
  if (left) live.set(left.n, { n: left.n, atomId: left.atomId, phase: "left" });
  if (edit.active && edit.n != null && edit.atomId != null) live.set(edit.n, { n: edit.n, atomId: edit.atomId, phase: "typing" });
  const now = performance.now();
  for (const [n, s] of sessions.current) if (!live.has(n) && s.phase !== "gone") sessions.current.set(n, { ...s, phase: "gone", since: now });
  for (const [n, s] of live) sessions.current.set(n, s);
  for (const [n, s] of sessions.current) if (s.phase === "gone" && now - (s.since ?? now) > GO_MS + 40) sessions.current.delete(n);
  const going = [...sessions.current.values()].some((s) => s.phase === "gone");
  useEffect(() => {
    if (!going) return;
    const t = window.setTimeout(() => setTick((k) => k + 1), GO_MS + 60);
    return () => window.clearTimeout(t);
  });
  // (kept: drawn no longer than a moment, whether or not the drawing's own label comes)
  useEffect(() => {
    if (!left) return;
    const t = window.setTimeout(() => {
      if (store.getState().labelLeft?.n === left.n) store.getState().labelShown();
    }, LEFT_MS);
    return () => window.clearTimeout(t);
  }, [left, store]);

  return (
    <>
      {[...sessions.current.values()].map((s) => (
        <Typing key={s.n} session={s} />
      ))}
    </>
  );
}

/** One label written in place. */
function Typing({ session }: { session: Session }) {
  const { n, atomId, phase } = session;
  const store = useEditorStore();
  const { opts, atoms, layout } = useDrawnLayout();
  const { camera, gl, size, invalidate } = useThree();
  const [, setTick] = useState(0);
  const [ed] = useState(() => {
    const e = new LabelWords(store.getState().labelEdit.value);
    // (as it is typed: its letters' case as they are meant - nh2 NH2 - or, so set, as typed)
    e.reading = (t) => (useAppSettings.getState().labels.smart ? liveLabel(t, labelReading) : t);
    e.read();
    return e;
  });
  const field = useRef<TypingField | null>(null);
  const done = useRef(false);
  const typing = phase === "typing";

  // where its atom is - or was, gone from under it
  const index = atoms.findIndex((a) => a.id === atomId);
  const was = useRef<Pt>({ x: 0, y: 0 });
  if (index >= 0) was.current = { x: atoms[index].x, y: atoms[index].y };
  const at = was.current;
  const fs = opts.fontPx;
  const set = useMemo(() => labelSetOf(opts), [opts]);
  const cam = camera as THREE.OrthographicCamera;
  // (the view's zoom as the drawing takes it up: drawn again as it changes - drawnLayoutContext `useDrawnZoom`)
  const zoom = useDrawnZoom();
  const px = 1 / zoom;

  // the label as it is drawn: what the IME has so far in place of what it replaces
  const c = typing ? ed.composing : null;
  const text = ed.text;
  const shownText = c ? text.slice(0, c.from) + c.text + text.slice(c.to) : text;
  // (its first letter on the atom - a two-letter symbol's middle - as the drawing sets a label)
  const first = [...shownText][0];
  const whole = runsWidth(captionRuns(shownText), fs, set);
  const mid = { x: /^[A-Z][a-z]$/.test(shownText) || !first ? at.x : at.x - runsWidth([{ text: first }], fs, set) / 2 + whole / 2, y: at.y };
  const laid = captionSet(shownText, 0, 0, fs, set);
  const places = captionPlaces(text, mid.x, mid.y, fs, set);
  const shown = c ? captionPlaces(shownText, mid.x, mid.y, fs, set) : places;
  // the light it is written on: round what it says, and round the label it had - its charge, set beside it, too
  const room = (() => {
    const pad = PAD * fs;
    let x0 = mid.x - Math.max(laid.halfW, fs * 0.3);
    let x1 = mid.x + Math.max(laid.halfW, fs * 0.3);
    let y0 = mid.y - Math.max(laid.halfH, fs * 0.5);
    let y1 = mid.y + Math.max(laid.halfH, fs * 0.5);
    for (const t of layout.texts) {
      if (index < 0 || (t.beside ? t.markOf : t.atom) !== index) continue;
      const b = labelBox(t, fs, set);
      x0 = Math.min(x0, t.x - b.left);
      x1 = Math.max(x1, t.x + b.right);
      y0 = Math.min(y0, t.y - b.bottom);
      y1 = Math.max(y1, t.y + b.top);
    }
    return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
  })();

  // what is drawn: the caret and what is selected as the letters drawn have them - those last given, until they are drawn
  const latest = useRef<WritingDrawn | null>(null);
  const drawnNow = useRef<WritingDrawn | null>(null);
  const nowDrawn: WritingDrawn = { items: laid.items, places, shown, sel: ed.sel, c, halfW: laid.halfW, halfH: laid.halfH };
  latest.current = nowDrawn;
  if (drawnNow.current && sameTexts(drawnNow.current.items, nowDrawn.items)) drawnNow.current = nowDrawn;
  const onDrawn = (items: readonly TextItem[]) => {
    const l = latest.current;
    if (l && sameTexts(items, l.items)) drawnNow.current = l;
    setTick((t) => t + 1);
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

  /** Kept, or let go - once, while it is still this edit's to keep. */
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const s = store.getState();
    if (!s.labelEdit.active || s.labelEdit.n !== n) return;
    if (keep) {
      // (as it is kept: as it reads from its bond - aco OAc - its italic prefixes hyphenated - tbu t-Bu)
      s.setLabelEditValue(useAppSettings.getState().labels.smart ? keptLabel(ed.typed, labelReading) : ed.typed);
      s.commitLabelEdit(ed.typed);
    } else s.cancelLabelEdit();
  };
  const finishing = useRef(finish);
  finishing.current = finish;
  // (as it is typed: the edit's own, for what reads it meanwhile)
  useEffect(() => {
    const s = store.getState();
    if (typing && !ed.composing && s.labelEdit.active && s.labelEdit.n === n && s.labelEdit.value !== ed.text) s.setLabelEditValue(ed.text);
  });
  // its atom gone: let go
  useEffect(() => {
    if (typing && index < 0) finishing.current(false);
  }, [typing, index]);

  const among = useRef((q: Pt) => q.x >= room.x0 && q.x <= room.x1 && q.y >= room.y0 && q.y <= room.y1);
  among.current = (q: Pt) => q.x >= room.x0 && q.x <= room.x1 && q.y >= room.y0 && q.y <= room.y1;
  const world = useRef((cx: number, cy: number): Pt => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  });

  // the field: made as it is written, given the keys, laid at the caret - gone once it is kept or let go
  useLayoutEffect(() => {
    if (!typing) return;
    const { field: f, dispose } = pageField(gl.domElement, ed, { label: "Label", lines: false, keep: () => finishing.current(true), letGo: () => finishing.current(false) });
    field.current = f;
    f.sync();
    return () => {
      dispose();
      field.current = null;
    };
  }, [ed, gl, typing]);
  const caretRef = useWriting(ed, field, () => setTick((t) => t + 1));
  usePressAmong({ ed, field, among, world, off: !typing });

  // seen as it begins, until it goes - a moment either way - the letters and their light together
  const level = useRef(0);
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    const goal = phase === "gone" ? 0 : 1;
    if (Math.abs(level.current - goal) < 1e-3) level.current = goal;
    else {
      level.current = follow(level.current, goal, Math.min(dt, 1 / 20), TAU.quick);
      invalidate();
    }
    if (light.current) light.current.opacity = level.current;
    group.current?.traverse((o) => {
      if ("fillOpacity" in o) (o as unknown as { fillOpacity: number }).fillOpacity = level.current;
    });
  });

  const d = drawnNow.current;
  const marks: ReactNode[] = d && typing ? writingMarks(d, { fs, lineH: fs * CAPTION_LINE, px, ink: opts.labelColor ?? "#000000", caretRef, z: 0.07, text: TEXT_ORDER }) : [];
  const w = room.x1 - room.x0;
  const h = room.y1 - room.y0;
  const shape = useMemo(() => roundedRect(w, h, Math.min(ROUND * fs, w / 2, h / 2)), [w, h, fs]);
  useEffect(() => () => shape.dispose(), [shape]);
  return (
    <group ref={group}>
      <mesh position={[(room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, 0.065]} renderOrder={LIGHT_ORDER} geometry={shape}>
        <meshBasicMaterial ref={light} color={LIGHT} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <group position={[mid.x, mid.y, 0.07]}>
        <WholeTexts2D texts={laid.items} onDrawn={onDrawn} renderOrder={TEXT_ORDER} />
      </group>
      {marks}
    </group>
  );
}

/** A rectangle `w` by `h` about its middle, its corners rounded `r`. */
function roundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 6);
}
