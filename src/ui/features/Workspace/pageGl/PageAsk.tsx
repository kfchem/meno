import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type * as THREE from "three";
import PageHtml from "../components/PageHtml";
import { askArea, askBox, askKey, askParts, caretOf, caretSpot, firstLineShown, movedBy, placeAtPoint, ASK } from "./askField";
import { useEasedValues } from "./faded";
import { pressAt } from "./field";
import type { Rect } from "./hits";
import PageLayer from "./PageLayer";
import type { HitHandlers } from "./PageHits";
import { FIELD_ORDER } from "./PageField";
import { pageAtScreen } from "../utils/page";
import { pagePx } from "./units";

/** How long the caret stays, then goes, at rest; how long after a key it stays still (as PageField's). */
const BLINK_MS = 530;
const STILL_MS = 600;

/**
 * The field a conversation is asked in, at the foot of its card
 * (docs/CONVERSATIONS.md, *The Conversation object*): drawn by WebGL
 * (pageGl/askField), typed into a real field laid unseen at the caret, so
 * that keys, an input method, pasting and undoing are the system's own -
 * as a set's name is (pageGl/PageField). Several lines: Enter asks
 * (`onAsk`), Shift+Enter starts another, Escape leaves it. A press in it
 * places the caret, a drag selects, a double press selects a word; a
 * press away, or another field, leaves it, what is typed kept as `value`
 * (the card's draft). While the model works it says so and Stop is beside
 * it. The real field is there only while this one is typed in.
 *
 * Up, Down, Home and End go by the lines drawn - the system's field breaks
 * lines by its own font.
 */
export default function PageAsk({
  fieldKey,
  rect,
  widthPx,
  value,
  onValue,
  running,
  noModel,
  words,
  opacity,
  noHits,
  onAsk,
  onStop,
}: {
  fieldKey: string;
  /** The card's rectangle (the page's units, y up), and its width in page px. */
  rect: Rect;
  widthPx: number;
  /** What is typed - the card's draft - and told as it changes. */
  value: string;
  onValue: (value: string) => void;
  running: boolean;
  noModel: boolean;
  words: number;
  opacity: number;
  noHits?: boolean;
  /** Enter, with something typed: ask it. Told what was typed; the field is then emptied. */
  onAsk: (text: string) => void;
  onStop: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState(false);
  const [sel, setSel] = useState<[number, number]>([value.length, value.length]);
  const [composing, setComposing] = useState<[number, number] | null>(null);
  const composeFrom = useRef(0);
  // (between an input method's start and its end: an update heard after its end - WebKit's, the words put in - composes nothing)
  const composingNow = useRef(false);
  const typedAt = useRef(performance.now());
  const [blinkOn, setBlinkOn] = useState(true);
  // (a press of its own: the field keeps its focus, not left by the blur the press brings)
  const pressed = useRef(false);
  const lastDown = useRef(-Infinity);
  // (where a press that made it typed in puts the caret, once its real field is there)
  const pending = useRef<[number, number] | null>(null);
  // (the column Up and Down keep going along)
  const goal = useRef<number | null>(null);
  const first = useRef(0);
  const { camera, gl } = useThree();
  const zoom = (camera as THREE.OrthographicCamera).zoom || 1;

  const area = askArea(value, widthPx, running);
  const end = Math.min(sel[1], value.length);
  const caretLine = caretOf(value, area.lines, end).line;
  first.current = firstLineShown(area.lines.length, caretLine, first.current);

  /** What the real field holds and selects, read back after anything changes it. */
  const sync = () => {
    const el = input.current;
    if (!el) return;
    if (el.value !== value) onValue(el.value);
    setSel([el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]);
    typedAt.current = performance.now();
    setBlinkOn(true);
  };
  // (the real field as it comes, focused, the caret where the press that made it typed in put it: its callback is one for good, never told of each render)
  const syncNow = useRef(sync);
  syncNow.current = sync;
  const attach = useCallback((el: HTMLTextAreaElement | null) => {
    input.current = el;
    if (!el) return;
    el.focus({ preventScroll: true });
    const at = pending.current ?? [el.value.length, el.value.length];
    pending.current = null;
    el.setSelectionRange(at[0], at[1]);
    syncNow.current();
  }, []);
  useEffect(() => {
    const onSelection = () => {
      if (input.current && document.activeElement === input.current) sync();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  });
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setBlinkOn((on) => (performance.now() - typedAt.current < STILL_MS ? true : !on)), BLINK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  // (while the model works the real field is gone, and the person is no longer typing in it)
  useEffect(() => {
    if (running) setActive(false);
  }, [running]);
  const caret = useEasedValues(new Map([["caret", blinkOn ? 1 : 0]]), 120).get("caret") ?? 1;

  /** What `value` is at a point on the page: its place, by the lines drawn. */
  const placeOf = (page: { x: number; y: number }, text: string) => {
    const box = askBox(widthPx, area.heightPx, Math.min(area.lines.length, ASK.most), area.stop);
    const px = (page.x - rect.x0) / pagePx(1) - box.left - ASK.padX;
    const py = (rect.y0 + pagePx(area.heightPx) - page.y) / pagePx(1) - box.top - ASK.padY;
    return placeAtPoint(text, area.lines, first.current, px, py);
  };
  const place = (from: number, to: number) => {
    const el = input.current;
    if (!el) {
      pending.current = [Math.min(from, to), Math.max(from, to)];
      return;
    }
    el.focus({ preventScroll: true });
    el.setSelectionRange(Math.min(from, to), Math.max(from, to), from <= to ? "forward" : "backward");
    sync();
  };
  const on: HitHandlers = {
    down: (_key, part, e) => {
      if (part === "stop") {
        onStop();
        return;
      }
      if (running) return;
      pressed.current = true;
      goal.current = null;
      const i = placeOf(e.page, value);
      const press = pressAt({ value, i, at: performance.now(), lastDown: lastDown.current, shift: (e.event as PointerEvent).shiftKey, selected: sel });
      lastDown.current = press.lastDown;
      setActive(true);
      place(press.select[0], press.select[1]);
      const anchor = press.select[0];
      const move = (m: PointerEvent) => place(anchor, placeOf(pageAtScreen({ x: m.clientX, y: m.clientY }, gl.domElement, camera), input.current?.value ?? value));
      const up = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", up, true);
        pressed.current = false;
        input.current?.focus({ preventScroll: true });
      };
      if (press.drag) window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", up, true);
    },
  };

  const parts = askParts({
    key: fieldKey,
    rect,
    widthPx,
    value,
    start: sel[0],
    end: sel[1],
    focused: active,
    ...(composing ? { composing } : {}),
    first: first.current,
    caret: active ? caret : 0,
    running,
    noModel,
    words,
    opacity,
  });
  const spot = caretSpot(value, area.lines, end, first.current, widthPx, area.heightPx);
  const screenPx = pagePx(ASK.size) * zoom;
  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    top: -screenPx * 0.7,
    width: 1,
    height: screenPx * 1.4,
    padding: 0,
    border: 0,
    outline: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    fontSize: screenPx,
    lineHeight: `${screenPx * 1.4}px`,
    // (nothing of it seen, not even an input method's own line under what it composes; laid out all the same, for its candidates)
    opacity: 0,
    color: "transparent",
    caretColor: "transparent",
    background: "transparent",
    pointerEvents: "none",
  };
  return (
    <>
      <PageLayer shapes={parts.shapes} texts={parts.texts} regions={noHits ? [] : parts.regions} on={on} order={FIELD_ORDER} />
      {active && !running && (
        <group position={[rect.x0 + pagePx(spot.x), rect.y0 + pagePx(area.heightPx) - pagePx(spot.y), 0]}>
          <PageHtml zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}>
            <textarea
              ref={attach}
              aria-label="Message"
              defaultValue={value}
              wrap="off"
              spellCheck={false}
              autoComplete="off"
              style={style}
              onInput={(e) => {
                // (what an input method composed, put in: composing no more)
                if (!(e.nativeEvent as InputEvent).isComposing) setComposing(null);
                goal.current = null;
                sync();
              }}
              onSelect={sync}
              onKeyUp={sync}
              onCompositionStart={() => {
                composingNow.current = true;
                composeFrom.current = input.current?.selectionStart ?? 0;
              }}
              onCompositionUpdate={(e) => {
                if (composingNow.current) setComposing([composeFrom.current, composeFrom.current + e.data.length]);
                sync();
              }}
              onCompositionEnd={() => {
                composingNow.current = false;
                setComposing(null);
                sync();
                // (its selection read again once the field has settled it)
                requestAnimationFrame(sync);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                const el = e.currentTarget;
                // (a key an input method takes - its Enter choosing a candidate - is its)
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                const k = askKey(e.nativeEvent);
                if (k === "ask") {
                  e.preventDefault();
                  if (noModel || !el.value.trim()) return;
                  const text = el.value;
                  el.value = "";
                  onValue("");
                  setSel([0, 0]);
                  onAsk(text);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  el.blur();
                  return;
                }
                if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                  // (by the lines drawn: from where the selection's moving end is - shift keeps the other end)
                  const from = el.selectionDirection === "backward" ? el.selectionStart : el.selectionEnd;
                  const lines = askArea(el.value, widthPx, false).lines;
                  const moved = movedBy(e.key, el.value, lines, from ?? el.value.length, goal.current);
                  if (moved) {
                    e.preventDefault();
                    goal.current = moved.goal;
                    const anchor = el.selectionDirection === "backward" ? el.selectionEnd : el.selectionStart;
                    if (e.shiftKey) place(anchor ?? moved.place, moved.place);
                    else place(moved.place, moved.place);
                    return;
                  }
                }
                goal.current = null;
                requestAnimationFrame(sync);
              }}
              onBlur={() => {
                if (pressed.current) {
                  window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
                  return;
                }
                sync();
                setActive(false);
                setComposing(null);
              }}
            />
          </PageHtml>
        </group>
      )}
    </>
  );
}
