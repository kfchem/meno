import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type * as THREE from "three";
import PageHtml from "../components/PageHtml";
import { useEasedValues } from "./faded";
import { caretPx, fieldParts, indexAt, wordAt } from "./field";
import PageLayer from "./PageLayer";
import type { HitHandlers } from "./PageHits";
import { pageAtScreen } from "../utils/page";
import { PAGE_GL_ORDER } from "./PageShapes";
import type { Weight } from "./texts";
import { pagePx } from "./units";

/** A field's order on the page: over the frames, the cards and the chips; under the ports (Workflow2D PORTS_ORDER). */
export const FIELD_ORDER = PAGE_GL_ORDER + 3;
/** How long the caret stays, then goes, at rest; how long after a key it stays still. */
const BLINK_MS = 530;
const STILL_MS = 600;
/** How soon a second press is a double one's, in ms. */
const DOUBLE_MS = 400;

/**
 * A short field typed into where it stands on the page - a set's name,
 * named anew (docs/WORKSPACE.md, *Drawn by WebGL*): drawn by WebGL
 * (pageGl/field), typed into a real field laid unseen at its caret, so that
 * keys, an input method - its candidates beside the words - pasting,
 * undoing and a screen reader are the system's own. Enter, or a press away,
 * keeps what it holds (`onDone` with it); Escape leaves it as it was
 * (`onDone(null)`). A press in it places the caret, a drag selects, a
 * double press selects a word.
 */
export default function PageField({
  fieldKey,
  x,
  y,
  initial,
  sizePx,
  weight = 400,
  label,
  onDone,
}: {
  fieldKey: string;
  /** Where its words start, and their middle (the page's units). */
  x: number;
  y: number;
  initial: string;
  sizePx: number;
  weight?: Weight;
  /** What it is, said to a screen reader: "Set name". */
  label: string;
  onDone: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [sel, setSel] = useState<[number, number]>([0, initial.length]);
  const [composing, setComposing] = useState<[number, number] | null>(null);
  const composeFrom = useRef(0);
  // (between an input method's start and its end: an update heard after its end - WebKit's, the words put in - composes nothing)
  const composingNow = useRef(false);
  const typedAt = useRef(performance.now());
  const [blinkOn, setBlinkOn] = useState(true);
  // (a press of its own: the field keeps its focus, not finished by the blur the press brings)
  const pressed = useRef(false);
  const done = useRef(false);
  const lastDown = useRef(0);
  const { camera, gl } = useThree();
  const zoom = (camera as THREE.OrthographicCamera).zoom || 1;

  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  /** What the real field holds and selects, read back after anything changes it. */
  const sync = () => {
    const el = input.current;
    if (!el) return;
    setValue(el.value);
    setSel([el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]);
    typedAt.current = performance.now();
    setBlinkOn(true);
  };
  // (focused, all selected, as it comes - when its element does: drei's Html mounts what it holds a moment after this does)
  const focused = useRef(false);
  const attach = (el: HTMLInputElement | null) => {
    input.current = el;
    if (el && !focused.current) {
      focused.current = true;
      el.focus({ preventScroll: true });
      el.select();
    }
  };
  useEffect(() => {
    const onSelection = () => {
      if (input.current && document.activeElement === input.current) sync();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);
  // (the caret blinking at rest, still while keys come)
  useEffect(() => {
    const id = window.setInterval(() => setBlinkOn((on) => (performance.now() - typedAt.current < STILL_MS ? true : !on)), BLINK_MS);
    return () => window.clearInterval(id);
  }, []);
  const caret = useEasedValues(new Map([["caret", blinkOn ? 1 : 0]]), 120).get("caret") ?? 1;

  const pxAt = (pageX: number) => (pageX - x) / pagePx(1);
  const place = (from: number, to: number) => {
    const el = input.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(Math.min(from, to), Math.max(from, to), from <= to ? "forward" : "backward");
    sync();
  };
  const on: HitHandlers = {
    down: (_key, _part, e) => {
      pressed.current = true;
      const i = indexAt(value, pxAt(e.page.x), sizePx, weight);
      const now = performance.now();
      if (now - lastDown.current < DOUBLE_MS) {
        lastDown.current = 0;
        const [a, b] = wordAt(value, i);
        place(a, b);
        return;
      }
      lastDown.current = now;
      const anchor = (e.event as PointerEvent).shiftKey ? sel[0] : i;
      place(anchor, i);
      // (a drag from it selects, wherever the pointer goes meanwhile)
      const move = (m: PointerEvent) => place(anchor, indexAt(value, pxAt(pageAtScreen({ x: m.clientX, y: m.clientY }, gl.domElement, camera).x), sizePx, weight));
      const up = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        pressed.current = false;
        input.current?.focus({ preventScroll: true });
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
    },
  };

  const parts = fieldParts({ key: fieldKey, x, y, value, start: sel[0], end: sel[1], ...(composing ? { composing } : {}), sizePx, weight, caret: document.activeElement === input.current || !input.current ? caret : 0 });
  // (the real field, unseen, at the caret: an input method's candidates open beside the words)
  const screenPx = pagePx(sizePx) * zoom;
  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    top: -screenPx * 0.7,
    width: 1,
    height: screenPx * 1.4,
    padding: 0,
    border: 0,
    outline: "none",
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
      <PageLayer shapes={parts.shapes} texts={parts.texts} regions={[parts.region]} on={on} order={FIELD_ORDER} />
      <group position={[x + pagePx(caretPx(value, sel[1], sizePx, weight)), y, 0]}>
        <PageHtml zIndexRange={[40, 30]} style={{ pointerEvents: "none" }}>
          <input
            ref={attach}
            aria-label={label}
            defaultValue={initial}
            spellCheck={false}
            autoComplete="off"
            style={style}
            onInput={(e) => {
              // (what an input method composed, put in: composing no more)
              if (!(e.nativeEvent as InputEvent).isComposing) setComposing(null);
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
              // (a key an input method takes - its Enter choosing a candidate - is its)
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") finish(input.current?.value ?? value);
              else if (e.key === "Escape") finish(null);
              else requestAnimationFrame(sync);
            }}
            onBlur={() => {
              if (pressed.current) {
                window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
                return;
              }
              finish(input.current?.value ?? value);
            }}
          />
        </PageHtml>
      </group>
    </>
  );
}
