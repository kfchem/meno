/**
 * A text read in the column, drawn on the canvas (docs/PDF.md, *A text*,
 * *One canvas*): in the column's pass, as a PDF's pages are (PdfColumn) -
 * its lines pictures drawn in the system's type (TextEditor/linePictures),
 * numbered, only those in view, coloured by what the text is (lib/text/
 * colouring); the caret, what is selected and what the IME is composing
 * drawn over them. Its HTML half, over it, takes the
 * pointer and the keys (TextEditor/TextBody); the two share its editor
 * (TextEditor/columnText). In the column's units: CSS pixels from its body's
 * top left, down negative.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync, useFrame, useThree } from "@react-three/fiber";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { selFrom, selTo } from "../../../../lib/text/editing";
import { lineComposing } from "../../../../lib/text/field";
import { colouringFor } from "../../../../lib/text/colouring";
import { useKinds } from "../../../../lib/io/kinds";
import { useEditorStore } from "../store";
import type { WorkspaceText } from "../store/types";
import { columnText } from "../../TextEditor/columnText";
import { BAR_EDGE, BAR_PX, NUMBER_PAD, PAD_PX } from "../../TextEditor/editor";
import { BAND_PX, INK, LINE_PX, linePicture, PAPER, typeReady, xAt } from "../../TextEditor/linePictures";

/** The column of line numbers: its colour, and its numbers'. */
const GUTTER = "rgb(246, 248, 250)";
const NUMBER = "rgb(89, 99, 110)";
/** How plainly the scroll bars' thumbs show, in the numbers' colour. */
const BAR_SEEN = 0.4;
/** What is selected, lit as words selected in a PDF are; less, where the text has not the keys. */
const SELECTED = 0.3;
const SELECTED_AWAY = 0.15;
/** How wide what is missing is marked, in px: a letter's width, about. */
const WRONG_LEAST_PX = 8;
/** The caret: how wide, and how long it shows and hides - steadily, a moment after a key. */
const CARET_PX = 2;
const BLINK_MS = 530;

/** `hidden`, its sheet only: its lines are on their way into the column, or back to the page (TextFlight). */
export default function ColumnText({ text, hidden = false }: { text: WorkspaceText; hidden?: boolean }) {
  const store = useEditorStore();
  const entry = columnText(store, text.id, text.text);
  const ed = entry.ed;
  const { invalidate } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);
  // (a box's middle, from its top left - its edges on the screen's pixels)
  const at = (x: number, top: number, w: number, h: number): [number, number, number] => [Math.round(x * dpr) / dpr + w / 2, -(Math.round(top * dpr) / dpr + h / 2), 0];
  const [, setTick] = useState(0);
  const [typeIn, setTypeIn] = useState(false);
  useEffect(() => {
    void typeReady().then(() => setTypeIn(true));
  }, []);
  useEffect(() => {
    // (drawn again before the next frame, once for all a task changed: an update made in an event React
    // does not know - an EditContext's textupdate - would wait otherwise for a task after that frame)
    let due = false;
    entry.redraw = () => {
      if (!due) {
        due = true;
        queueMicrotask(() => {
          due = false;
          flushSync(() => setTick((t) => t + 1));
        });
      }
      invalidate();
    };
    return () => {
      entry.redraw = () => {};
    };
  }, [entry, invalidate]);
  // (the caret blinking, while the text has the keys)
  useEffect(() => {
    const t = window.setInterval(() => ed.focused && invalidate(), BLINK_MS / 2);
    return () => window.clearInterval(t);
  }, [ed, invalidate]);
  const caretRef = useRef<THREE.Mesh>(null);
  // (the scroll bars' thumbs: in and out of view as the text outgrows its view, or fits it again)
  const bars = useRef({ v: 0, h: 0 });
  const barMats = useRef<{ v: THREE.MeshBasicMaterial | null; h: THREE.MeshBasicMaterial | null }>({ v: null, h: null });
  useFrame((_, dt) => {
    // (the column of numbers easing to the width its last number needs: all drawn again at each step)
    if (ed.easeGutter(dt)) ed.onChange();
    const t = ed.thumbs;
    for (const k of ["v", "h"] as const) {
      const to = t[k] ? 1 : 0;
      const n = follow(bars.current[k], to, Math.min(dt, 1 / 20), TAU.quick);
      bars.current[k] = Math.abs(n - to) < 0.01 ? to : n;
      const m = barMats.current[k];
      if (m) m.opacity = BAR_SEEN * bars.current[k];
      if (bars.current[k] !== to) invalidate();
    }
  });
  useFrame(() => {
    const since = performance.now() - ed.stirred;
    if (caretRef.current) caretRef.current.visible = ed.focused && (since < BLINK_MS || Math.floor(since / BLINK_MS) % 2 === 0);
  });

  // (coloured as what it is told to be by its name, or by what it held as it came - again as plugins are added or taken away)
  const told = useKinds();
  // (drawn again once a plugin's grammar has been made into a parser)
  const colouring = useMemo(() => colouringFor(text.name, ed.text, told.kinds, told.texts, () => entry.redraw()), [text.name, ed, told, entry]);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => plane.dispose(), [plane]);
  if (!typeIn || hidden) return null;
  const first = Math.max(0, Math.floor(ed.scrollTop / LINE_PX));
  const last = Math.min(ed.lines.count - 1, Math.floor((ed.scrollTop + ed.viewH) / LINE_PX));
  const gutter = ed.gutter;
  const left = gutter + PAD_PX - ed.scrollLeft;
  const comp = ed.composing;
  const compLine = comp ? ed.lines.at(comp.from) : -1;
  const out: ReactNode[] = [];
  const box = (key: string, x: number, top: number, w: number, h: number, color: string, opacity: number, order: number) =>
    out.push(
      <mesh key={key} geometry={plane} position={at(x, top, w, h)} scale={[w, h, 1]} renderOrder={order}>
        <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  const from = selFrom(ed.sel);
  const to = selTo(ed.sel);
  for (let i = first; i <= last; i++) {
    const top = ed.topOf(i);
    const start = ed.lines.start(i);
    const end = ed.lines.end(i);
    let line = ed.lines.line(i);
    // (what the IME has so far, in place of what it takes the place of - uncoloured, while it is)
    const composingHere = i === compLine && !!comp;
    if (composingHere) line = lineComposing(line, start, comp);
    const spans = composingHere ? [] : (colouring?.spans(ed.lines, i) ?? []);
    for (let band = Math.max(0, Math.floor(ed.scrollLeft / BAND_PX)); band * BAND_PX < ed.scrollLeft + ed.viewW; band++) {
      const p = linePicture(line, band, dpr, INK, PAPER, spans);
      if (!p) break;
      out.push(
        <mesh key={`l${i}:${band}`} geometry={plane} position={at(left + band * BAND_PX, top, p.w, p.h)} scale={[p.w, p.h, 1]} renderOrder={0}>
          <meshBasicMaterial map={p.texture} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
    }
    // (what does not read as the text's grammar says, underlined - not on the line being written, until it is left)
    if (colouring && !composingHere && !(ed.focused && ed.lines.at(ed.sel.head) === i)) {
      colouring.wrong(ed.lines, i).forEach((w, k) => {
        const x0 = ed.xOf(start + w.from);
        const x1 = Math.max(ed.xOf(start + w.to), x0 + WRONG_LEAST_PX);
        box(`w${i}:${k}`, x0, top + LINE_PX - 3, x1 - x0, 2, COLORS.attention, 1, 2);
      });
    }
    // (what is selected on the line - and past its end, where it goes on to the next)
    if (!comp && from !== to && from <= end && to > start) {
      const a = Math.max(from, start);
      const b = Math.min(to, end);
      const x0 = ed.xOf(a);
      const x1 = ed.xOf(b) + (to > end ? 6 : 0);
      box(`s${i}`, x0, top, Math.max(1, x1 - x0), LINE_PX, COLORS.highlight, ed.focused ? SELECTED : SELECTED_AWAY, 1);
    }
    if (i === compLine && comp) {
      // (underlined, clause by clause as the system says - the one being converted thick - or else
      // all of it, and what the IME has selected in it more strongly; a gap between clauses)
      const xIn = (k: number) => left + xAt(line, comp.from - start + k);
      const clauses = comp.clauses?.length ? comp.clauses : [{ from: 0, to: comp.text.length, thick: false }];
      clauses.forEach((c, k) => {
        const x0 = xIn(c.from) + (k > 0 ? 1 : 0);
        const x1 = xIn(c.to) - (k < clauses.length - 1 ? 1 : 0);
        box(`u${k}`, x0, top + LINE_PX - (c.thick ? 4 : 3), Math.max(1, x1 - x0), c.thick ? 2 : 1, INK, 1, 2);
      });
      const [a, b] = comp.sel;
      if (!comp.clauses?.length && b > a) box("U", xIn(a), top + LINE_PX - 4, Math.max(1, xIn(b) - xIn(a)), 2, INK, 1, 2);
    }
  }
  // the caret - in what the IME has so far, where it says
  const caretLine = comp ? compLine : ed.lines.at(ed.sel.head);
  if (caretLine >= first && caretLine <= last && (!comp || comp.sel[0] === comp.sel[1])) {
    const start = ed.lines.start(caretLine);
    const x = comp ? left + xAt(ed.lines.line(caretLine).slice(0, comp.from - start) + comp.text, comp.from - start + comp.sel[0]) : ed.xOf(ed.sel.head);
    out.push(
      <mesh key="caret" ref={caretRef} geometry={plane} position={at(x - CARET_PX / 2, ed.topOf(caretLine) + 1, CARET_PX, LINE_PX - 2)} scale={[CARET_PX, LINE_PX - 2, 1]} renderOrder={3}>
        <meshBasicMaterial color={INK} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  }
  // the line numbers, over what has scrolled under them
  box("gutter", 0, 0, gutter, ed.viewH, GUTTER, 1, 4);
  for (let i = first; i <= last; i++) {
    const p = linePicture(String(i + 1), 0, dpr, NUMBER, GUTTER);
    if (!p) continue;
    out.push(
      <mesh key={`n${i}`} geometry={plane} position={at(gutter - NUMBER_PAD - p.w, ed.topOf(i), p.w, p.h)} scale={[p.w, p.h, 1]} renderOrder={5}>
        <meshBasicMaterial map={p.texture} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  }
  // the scroll bars: a thumb down the right edge, and along the bottom beside the numbers
  const thumbs = ed.thumbs;
  const v = thumbs.v ?? { start: 0, len: 0 };
  const h = thumbs.h ?? { start: 0, len: 0 };
  const vAt = at(ed.viewW - BAR_EDGE - BAR_PX, v.start, BAR_PX, v.len);
  const hAt = at(h.start, ed.viewH - BAR_EDGE - BAR_PX, h.len, BAR_PX);
  out.push(
    <mesh key="barV" geometry={plane} position={vAt} scale={[BAR_PX, v.len || 1, 1]} visible={!!thumbs.v || bars.current.v > 0} renderOrder={6}>
      <meshBasicMaterial ref={(m) => void (barMats.current.v = m)} color={NUMBER} transparent opacity={BAR_SEEN * bars.current.v} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>,
    <mesh key="barH" geometry={plane} position={hAt} scale={[h.len || 1, BAR_PX, 1]} visible={!!thumbs.h || bars.current.h > 0} renderOrder={6}>
      <meshBasicMaterial ref={(m) => void (barMats.current.h = m)} color={NUMBER} transparent opacity={BAR_SEEN * bars.current.h} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>,
  );
  return <>{out}</>;
}
