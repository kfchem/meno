/**
 * What words written in place on the page share - words on the page
 * (CaptionTyping2D), an atom's label (LabelTyping2D): the caret, what is
 * selected and what the IME composes, drawn as the words drawn have them;
 * drawing again as the editor changes and the view moves, the caret
 * blinking; and a press among them - the caret there, two clicks a word,
 * three a line, a drag selecting on - the field keeping the keys.
 */
import * as THREE from "three";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { flushSync, useFrame, useThree } from "@react-three/fiber";
import type { CaptionPlaces } from "../../../../lib/chem/captions";
import type { TextItem } from "../../../../lib/chem/layout2d";
import { selFrom, selTo, type Sel } from "../../../../lib/text/editing";
import { COLORS } from "../../../theme/colors";
import type { Composing } from "../../TextEditor/editor";
import type { TypingField } from "../../TextEditor/typingField";
import { fieldTarget, useTextMenu } from "../../TextEditor/textMenu";
import type { WordsEditor } from "../utils/wordsEditor";
import type { CaptionPress } from "../store/types";

type Pt = { x: number; y: number };

/** What is selected, lit as in the column. */
const SELECTED = 0.3;
/** The caret: how wide on the screen, in pixels, and how long it shows and hides - steadily, a moment after a key. */
const CARET_PX = 1.5;
export const BLINK_MS = 530;
/** Two presses this near in time and place are two clicks: in ms, and in pixels. */
const CLICKS_MS = 500;
const CLICKS_PX = 4;

/** What is drawn of words being written: their letters - about their middle - where each place lies, what is selected and composed, and how far they reach. */
export type WritingDrawn = { items: readonly TextItem[]; places: CaptionPlaces; shown: CaptionPlaces; sel: Sel; c: Composing | null; halfW: number; halfH: number };

let measurer: CanvasRenderingContext2D | null = null;
/** How wide a text is set in a CSS font, in the screen's pixels. */
export function measured(font: string, text: string): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * 8;
  measurer.font = font;
  return measurer.measureText(text).width;
}

/**
 * The caret, what is selected - line by line - and what the IME has so far,
 * underlined clause by clause where the system says, the one converted
 * thick: as `d`, the words drawn, have them. `fs` is the type's size,
 * `lineH` a line's height, `px` a pixel of the screen on the page.
 */
export function writingMarks(d: WritingDrawn, o: { fs: number; lineH: number; px: number; ink: string; caretRef: RefObject<THREE.Mesh | null>; z?: number; text?: number }): ReactNode[] {
  const { fs, lineH, px, ink, caretRef } = o;
  const z = o.z ?? 0.05;
  // (drawn in order with the letters: what is selected under them, the rest over them)
  const text = o.text ?? 30;
  const out: ReactNode[] = [];
  const box = (key: string, x0: number, x1: number, y: number, h: number, color: string, opacity: number, order: number, ref?: RefObject<THREE.Mesh | null>) =>
    out.push(
      <mesh key={key} ref={ref} position={[(x0 + x1) / 2, y, z]} scale={[Math.max(px, x1 - x0), h, 1]} renderOrder={order}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  const dc = d.c;
  const from = selFrom(d.sel);
  const to = selTo(d.sel);
  if (!dc && to > from) {
    const a = d.places.at[from];
    const b = d.places.at[to];
    for (let i = a.line; i <= b.line; i++) {
      const l = d.places.lines[i];
      box(`s${i}`, i === a.line ? a.x : l.x0, i === b.line ? b.x : l.x1 + fs * 0.25, l.y, lineH, COLORS.highlight, SELECTED, text - 0.5);
    }
  }
  if (dc) {
    const clauses = dc.clauses?.length ? dc.clauses : [{ from: 0, to: dc.text.length, thick: false }];
    clauses.forEach((k, n) => {
      const a = d.shown.at[dc.from + k.from];
      const b = d.shown.at[dc.from + k.to];
      for (let i = a.line; i <= b.line; i++) {
        const l = d.shown.lines[i];
        const x0 = (i === a.line ? a.x : l.x0) + (n > 0 ? px : 0);
        const x1 = (i === b.line ? b.x : l.x1) - (n < clauses.length - 1 ? px : 0);
        const thick = (k.thick ? 2 : 1) * px;
        box(`u${n}:${i}`, x0, x1, l.y - fs * 0.62 - thick / 2, thick, ink, 1, text + 1);
      }
    });
  }
  // (the caret - in what the IME has so far, where it says)
  if (!dc || dc.sel[0] === dc.sel[1]) {
    const p = dc ? d.shown.at[dc.from + dc.sel[1]] : d.places.at[d.sel.head];
    const l = (dc ? d.shown : d.places).lines[p.line];
    box("caret", p.x - (CARET_PX * px) / 2, p.x + (CARET_PX * px) / 2, l.y - fs * 0.05, fs * 1.15, ink, 1, text + 2, caretRef);
  }
  return out;
}

/**
 * Words written in place drawn again as their editor changes - before the
 * next frame, once for all a task changed, as the column's text is
 * (ColumnText): an update made in an event React does not know, an
 * EditContext's textupdate, would wait otherwise for a task after that
 * frame - and as the view moves or zooms; the field laid at the caret each
 * time; the caret blinking while they have the keys. The caret's mesh is
 * the one returned.
 */
export function useWriting(ed: WordsEditor, field: RefObject<TypingField | null>, redraw: () => void): RefObject<THREE.Mesh | null> {
  const { camera, size, invalidate } = useThree();
  const cam = camera as THREE.OrthographicCamera;
  useEffect(() => {
    let due = false;
    ed.onChange = () => {
      if (!due) {
        due = true;
        queueMicrotask(() => {
          due = false;
          flushSync(redraw);
        });
      }
      invalidate();
      field.current?.place();
    };
    return () => {
      ed.onChange = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw: a tick of its own
  }, [ed, invalidate, field]);
  // (drawn again: the field laid at the caret)
  useEffect(() => {
    field.current?.place();
  });
  useEffect(() => {
    const t = window.setInterval(() => ed.focused && invalidate(), BLINK_MS / 2);
    return () => window.clearInterval(t);
  }, [ed, invalidate]);
  const caretRef = useRef<THREE.Mesh>(null);
  const view = useRef("");
  useFrame(() => {
    const now = `${cam.zoom},${cam.position.x},${cam.position.y},${size.width},${size.height}`;
    if (now === view.current) return;
    view.current = now;
    redraw();
  });
  useFrame(() => {
    const since = performance.now() - ed.stirred;
    if (caretRef.current) caretRef.current.visible = ed.focused && (since < BLINK_MS || Math.floor(since / BLINK_MS) % 2 === 0);
  });
  return caretRef;
}

/**
 * A press among words written in place - `among` says where a point of
 * the page is theirs: the caret there, two clicks a word, three a line, a
 * drag selecting on, the field keeping the keys; two clicks or a
 * right-click among them no Quick Add, no menu. `seed`, the press that
 * opened them, counted as their first click. Off while `off`.
 */
export function usePressAmong(o: {
  ed: WordsEditor;
  field: RefObject<TypingField | null>;
  among: RefObject<(q: Pt) => boolean>;
  world: RefObject<(cx: number, cy: number) => Pt>;
  seed?: CaptionPress;
  off: boolean;
}): void {
  const { gl } = useThree();
  useEffect(() => {
    if (o.off) return;
    const { ed, field } = o;
    const toWorld = o.world.current;
    const hit = (e: MouseEvent) => {
      if (e.target !== gl.domElement) return null;
      const q = toWorld(e.clientX, e.clientY);
      return o.among.current(q) ? q : null;
    };
    const p = o.seed;
    let last = p && !p.drag ? { t: p.t, x: p.client.x, y: p.client.y, clicks: 1 } : { t: 0, x: 0, y: 0, clicks: 0 };
    const onDown = (e: PointerEvent) => {
      const q = hit(e);
      // (elsewhere: the press its own, the words kept as the field lets the keys go)
      if (!q) return;
      // (theirs: no box begun, no view moved - nor the field's keys let go)
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return;
      const now = performance.now();
      const clicks = now - last.t < CLICKS_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < CLICKS_PX ? Math.min(3, last.clicks + 1) : 1;
      last = { t: now, x: e.clientX, y: e.clientY, clicks };
      const from = ed.pressAt(q, clicks, e.shiftKey);
      field.current?.focus();
      field.current?.sync();
      const onMove = (m: PointerEvent) => ed.dragTo(toWorld(m.clientX, m.clientY), from, clicks);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        field.current?.sync();
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    };
    const swallow = (e: MouseEvent) => {
      if (!hit(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    // (a right-click among them: Meno's menu for the words - the caret put there first, where nothing is selected)
    const onMenu = (e: MouseEvent) => {
      const q = hit(e);
      if (!q) return;
      e.preventDefault();
      e.stopPropagation();
      if (selFrom(ed.sel) === selTo(ed.sel)) {
        ed.pressAt(q, 1, false);
        field.current?.sync();
      }
      useTextMenu.getState().open(e.clientX, e.clientY, fieldTarget(ed, () => field.current));
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("dblclick", swallow, true);
    window.addEventListener("contextmenu", onMenu, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("dblclick", swallow, true);
      window.removeEventListener("contextmenu", onMenu, true);
    };
    // (the press that opened them, once - as they open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.ed, gl, o.off]);
}
