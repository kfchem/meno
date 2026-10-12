/**
 * A text read in the column, its HTML half (docs/PDF.md, *A text*): see-
 * through, over the canvas, which draws the text under it (Workspace
 * components/ColumnText). It takes the pointer - a click puts the caret,
 * two select a word, three a line, a drag selects on - and the wheel, and
 * holds the field the text is typed through (typingField), kept out of
 * sight under the drawing. One growing at its end - a job's log - keeps its
 * last lines in view, unless it was scrolled up from them.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { ColumnTextEntry } from "./columnText";
import { FONT, LINE_PX, TAB } from "./linePictures";
import { hasEditContext, typingField, type TypingField } from "./typingField";

/** `write`: a text just made to be written in, given the keys as it shows - `onWrite` told once it has them. */
type Props = { entry: ColumnTextEntry; value: string; onChange: (v: string) => void; write?: boolean; onWrite?: () => void };

export default function TextBody({ entry, value, onChange, write = false, onWrite }: Props) {
  const ed = entry.ed;
  const boxRef = useRef<HTMLDivElement>(null);
  // (typed through an EditContext on the text's own element, where the webview has one; else a textarea)
  const ec = useMemo(hasEditContext, []);
  const fieldRef = useRef<HTMLTextAreaElement & HTMLDivElement>(null);
  const field = useRef<TypingField | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  // (typed: the workspace's text changed, one step to undo for a run of typing - its own coalescing)
  useEffect(() => {
    ed.onEdited = (t) => changed.current(t);
    return () => {
      ed.onEdited = () => {};
    };
  }, [ed]);
  // (anything drawn changed: the canvas asked to draw it again, the field laid at the caret)
  useEffect(() => {
    ed.onChange = () => {
      entry.redraw();
      field.current?.place();
    };
    return () => {
      ed.onChange = () => entry.redraw();
    };
  }, [ed, entry]);
  // (changed from outside - a job's log grown, an undo)
  useEffect(() => {
    ed.setText(value);
    field.current?.sync();
  }, [ed, value]);

  useLayoutEffect(() => {
    const f = typingField(fieldRef.current!, ed);
    field.current = f;
    return () => {
      f.dispose();
      field.current = null;
      ed.focused = false;
    };
  }, [ed]);
  // (a text just made to be written in - New text: the keys its own as it shows, the caret at its start)
  const wrote = useRef(onWrite);
  wrote.current = onWrite;
  useEffect(() => {
    if (!write || !field.current) return;
    field.current.focus();
    wrote.current?.();
  }, [write]);

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const sized = () => {
      ed.viewW = box.clientWidth;
      ed.viewH = box.clientHeight;
      ed.scrollTo(ed.scrollTop);
      ed.onChange();
    };
    const seen = new ResizeObserver(sized);
    seen.observe(box);
    sized();
    // (the wheel, and a trackpad's two fingers: the text scrolled, not the column)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) return;
      const k = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? ed.viewH : 1;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      ed.scrollTo(ed.scrollTop + dy * k, ed.scrollLeft + dx * k);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      seen.disconnect();
      box.removeEventListener("wheel", onWheel);
    };
  }, [ed]);

  // (a press: the caret there, the field given the keys; a drag selects on, the text scrolling on past its edges)
  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    field.current?.focus();
    const box = boxRef.current!.getBoundingClientRect();
    const clicks = Math.min(e.detail || 1, 3);
    const from = ed.pressAt(e.clientX - box.left, e.clientY - box.top, clicks, e.shiftKey);
    field.current?.sync();
    const onMove = (m: MouseEvent) => {
      const y = m.clientY - box.top;
      if (y < 0) ed.scrollTo(ed.scrollTop + y / 2);
      else if (y > ed.viewH) ed.scrollTo(ed.scrollTop + (y - ed.viewH) / 2);
      ed.dragTo(m.clientX - box.left, y, from, clicks);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      field.current?.sync();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={boxRef}
      className="relative w-full h-full overflow-hidden cursor-text"
      onMouseDown={onMouseDown}
      // (the field, laid at the caret, never scrolls the text's box to show itself)
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      {ec ? (
        <div ref={fieldRef} data-text-field="" tabIndex={-1} aria-label="Text" style={{ position: "absolute", inset: 0, outline: "none" }} />
      ) : (
        <textarea
          ref={fieldRef}
          data-text-field=""
          aria-label="Text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          wrap="off"
          style={{
            position: "absolute",
            margin: 0,
            padding: 0,
            border: 0,
            outline: "none",
            resize: "none",
            overflow: "hidden",
            whiteSpace: "pre",
            font: FONT,
            lineHeight: `${LINE_PX}px`,
            tabSize: TAB,
            color: "transparent",
            background: "transparent",
            caretColor: "transparent",
            // (nothing of it seen - its selection, the IME's marks - over the drawing it lies on)
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
