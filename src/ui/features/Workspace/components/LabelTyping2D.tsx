/**
 * An atom's label written in place (docs/EDITOR-2D.md, *Labels typed in
 * place*), drawn by Meno as words on the page are (CaptionTyping2D): set as
 * a label is set, in the drawing's typeface at its size, its first letter on
 * the atom - a two-letter symbol's middle - with the caret, what is
 * selected and what the IME composes drawn over it, and nothing under it:
 * the drawing draws no label for the atom meanwhile, its bonds making room
 * for what is written as they would for the label (DrawnLayout). Typed
 * through the field words on the page are typed through (pageField), laid
 * at the caret, so that the IME's candidates show there.
 *
 * Begun by typing a letter over an atom - the letter growing out of the
 * atom as its bonds draw back - or from the atom's menu, *Edit label*, with
 * what it says. Enter keeps it, and so does the pointer leaving the atom
 * and its letters or a press elsewhere; Escape lets it go, the letters
 * drawing back into the atom as the label it had comes back. A click in it
 * puts the caret, two select a word, a drag selects on. Kept, it is drawn
 * as written until the drawing's own label is drawn in its place
 * (`labelLeft`), then goes in a moment, the label under it coming through.
 */
import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CAPTION_LINE, captionPlaces } from "../../../../lib/chem/captions";
import { fontStack, labelSetOf, sameTexts, type TextItem } from "../../../../lib/chem/layout2d";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { easeOut } from "../../../theme/motion";
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
import { leaveWatch, pastLabel } from "../utils/labelLeave";
import { WRITE_MS, writtenLetters } from "../utils/writtenLetters";
import { measured, usePressAmong, useWriting, writingMarks, type WritingDrawn } from "./writing";

type Pt = { x: number; y: number };

/** How far round the letters a click among them is theirs, in ems. */
const PAD = 0.18;
/** Over the drawing's labels (Labels2D, 30). */
const TEXT_ORDER = 35;
/** How long it is drawn at most, kept, waiting for the drawing's own label; and how long it takes to go, kept. */
const LEFT_MS = 500;
const GO_MS = 160;
/** How large its first letter is as it begins to grow out of the atom - and as it draws back into it, let go. */
const GROWN_FROM = 0.4;

/**
 * A label being written (`typing`, since it began), kept and waiting for
 * the drawing's own (`left`), or going (`gone`, since when, and how it
 * ended); `grow`, begun by a letter typed over the atom.
 */
type Session = { n: number; atomId: number; phase: "typing" | "left" | "gone"; begun: number; grow: boolean; since?: number; how?: "kept" | "same" | "cancelled" };

/** Where the pointer was last in the window: where a label begun by a key finds it. */
const pointer: { x: number | null; y: number | null } = { x: null, y: null };
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    },
    true,
  );
}

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

  // a label kept by Enter: an Enter straight after draws it out (docs/EDITOR-2D.md, *Labels typed in place*) - any other key, or a press,
  // first, and it is left as it is
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.getState();
      if (!s.labelKept || e.repeat || e.isComposing) return;
      const enter = e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
      if (s.keyAfterLabel(enter) && enter) e.preventDefault();
    };
    const onPress = () => store.getState().forgetLabelKept();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPress, true);
    };
  }, [store]);

  // those written, each kept on - the same, written, kept and going - until gone
  const sessions = useRef(new Map<number, Session>());
  const ended = useEditor((s) => s.labelEnd);
  const live = new Map<number, Session>();
  const now = performance.now();
  const known = (n: number) => sessions.current.get(n);
  if (left) live.set(left.n, { n: left.n, atomId: left.atomId, phase: "left", begun: known(left.n)?.begun ?? now, grow: known(left.n)?.grow ?? false });
  if (edit.active && edit.n != null && edit.atomId != null) live.set(edit.n, { n: edit.n, atomId: edit.atomId, phase: "typing", begun: edit.opened?.at ?? now, grow: !!edit.grow });
  for (const [n, s] of sessions.current) {
    if (live.has(n) || s.phase === "gone") continue;
    // (kept and drawn: gone as the drawing's own label is there; else as the edit ended)
    const how = s.phase === "left" ? "kept" : ended?.n === n ? ended.how : "cancelled";
    sessions.current.set(n, { ...s, phase: "gone", since: now, how });
  }
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
  const sessionNow = useRef(session);
  sessionNow.current = session;
  const store = useEditorStore();
  const { opts, atoms, layout } = useDrawnLayout();
  const { camera, gl, size, invalidate } = useThree();
  const [, setTick] = useState(0);
  const [ed] = useState(() => {
    const e = new LabelWords(store.getState().labelEdit.value);
    // (as it is typed: its letters' case as they are meant - nh2 NH2 - or, so set, as typed)
    e.reading = (t) => (useAppSettings.getState().labels.smart ? liveLabel(t, labelReading) : t);
    e.read();
    // (from the atom's menu on a carbon drawn as a corner: what it says, selected, to be typed over)
    if (store.getState().labelEdit.selectAll) e.sel = { anchor: 0, head: e.text.length };
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
  // (its first letter on the atom - a two-letter symbol's middle - as the drawing sets a label: utils/writtenLetters, as its bonds make room for it)
  const { laid, dx } = writtenLetters(shownText, fs, set);
  const mid = { x: at.x + dx, y: at.y };
  const places = captionPlaces(text, mid.x, mid.y, fs, set);
  const shown = c ? captionPlaces(shownText, mid.x, mid.y, fs, set) : places;
  // where a click is among its letters
  const room = (() => {
    const pad = PAD * fs;
    const x0 = mid.x - Math.max(laid.halfW, fs * 0.3);
    const x1 = mid.x + Math.max(laid.halfW, fs * 0.3);
    const y0 = mid.y - Math.max(laid.halfH, fs * 0.5);
    const y1 = mid.y + Math.max(laid.halfH, fs * 0.5);
    return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
  })();
  void layout;

  // what is drawn: the caret and what is selected as the letters drawn have them - those last given, until they are drawn
  const latest = useRef<WritingDrawn | null>(null);
  const drawnNow = useRef<WritingDrawn | null>(null);
  const nowDrawn: WritingDrawn = { items: laid.items, places, shown, sel: ed.sel, c, halfW: laid.halfW, halfH: laid.halfH };
  latest.current = nowDrawn;
  if (drawnNow.current && sameTexts(drawnNow.current.items, nowDrawn.items)) drawnNow.current = nowDrawn;
  // (when its letters were first drawn: what grows out of the atom grows from then, not while they are being set)
  const shownSince = useRef<number | null>(null);
  const onDrawn = (items: readonly TextItem[]) => {
    shownSince.current ??= performance.now();
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
  const finish = (keep: boolean, byEnter = false) => {
    if (done.current) return;
    done.current = true;
    const s = store.getState();
    if (!s.labelEdit.active || s.labelEdit.n !== n) return;
    if (keep) {
      // (as it is kept: as it reads from its bond - aco OAc - its italic prefixes hyphenated - tbu t-Bu)
      s.setLabelEditValue(useAppSettings.getState().labels.smart ? keptLabel(ed.typed, labelReading) : ed.typed);
      s.commitLabelEdit(ed.typed, byEnter);
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
    const { field: f, dispose } = pageField(gl.domElement, ed, { label: "Label", lines: false, keep: (byEnter) => finishing.current(true, byEnter), letGo: () => finishing.current(false) });
    field.current = f;
    f.sync();
    return () => {
      dispose();
      field.current = null;
    };
  }, [ed, gl, typing]);
  const caretRef = useWriting(ed, field, () => setTick((t) => t + 1));
  usePressAmong({ ed, field, among, world, off: !typing });

  // the pointer leaving it keeps it: where it is is followed by how far it moves, not by the view moving under it
  const area = useRef({ at, room });
  area.current = { at, room };
  useEffect(() => {
    if (!typing) return;
    const L = NOMINAL_BOND_LENGTH;
    const past = (p: Pt) => pastLabel(p, area.current.at, area.current.room, L);
    let last = pointer.x != null && pointer.y != null ? { x: pointer.x, y: pointer.y } : null;
    let q = last ? world.current(last.x, last.y) : null;
    // (from a key over the atom, there already; from its menu, once it comes to it)
    const watch = leaveWatch({ keep: () => finishing.current(true), L, armed: !!q && past(q) === 0 });
    const onMove = (e: PointerEvent) => {
      const z = (camera as THREE.OrthographicCamera).zoom || 1;
      if (q && last) q = { x: q.x + (e.clientX - last.x) / z, y: q.y - (e.clientY - last.y) / z };
      else q = world.current(e.clientX, e.clientY);
      last = { x: e.clientX, y: e.clientY };
      watch.point(past(q), e.buttons !== 0);
    };
    const onOut = (e: PointerEvent) => watch.out(e.buttons !== 0);
    const canvas = gl.domElement;
    window.addEventListener("pointermove", onMove, true);
    canvas.addEventListener("pointerleave", onOut);
    return () => {
      watch.stop();
      window.removeEventListener("pointermove", onMove, true);
      canvas.removeEventListener("pointerleave", onOut);
    };
  }, [typing, camera, gl]);

  // seen as it begins - begun by a letter, growing out of the atom - until it goes: kept, in a moment; let go, drawing back into the atom
  const group = useRef<THREE.Group>(null);
  const scaled = useRef<THREE.Group>(null);
  const opacity = useRef(0);
  // (gone from the page: the frame drawn again without it - the canvas draws only as asked)
  useEffect(() => () => invalidate(), [invalidate]);
  useFrame(() => {
    const s = sessionNow.current;
    const t = performance.now();
    // (nothing drawn a while on - nothing to draw: from when it began)
    const from = shownSince.current ?? (t - s.begun > 300 ? s.begun : null);
    const grown = from == null ? 0 : easeOut(Math.min(1, (t - Math.max(s.begun, from)) / WRITE_MS));
    let seen = grown;
    let size = s.grow ? GROWN_FROM + (1 - GROWN_FROM) * grown : 1;
    let moving = from == null || grown < 1;
    if (s.phase === "gone") {
      const ms = s.how === "kept" ? GO_MS : WRITE_MS;
      const gone = easeOut(Math.min(1, (t - (s.since ?? t)) / ms));
      seen = Math.min(seen, 1 - gone);
      if (s.how === "cancelled" && s.grow) size = Math.min(size, GROWN_FROM + (1 - GROWN_FROM) * (1 - gone));
      moving = gone < 1;
    }
    scaled.current?.scale.setScalar(size);
    opacity.current = seen;
    group.current?.traverse((o) => {
      if ("fillOpacity" in o) (o as unknown as { fillOpacity: number }).fillOpacity = seen;
    });
    if (moving) invalidate();
  });

  const d = drawnNow.current;
  const marks: ReactNode[] = d && typing ? writingMarks(d, { fs, lineH: fs * CAPTION_LINE, px, ink: opts.labelColor ?? "#000000", caretRef, z: 0.07, text: TEXT_ORDER }) : [];
  // (about the atom: what grows out of it, and draws back into it)
  return (
    <group ref={group} position={[at.x, at.y, 0]}>
      <group ref={scaled}>
        <group position={[-at.x, -at.y, 0]}>
          <group position={[mid.x, mid.y, 0.07]}>
            <WholeTexts2D texts={laid.items} onDrawn={onDrawn} renderOrder={TEXT_ORDER} opacity={opacity} />
          </group>
          {marks}
        </group>
      </group>
    </group>
  );
}
