/**
 * A Markdown text read in the column, formatted, its HTML half (docs/
 * PDF.md, *Markdown*): see-through, over the canvas, which draws it under
 * it (Workspace components/MarkdownText). It takes the wheel - the text
 * moves - and the pointer: a drag selects its words, two clicks a word,
 * three a paragraph, and a click on a link follows it - a heading of the
 * text's, gone to; the web's and mail's, opened by the system - and the
 * keys: Cmd/Ctrl+C copies what is selected, Cmd/Ctrl+A selects it all, the
 * arrows, Page Up and Down, Home and End move it.
 */
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeClipboard } from "../../../lib/clipboard";
import { isWebAddress } from "../../../lib/pdf/reader";
import type { ColumnTextEntry } from "./columnText";
import type { MarkdownReader } from "./markdownReader";
import { LINE } from "./markdownLayout";

/** How far a press may move and still be a click on a link, in pixels. */
const CLICK_PX = 4;
/** How far an arrow key moves the text, in pixels; Page Up or Down, as a share of what is seen. */
const ARROW_PX = 3 * LINE;
const PAGE_SHARE = 0.9;

type Props = { entry: ColumnTextEntry; reader: MarkdownReader; value: string };

export default function MarkdownBody({ entry, reader, value }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  // (anything drawn changed: the canvas asked to draw it again)
  useEffect(() => {
    reader.onChange = () => entry.redraw();
    return () => {
      reader.onChange = () => {};
      reader.focused = false;
    };
  }, [reader, entry]);
  useEffect(() => reader.setText(value), [reader, value]);

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const sized = () => reader.setView(box.clientWidth, box.clientHeight);
    const seen = new ResizeObserver(sized);
    seen.observe(box);
    sized();
    // (the wheel, and a trackpad's two fingers: the text moved, not the column)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) return;
      const k = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? reader.viewH : 1;
      reader.scrollTo(reader.scrollTop + (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      seen.disconnect();
      box.removeEventListener("wheel", onWheel);
    };
  }, [reader]);

  const point = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** A link followed: a heading of the text's gone to; the web's and mail's opened by the system; any other not. */
  const follow = (href: string) => {
    if (href.startsWith("#")) {
      let slug = href.slice(1);
      try {
        slug = decodeURIComponent(slug);
      } catch {
        // (as written)
      }
      reader.goToHeading(slug);
    } else if (isWebAddress(href)) void openUrl(href.trim()).catch(() => {});
  };

  // (a press: what is selected let go, or drawn on with Shift; a drag selects on, the text moving on past its edges; a click on a link follows it)
  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    boxRef.current!.focus();
    reader.focused = true;
    const p0 = point(e);
    const clicks = Math.min(e.detail || 1, 3);
    const link = clicks === 1 && !e.shiftKey ? reader.linkAt(p0.x, p0.y) : null;
    const from = reader.pressAt(p0.x, p0.y, clicks, e.shiftKey);
    let moved = false;
    const onMove = (m: MouseEvent) => {
      const p = point(m);
      if (!moved && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < CLICK_PX) return;
      moved = true;
      if (p.y < 0) reader.scrollTo(reader.scrollTop + p.y / 2);
      else if (p.y > reader.viewH) reader.scrollTo(reader.scrollTop + (p.y - reader.viewH) / 2);
      reader.dragTo(p.x, p.y, from, clicks);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (link && !moved) follow(link);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // (over a link, the system's hand)
  const onMouseMove = (e: ReactMouseEvent) => {
    const p = point(e);
    const want = reader.linkAt(p.x, p.y) ? "pointer" : "text";
    if (boxRef.current!.style.cursor !== want) boxRef.current!.style.cursor = want;
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const at = (top: number) => {
      e.preventDefault();
      reader.scrollTo(top);
    };
    if (mod && key === "c") {
      e.preventDefault();
      const words = reader.selected;
      if (words) void writeClipboard([{ flavor: "text", text: words }]).catch(() => {});
    } else if (mod && key === "a") {
      e.preventDefault();
      reader.selectAll();
    } else if (e.key === "Escape") reader.select({ anchor: reader.sel.head, head: reader.sel.head });
    else if (e.key === "Home" || (mod && e.key === "ArrowUp")) at(0);
    else if (e.key === "End" || (mod && e.key === "ArrowDown")) at(reader.mostTop);
    else if (e.key === "ArrowDown") at(reader.scrollTop + ARROW_PX);
    else if (e.key === "ArrowUp") at(reader.scrollTop - ARROW_PX);
    else if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) at(reader.scrollTop + reader.viewH * PAGE_SHARE);
    else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) at(reader.scrollTop - reader.viewH * PAGE_SHARE);
  };

  return (
    <div
      ref={boxRef}
      // (its keys its own: Meno's shortcuts let a text field's be)
      data-text-field=""
      tabIndex={-1}
      aria-label="Text"
      className="relative w-full h-full overflow-hidden cursor-text outline-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onKeyDown={onKeyDown}
      onFocus={() => {
        reader.focused = true;
        entry.redraw();
      }}
      onBlur={() => {
        reader.focused = false;
        entry.redraw();
      }}
    />
  );
}
